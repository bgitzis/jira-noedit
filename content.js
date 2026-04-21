(function () {
  'use strict';

  // `.ak-renderer-document` is used for the description and every comment
  // body (and, confusingly, has `.is-comment` on one of its wrappers for
  // descriptions too — ignore that class, it's not a reliable "is comment"
  // signal). Blocking clicks on any `.ak-renderer-document` prevents
  // accidental entry into edit mode on any of them.
  const BODY_SELECTOR = '.ak-renderer-document';
  const TITLE_SELECTOR = 'h1[data-testid="issue.views.issue-base.foundation.summary.heading"]';
  const BREADCRUMB_CRUMB_TESTID = 'issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container';
  const CANCEL_BUTTON_TESTID = 'comment-cancel-button';
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
      top: '70px',
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

  // Breadcrumb anchor preference:
  //   1. The stable Atlaskit testid container — most robust.
  //   2. An <a href="/browse/<KEY>"> with text = KEY — heuristic fallback.
  //   3. Any short-text element at the top of the viewport with text = KEY.
  // Returns { parent, after } describing where to insert the toggle button,
  // or null if we can't find an anchor.
  function findBreadcrumbAnchor() {
    const container = document.querySelector(`[data-testid="${BREADCRUMB_CRUMB_TESTID}"]`);
    if (container) return { parent: container, after: container.lastElementChild };

    const key = getCurrentIssueKey();
    if (!key || !ISSUE_KEY_RE.test(key)) return null;

    const selfHrefRe = new RegExp(`/browse/${key}(?:[/?#]|$)`);
    const links = document.querySelectorAll('a[href]');
    for (const a of links) {
      if (!selfHrefRe.test(a.getAttribute('href') || '')) continue;
      if ((a.textContent || '').trim() === key && a.parentElement) {
        return { parent: a.parentElement, after: a };
      }
    }

    const candidates = document.querySelectorAll('a, button, span');
    for (const el of candidates) {
      if ((el.textContent || '').trim() !== key) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < BREADCRUMB_TOP_MAX_PX && el.parentElement) {
        return { parent: el.parentElement, after: el };
      }
    }

    return null;
  }

  function placeButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = buildButton();
    const anchor = findBreadcrumbAnchor();

    if (anchor) {
      styleInline(btn);
      const refNode = anchor.after ? anchor.after.nextSibling : anchor.parent.firstChild;
      anchor.parent.insertBefore(btn, refNode);
    } else {
      styleFloating(btn);
      document.body.appendChild(btn);
    }
  }

  function isCurrentIssueSelfReference(target) {
    const key = getCurrentIssueKey();
    if (!key || !ISSUE_KEY_RE.test(key)) return false;

    const selfHrefRe = new RegExp(`/browse/${key}(?:[/?#]|$)`);
    let node = target;
    for (let i = 0; i < BREADCRUMB_WALK_MAX && node; i++) {
      if (node.id === BUTTON_ID) return false;
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

  // Esc while focus is inside any contenteditable → click the Atlaskit
  // Cancel button. Preferred target: [data-testid="comment-cancel-button"]
  // (Atlaskit names it "comment-" for both description and comment editors).
  // Fall back to walking up from the editor looking for a button whose text
  // is exactly "Cancel".
  //
  // Capture phase is mandatory: Atlaskit's editor installs its own Esc
  // handler that closes the editor (without explicitly discarding) before
  // the event reaches document's bubble phase, so a bubble listener never
  // sees Esc at all. Capture runs first, giving us a chance to click Cancel.
  function handleEscape(e) {
    if (e.key !== 'Escape') return;
    const active = document.activeElement;
    if (!active) return;
    const editor = active.closest('[contenteditable="true"]');
    if (!editor) return;

    const byTestId = document.querySelector(`[data-testid="${CANCEL_BUTTON_TESTID}"]`);
    if (byTestId) {
      byTestId.click();
      console.log('[jira-noedit] Esc → Cancel (by testid) clicked');
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }

    let container = editor.parentElement;
    let depth = 0;
    while (container) {
      depth++;
      const buttons = container.querySelectorAll('button');
      for (const b of buttons) {
        if ((b.textContent || '').trim() === 'Cancel') {
          b.click();
          console.log('[jira-noedit] Esc → Cancel (by text) clicked at depth', depth);
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }
      }
      container = container.parentElement;
    }
    console.warn('[jira-noedit] Esc: no Cancel button found walking up from editor', editor);
  }

  document.addEventListener('click', blockClicks, true);
  document.addEventListener('keydown', handleEscape, true);

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
