(function () {
  'use strict';

  // `.ak-renderer-document` is used for both the description and every comment
  // body. Blocking clicks on any of them prevents accidental entry into edit
  // mode. Comments are wrapped in `.is-comment`; description isn't.
  const BODY_SELECTOR = '.ak-renderer-document';
  const TITLE_SELECTOR = 'h1[data-testid="issue.views.issue-base.foundation.summary.heading"]';
  const BUTTON_ID = 'jira-noedit-toggle';
  const STORAGE_KEY = 'jira-noedit-blocked';
  const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]*-\d+$/;
  const BREADCRUMB_WALK_MAX = 6;

  // Persist toggle state across reloads. Default to blocked if unset.
  let editBlocked = localStorage.getItem(STORAGE_KEY) !== 'false';

  function addFloatingButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = editBlocked ? '🔒' : '🔓';
    btn.title = 'Toggle Jira click-to-edit block (title, description, comments)';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      zIndex: '2147483647',
      padding: '6px 10px',
      fontSize: '16px',
      lineHeight: '1',
      background: 'rgba(255,255,255,0.9)',
      border: '1px solid #ccc',
      borderRadius: '6px',
      cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
    });

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editBlocked = !editBlocked;
      localStorage.setItem(STORAGE_KEY, String(editBlocked));
      btn.textContent = editBlocked ? '🔒' : '🔓';
      console.log('[jira-noedit] edit', editBlocked ? 'BLOCKED' : 'ALLOWED');
    });

    document.body.appendChild(btn);
  }

  function getCurrentIssueKey() {
    const m = window.location.pathname.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/);
    return m ? m[1] : null;
  }

  // The breadcrumb's last crumb is the current issue's key as clickable text,
  // and clicking it kicks the page into edit mode. Detect it by: clicked
  // element (or a close ancestor) whose trimmed text equals the current URL's
  // issue key, or an <a> whose href points to the current issue.
  function isCurrentIssueSelfReference(target) {
    const key = getCurrentIssueKey();
    if (!key || !ISSUE_KEY_RE.test(key)) return false;

    let node = target;
    for (let i = 0; i < BREADCRUMB_WALK_MAX && node; i++) {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        if (new RegExp(`/browse/${key}(?:[/?#]|$)`).test(href)) return true;
      }
      const text = (node.textContent || '').trim();
      if (text === key) return true;
      node = node.parentElement;
    }
    return false;
  }

  function blockClicks(e) {
    if (!editBlocked) return;
    if (
      e.target.closest(BODY_SELECTOR) ||
      e.target.closest(TITLE_SELECTOR) ||
      isCurrentIssueSelfReference(e.target)
    ) {
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

  // Button lives as a direct child of `body`. Body persists across Jira's SPA
  // route changes. Narrow observer to body childList (no subtree) to re-add
  // the button if anything removes it. Cheap — one getElementById per mutation.
  function startObserver() {
    const observer = new MutationObserver(addFloatingButton);
    observer.observe(document.body, { childList: true });
  }

  if (document.body) {
    addFloatingButton();
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      addFloatingButton();
      startObserver();
    }, { once: true });
  }
})();
