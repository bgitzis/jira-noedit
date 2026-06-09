# Behaviors

The behavioral contract for the four things this extension does. This is the
*what* and *when* — the precise trigger/scope/exclusion/outcome for each
behavior. For the *why* see `CLAUDE.md`; for the selectors see `atlaskit.md`.

Update this file when a behavior's contract changes (new exclusion, new scope,
new edge case). A bug usually means reality diverged from a line here — or that
a line here was never written down. The June 2026 comment-editor save bug was
the latter: "inside the editor" was defined only for the description.

All four behaviors run from `content.js`. Behaviors 1–3 are document-level
capture-phase listeners; behavior 4 runs from the same `MutationObserver` that
places the toggle button.

---

## 1. Block click-to-edit

**Trigger:** A `click` (capture phase) while `editBlocked` is true.

**Scope — clicks blocked on:**
- Issue **title / summary** (`closest(TITLE_SELECTOR)`)
- **Description** body and **every comment** body — both render as
  `.ak-renderer-document` (`closest(BODY_SELECTOR)`); one selector covers both
- The **self-referencing breadcrumb** — the current issue's own key/link
  (`isCurrentIssueSelfReference`), walking up to `BREADCRUMB_WALK_MAX` (6) levels

**Exclusions (not blocked):**
- The toggle button itself (`e.target.id === BUTTON_ID`)
- Everything when `editBlocked` is false

**Outcome:** `stopImmediatePropagation()` + `preventDefault()` — Jira's own
handlers never see the click, so edit mode never opens.

**Toggle:** 🔒/🔓 button. State persists in `localStorage['jira-noedit-blocked']`.
**Default: blocked** (unset → blocked). Failing open would defeat the purpose.

**Edge cases:**
- A self-link to the current issue inside a description/comment is also blocked.
  Harmless — clicking it would self-navigate anyway.
- Any clickable element whose trimmed text equals the current issue key is
  blocked (rare false positive; same harmless self-navigation).
- Keyboard shortcuts into edit mode are **not** blocked — mouse clicks only.

---

## 2. Esc → Cancel

**Trigger:** `keydown` with `key === 'Escape'` (capture phase) while focus
(`document.activeElement`) is inside a `[contenteditable="true"]`.

**Why capture:** Atlaskit's editor installs its own Esc handler that *silently*
closes the editor (no save, no Cancel) before the event reaches document's
bubble phase. We must run first.

**Exclusions (Esc deferred to Atlaskit, we early-return):**
- Focus not inside a contenteditable
- A typeahead/menu is open: `[role="listbox"], [role="menu"]` present anywhere
  (e.g. @mention, emoji, slash-command). Atlaskit uses Esc to dismiss just the
  popup; a **second** Esc then cancels the editor as expected.

**Outcome:** Click `[data-testid="comment-cancel-button"]` (same testid for
description and comment editors), then `stopImmediatePropagation()` +
`preventDefault()`. If the testid isn't found, log a warning and let the event
continue (no text-match fallback — see CLAUDE.md).

**Edge case:** Jira shows **no** "Discard changes?" confirm — Cancel silently
discards. Consistent with Atlaskit's native Cancel.

---

## 3. Click-outside → Save

Google-sheet-cell model: click into a field to edit, click away to commit.

**Trigger:** A `click` (capture phase, registered *before* behavior 1) while an
editor is open (`[contenteditable="true"]` exists in the DOM).

**"Outside" — Save fires unless the click is in one of these (then we
early-return, no save):**
- **Inside the editor widget:** `e.target.closest(EDITOR_WRAPPER_SELECTOR)`,
  tested from the **click target** upward. The selector matches **either**
  `issue.component.editor.default-editor` (the wrapper both the description and
  comment editors share — encloses contenteditable + toolbar + Save/Cancel)
  **or** `*="editor-container"` (the description's field wrapper). The comment
  editor has **no** `editor-container` testid, which is why both selectors are
  needed. (This is the bug fixed June 2026.)
- **Atlaskit portal popups:** `[role="menu"|"listbox"|"tooltip"|"dialog"]`
  (mention typeahead, emoji picker, link input) — rendered outside the wrapper
- **Save / Cancel buttons** themselves (defensive backstop, in case a layout
  renders them outside the wrapper)
- The toggle button (id check)

**Outcome:** Any other click → `saveBtn.click()` (`comment-save-button`).
No-op if no editor is open.

**Order matters:** registered before behavior 1 so the save fires even when the
outside click lands on a blockable element (e.g. clicking the title while
editing the description: description saves, *then* the blocker prevents the
title editor from opening).

**Recursion:** `saveBtn.click()` re-enters this handler; the Save button is
inside the editor wrapper (and matches the explicit Save-button check), so it
returns early. No loop.

---

## 4. Status dropdown reorder

**Trigger:** Every `MutationObserver` tick (same observer as button placement),
whenever a `[role="listbox"]` containing status-transition children
(`[data-testid="issue-field-status.ui.status-view.transition"]`) is present.

**Outcome:** Move transitions whose name (lowercased, trimmed) is in
`STATUS_PRIORITY_NAMES` (`to do`, `in progress`, `done`) to the top of the
listbox, in that priority order. Walks up from each transition to the direct
listbox child (Jira wraps each in lozenge-styling divs) so the right ancestor
moves.

**Short-circuits (no-op):**
- No listbox / no transition children on this tick
- Priority items already first in DOM order
- No priority items present (non-English Jira — fails open, no reorder)

**Edge cases:**
- The **current** status is omitted by Jira (you can't transition to where you
  already are), so a "To Do" issue surfaces only "In Progress" and "Done".
- DOM mutation sticks because Jira doesn't re-render the listbox between opens.
  If Atlassian moves to a virtualized list, this must switch to intercepting the
  data feeding the list (flagged in CLAUDE.md).

---

## Coverage matrix

| URL form | Behaviors active |
|---|---|
| `/browse/<KEY>` (direct issue) | all four |
| `?selectedIssue=<KEY>` (board/backlog side panel) | all four |
| non-issue Atlassian pages | none act (selectors don't match; button floats) |

## Manual verification

See `development.md` for the full checklist. Minimum after any change: reload
the extension, hard-reload an issue, then confirm — block, Esc→Cancel, and
click-outside→Save (testing **both** description and a comment) on both URL
forms above.
