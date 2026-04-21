(function () {
  'use strict';

  const BODY_SELECTOR = '.ak-renderer-document';
  const TITLE_SELECTOR = 'h1[data-testid="issue.views.issue-base.foundation.summary.heading"]';
  const HEADING_TEXT = /description/i;
  const BUTTON_ID = 'jira-noedit-toggle';
  const STORAGE_KEY = 'jira-noedit-blocked';
  const HEADING_WALK_MAX = 10;

  // Persist toggle state across reloads. Default to blocked if unset.
  let editBlocked = localStorage.getItem(STORAGE_KEY) !== 'false';

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = editBlocked ? '🔒' : '🔓';
    btn.title = 'Toggle Jira click-to-edit block';
    Object.assign(btn.style, {
      margin: '0 0 8px 0',
      padding: '4px 10px',
      fontSize: '14px',
      lineHeight: '1.2',
      background: 'rgba(255,255,255,0.9)',
      border: '1px solid #ccc',
      borderRadius: '6px',
      cursor: 'pointer',
      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editBlocked = !editBlocked;
      localStorage.setItem(STORAGE_KEY, String(editBlocked));
      btn.textContent = editBlocked ? '🔒' : '🔓';
      console.log('[jira-noedit] edit', editBlocked ? 'BLOCKED' : 'ALLOWED');
    });

    return btn;
  }

  // Walk up from the renderer looking for an ancestor whose subtree also
  // contains a "Description" heading in a sibling branch. That ancestor is
  // the field section; inserting before `node` lands the button between the
  // heading and the content box regardless of how many styled wrappers Jira
  // nests the renderer in.
  function findInsertionPoint() {
    const renderer = document.querySelector(BODY_SELECTOR);
    if (!renderer) return null;

    let node = renderer;
    for (let i = 0; i < HEADING_WALK_MAX && node.parentElement; i++) {
      const parent = node.parentElement;
      const headings = parent.querySelectorAll('h1, h2, h3, h4, [role="heading"]');
      for (const h of headings) {
        if (HEADING_TEXT.test(h.textContent || '') && !node.contains(h)) {
          return { parent, before: node };
        }
      }
      node = parent;
    }
    return null;
  }

  function placeButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const point = findInsertionPoint();
    if (!point) return;
    point.parent.insertBefore(buildButton(), point.before);
  }

  function blockClicks(e) {
    if (!editBlocked) return;
    if (e.target.id === BUTTON_ID) return;
    if (e.target.closest(BODY_SELECTOR) || e.target.closest(TITLE_SELECTOR)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      console.log('[jira-noedit] click-to-edit blocked on', e.target);
    }
  }

  // Esc while focus is inside any contenteditable → click the nearest Cancel
  // button walking up the DOM. Saves scrolling to the bottom of long AI-written
  // descriptions after accidental entry into edit mode.
  // Bubble phase (not capture) so Atlaskit editor handlers get Esc first
  // (mention popups, autocomplete, etc. can dismiss and stopPropagation).
  function handleEscape(e) {
    if (e.key !== 'Escape') return;
    const active = document.activeElement;
    if (!active) return;
    const editor = active.closest('[contenteditable="true"]');
    if (!editor) return;

    let container = editor.parentElement;
    while (container) {
      const buttons = container.querySelectorAll('button');
      for (const b of buttons) {
        if ((b.textContent || '').trim() === 'Cancel') {
          b.click();
          console.log('[jira-noedit] Esc → Cancel clicked');
          return;
        }
      }
      container = container.parentElement;
    }
  }

  document.addEventListener('click', blockClicks, true);
  document.addEventListener('keydown', handleEscape, false);

  // Anchored placement needs to react to renderer appearing anywhere in the
  // subtree (SPA nav into an issue, edit-mode → read-mode transition, etc.),
  // so subtree:true is required here. Callback is cheap (id + selector check).
  function startObserver() {
    const observer = new MutationObserver(placeButton);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) {
    placeButton();
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      placeButton();
      startObserver();
    }, { once: true });
  }
})();
