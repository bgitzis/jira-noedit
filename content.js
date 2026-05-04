(function () {
  'use strict';

  // `.ak-renderer-document` is used for the description and every comment
  // body. The `.is-comment` wrapper class is a misnomer — descriptions have
  // it too. Blocking clicks on any `.ak-renderer-document` prevents
  // accidental entry into edit mode on any of them.
  const BODY_SELECTOR = '.ak-renderer-document';
  const TITLE_SELECTOR = 'h1[data-testid="issue.views.issue-base.foundation.summary.heading"]';
  const BREADCRUMB_CRUMB_TESTID = 'issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container';
  const SAVE_BUTTON_TESTID = 'comment-save-button';
  const CANCEL_BUTTON_TESTID = 'comment-cancel-button';
  const EDITOR_CONTAINER_SELECTOR = '[data-testid*="editor-container"]';
  const POPUP_ROLE_SELECTOR = '[role="menu"], [role="listbox"], [role="tooltip"], [role="dialog"]';
  const STATUS_TRANSITION_TESTID = 'issue-field-status.ui.status-view.transition';
  const STATUS_PRIORITY_NAMES = ['to do', 'in progress', 'done'];
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

  // Current issue key from the URL. Handles /browse/KEY (direct issue view)
  // and ?selectedIssue=KEY (board/backlog side-panel views).
  function getCurrentIssueKey() {
    const path = window.location.pathname.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/);
    if (path) return path[1];
    const query = window.location.search.match(/[?&]selectedIssue=([A-Z][A-Z0-9]*-\d+)/);
    if (query) return query[1];
    return null;
  }

  // Breadcrumb anchor priority:
  //   1. Atlaskit stable testid container
  //   2. <a href="/browse/<KEY>"> with text=KEY (URL-match heuristic)
  //   3. Short-text element near viewport top with text=KEY
  // Returns { parent, after } or null.
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

  // Re-evaluate placement on every observer tick. If the button is already
  // where it should be (anchored correctly, or floating correctly when no
  // anchor is available), do nothing. Otherwise remove and re-place.
  //
  // This matters when Jira's context changes: backlog view → opens side
  // panel with breadcrumb, or issue view closes → page becomes non-issue.
  // An earlier version short-circuited on "button exists" and got stuck
  // in floating mode forever after initial load.
  function placeButton() {
    const existing = document.getElementById(BUTTON_ID);
    const anchor = findBreadcrumbAnchor();

    if (existing) {
      const correctlyAnchored = anchor && anchor.parent.contains(existing);
      const correctlyFloating = !anchor
        && existing.style.position === 'fixed'
        && existing.parentElement === document.body;
      if (correctlyAnchored || correctlyFloating) return;
      existing.remove();
    }

    const btn = buildButton();
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

  // Google-sheet-cell behavior: clicking outside an open editor commits
  // the change (clicks Save). Registered before blockClicks in capture
  // phase so save fires even when the outside click targets a blockable
  // element (title/description/breadcrumb self-link).
  function handleClickOutsideSave(e) {
    if (e.target.id === BUTTON_ID) return;

    const editor = document.querySelector('[contenteditable="true"]');
    if (!editor) return;

    const editorContainer = editor.closest(EDITOR_CONTAINER_SELECTOR);
    if (editorContainer && editorContainer.contains(e.target)) return;

    // Atlaskit renders mention typeahead, emoji picker, link inputs, etc.
    // as React portals outside the editor container. Skip clicks in them.
    if (e.target.closest(POPUP_ROLE_SELECTOR)) return;

    const saveBtn = document.querySelector(`[data-testid="${SAVE_BUTTON_TESTID}"]`);
    const cancelBtn = document.querySelector(`[data-testid="${CANCEL_BUTTON_TESTID}"]`);
    if (saveBtn && saveBtn.contains(e.target)) return;
    if (cancelBtn && cancelBtn.contains(e.target)) return;

    if (saveBtn) {
      saveBtn.click();
      console.log('[jira-noedit] click-outside → Save clicked');
    }
  }

  // Esc → Cancel. Capture phase: Atlaskit's editor installs its own Esc
  // handler that silently closes the editor (no save, no Cancel) before
  // the event reaches document's bubble phase. Capture runs first; we
  // stop propagation only when we successfully click Cancel so unrelated
  // Esc handling elsewhere still works.
  //
  // No text-match fallback: if `comment-cancel-button` testid drifts, a
  // text match on "Cancel" is likely to hit the wrong button in another
  // context. Better to fail loudly (log warning) and surface the break.
  function handleEscape(e) {
    if (e.key !== 'Escape') return;
    const active = document.activeElement;
    if (!active) return;
    const editor = active.closest('[contenteditable="true"]');
    if (!editor) return;

    // Defer Esc when a typeahead/menu is open inside the editor (e.g. @mention,
    // emoji picker, slash-command menu). Atlaskit uses Esc to dismiss those
    // without closing the editor. Our handler would otherwise cancel the whole
    // editor on the first Esc, losing the user's intended two-step behavior.
    if (document.querySelector('[role="listbox"], [role="menu"]')) return;

    const cancel = document.querySelector(`[data-testid="${CANCEL_BUTTON_TESTID}"]`);
    if (!cancel) {
      console.warn('[jira-noedit] Esc: Cancel button testid not found on page');
      return;
    }
    cancel.click();
    console.log('[jira-noedit] Esc → Cancel clicked');
    e.stopImmediatePropagation();
    e.preventDefault();
  }

  // Order in capture phase matters: handleClickOutsideSave must run before
  // blockClicks so the save fires even when the outside click is to a
  // blockable element (e.g., clicking title while editing description).
  document.addEventListener('click', handleClickOutsideSave, true);
  document.addEventListener('click', blockClicks, true);
  document.addEventListener('keydown', handleEscape, true);

  // Move "To Do", "In Progress", "Done" to the top of the status transition
  // listbox so the common cases are reachable without scrolling past every
  // workflow state. The dropdown opens as a `<div role="listbox">` whose
  // children each contain `[data-testid="issue-field-status.ui.status-view.transition"]`.
  // The current status is omitted by Jira (you can't transition to your
  // current state), so on a "To Do" issue only "In Progress" and "Done" are
  // moved — this is expected.
  //
  // The reorder runs on every observer tick. If priority items are already
  // first in DOM order, do nothing. The listbox isn't React-virtualized for
  // workflows of this size, and React doesn't re-render unless state
  // changes, so DOM mutations stick.
  function reorderStatusDropdown() {
    const listboxes = document.querySelectorAll('[role="listbox"]');
    for (const listbox of listboxes) {
      const transitions = listbox.querySelectorAll(
        `[data-testid="${STATUS_TRANSITION_TESTID}"]`
      );
      if (transitions.length === 0) continue;

      const picks = [];
      for (const t of transitions) {
        const idx = STATUS_PRIORITY_NAMES.indexOf(
          (t.textContent || '').trim().toLowerCase()
        );
        if (idx === -1) continue;
        let child = t;
        while (child.parentElement && child.parentElement !== listbox) {
          child = child.parentElement;
        }
        if (child.parentElement === listbox) picks.push({ idx, child });
      }
      if (picks.length === 0) continue;

      picks.sort((a, b) => a.idx - b.idx);

      let alreadyOrdered = true;
      for (let i = 0; i < picks.length; i++) {
        if (listbox.children[i] !== picks[i].child) {
          alreadyOrdered = false;
          break;
        }
      }
      if (alreadyOrdered) continue;

      for (let i = picks.length - 1; i >= 0; i--) {
        listbox.insertBefore(picks[i].child, listbox.firstChild);
      }
    }
  }

  function onMutation() {
    placeButton();
    reorderStatusDropdown();
  }

  function startObserver() {
    const observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) {
    onMutation();
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      onMutation();
      startObserver();
    }, { once: true });
  }
})();
