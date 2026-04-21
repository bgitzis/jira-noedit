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
  const BREADCRUMB_TOP_MAX_PX = 120;

  // Persist toggle state across reloads. Default to blocked if unset.
  let editBlocked = localStorage.getItem(STORAGE_KEY) !== 'false';

  function buildButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = editBlocked ? '🔒' : '🔓';
    btn.title = 'Toggle Jira click-to-edit block (title, description, comments, self-breadcrumb)';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editBlocked = !editBlocked;
      localStorage.setItem(STORAGE_KEY, String(editBlocked));
      btn.textContent = editBlocked ? '🔒' : '🔓';
      console.log('[jira-noedit] edit', editBlocked ? 'BLOCKED' : 'ALLOWED');
    });

    return btn;
  }

  function styleInline(btn) {
    Object.assign(btn.style, {
      marginLeft: '8px',
      padding: '2px 6px',
      fontSize: '14px',
      lineHeight: '1',
      verticalAlign: 'middle',
      background: 'rgba(255,255,255,0.9)',
      border: '1px solid #ccc',
      borderRadius: '6px',
      cursor: 'pointer',
    });
  }

  function styleFloating(btn) {
    Object.assign(btn.style, {
      position: 'fixed',
      top: '70px', // below Jira's top chrome so it doesn't overlap user settings
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
  }

  function getCurrentIssueKey() {
    const m = window.location.pathname.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/);
    return m ? m[1] : null;
  }

  // Find the breadcrumb's current-issue crumb. Preferred signal is an <a>
  // whose href points to /browse/<CURRENT_KEY> with text equal to that key.
  // Fallback: any small element whose trimmed text equals the key and which
  // sits near the top of the viewport (breadcrumb area).
  function findBreadcrumbCrumb() {
    const key = getCurrentIssueKey();
    if (!key || !ISSUE_KEY_RE.test(key)) return null;

    const selfHrefRe = new RegExp(`/browse/${key}(?:[/?#]|$)`);
    const links = document.querySelectorAll('a[href]');
    for (const a of links) {
      if (!selfHrefRe.test(a.getAttribute('href') || '')) continue;
      if ((a.textContent || '').trim() === key) return a;
    }

    const candidates = document.querySelectorAll('a, button, span');
    for (const el of candidates) {
      if ((el.textContent || '').trim() !== key) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < BREADCRUMB_TOP_MAX_PX) return el;
    }
    return null;
  }

  function placeButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = buildButton();
    const crumb = findBreadcrumbCrumb();

    if (crumb && crumb.parentElement) {
      styleInline(btn);
      crumb.parentElement.insertBefore(btn, crumb.nextSibling);
    } else {
      styleFloating(btn);
      document.body.appendChild(btn);
    }
  }

  // Breadcrumb self-reference: element (or a close ancestor) whose trimmed
  // text equals the current URL's issue key, or an <a> whose href points to
  // the current issue. Clicking this self-link in Jira activates summary edit.
  function isCurrentIssueSelfReference(target) {
    const key = getCurrentIssueKey();
    if (!key || !ISSUE_KEY_RE.test(key)) return false;

    const selfHrefRe = new RegExp(`/browse/${key}(?:[/?#]|$)`);
    let node = target;
    for (let i = 0; i < BREADCRUMB_WALK_MAX && node; i++) {
      if (node.id === BUTTON_ID) return false; // never block our own toggle
      if (node.tagName === 'A' && selfHrefRe.test(node.getAttribute('href') || '')) {
        return true;
      }
      if ((node.textContent || '').trim() === key) return true;
      node = node.parentElement;
    }
    return false;
  }

  function blockClicks(e) {
    if (!editBlocked) return;
    if (e.target.id === BUTTON_ID) return;
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
    if (!active) {
      console.log('[jira-noedit] Esc: no active element');
      return;
    }
    const editor = active.closest('[contenteditable="true"]');
    if (!editor) {
      console.log('[jira-noedit] Esc: active element not inside contenteditable', active);
      return;
    }

    let container = editor.parentElement;
    let depth = 0;
    while (container) {
      depth++;
      const buttons = container.querySelectorAll('button');
      for (const b of buttons) {
        if ((b.textContent || '').trim() === 'Cancel') {
          console.log('[jira-noedit] Esc → Cancel clicked at depth', depth);
          b.click();
          return;
        }
      }
      container = container.parentElement;
    }
    console.warn('[jira-noedit] Esc: no Cancel button found walking up from editor', editor);
  }

  document.addEventListener('click', blockClicks, true);
  document.addEventListener('keydown', handleEscape, false);

  // Button may live inside the breadcrumb, which re-renders on SPA nav and
  // route changes. subtree:true is required to detect disappearance anywhere
  // in the tree. Callback is cheap: one getElementById, early-return on hit.
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
