# Atlaskit / Jira DOM reference

The stable selectors and findings this extension relies on. Updated when we verify something on a live Jira instance via Playwright MCP inspection.

## Verified data-testids (as of 2026-04-21)

| Purpose | Selector | Notes |
|---|---|---|
| Current-issue breadcrumb container | `[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]` | The last crumb. Button is appended as its last child when found. |
| Issue title / summary heading | `h1[data-testid="issue.views.issue-base.foundation.summary.heading"]` | Blocker matches `closest(...)` against this. |
| Description field wrapper | `[data-testid="issue.views.field.rich-text.description"]` | The field container. The actual rendered content is a `.ak-renderer-document` descendant. |
| Description label | `[data-testid="issue.views.issue-base.common.description.label"]` | Collapse toggle + "Description" text. Not currently used. |
| Description collapse toggle | `[data-testid="issue.views.common.collapsible-section.DESCRIPTION.toggle"]` | Button. Not currently used. |
| Editor container (outermost) | `[data-testid="issue.views.field.rich-text.editor-container"]` | Wraps contenteditable, toolbar, and Save/Cancel buttons. `handleClickOutsideSave` excludes clicks inside this. |
| Editor (inner, ProseMirror) | `#ak-editor-textarea` (contenteditable="true") | The actual typing area. |
| Save button | `[data-testid="comment-save-button"]` | Misleadingly named "comment-" but is the description's Save too. |
| Cancel button | `[data-testid="comment-cancel-button"]` | Same "comment-" misnomer. Clicking silently discards (no confirm dialog). |
| Editor toolbar list menu | `[data-testid="editor-toolbar__lists-and-indentation-menu"]` | Example of an editor toolbar button (for testing). |

## Class patterns (less stable — prefer testids when possible)

| Purpose | Class/selector | Notes |
|---|---|---|
| Rendered rich text content | `.ak-renderer-document` | Used for **both** description and every comment. Can't use class alone to distinguish. |
| Comment wrapper | `.ak-renderer-wrapper.is-comment` | **Misleading.** `is-comment` is also present on the description's wrapper chain. Do **not** use `.is-comment` as "is this a comment?" — it isn't. |

## URL patterns recognized

The extension reads the current issue key from the URL in `getCurrentIssueKey()`:

| Pattern | Where | Example |
|---|---|---|
| `/browse/<KEY>` | Direct issue page | `/browse/SAM-80357` |
| `?selectedIssue=<KEY>` | Board / backlog / sprint side-panel | `/jira/software/c/projects/SAM/boards/665?selectedIssue=SAM-80357` |

Key format regex: `/^[A-Z][A-Z0-9]*-\d+$/` — one uppercase letter, zero or more uppercase letters/digits, dash, one or more digits.

## ARIA roles used by the editor's floating UI

Atlaskit renders these via React portals, often outside the editor container. Clicking them must **not** trigger our click-outside-Save:

| Role | What |
|---|---|
| `listbox` | `@mention` typeahead, `/slash-command` menu |
| `menu` | Dropdown menus (e.g., toolbar list options) |
| `tooltip` | Hover tooltips |
| `dialog` | Inline modals (e.g., link input) |

`handleClickOutsideSave` excludes clicks inside any of these via the `POPUP_ROLE_SELECTOR` constant. Same selector is used in `handleEscape` to defer Esc when a listbox/menu is open (so Esc dismisses the popup without canceling the editor).

**Role we deliberately do NOT include:** `presentation`. That role means "ignore for a11y" and is applied to hundreds of decorative elements across Jira — matching it would exclude far too much.

## DOM structure notes

### Description in the DOM

Expected hierarchy (innermost → outermost):

```
.ak-renderer-document                                 <- renderer, contains paragraphs
  └─ .css-... (inner style wrapper)
  └─ .ak-renderer-wrapper.is-comment ...              <- despite the name, description has this
  └─ .css-...                                         <- more style wrappers
  └─ [data-testid="issue.views.field.rich-text.description"]   <- field container (the useful testid)
  └─ region "Description section" (the container with "Edit Description" button)
  └─ heading "Collapse Description Description" (h2)
  └─ (outer layout)
```

When the description is in edit mode, the `.ak-renderer-document` is replaced by the editor container (`issue.views.field.rich-text.editor-container`) which contains the ProseMirror contenteditable, toolbar, and Save/Cancel buttons.

### Breadcrumb structure

```
navigation "Work item breadcrumbs"
  └─ list
     ├─ listitem [breadcrumb-parent-issue-container]
     │    └─ link to /browse/<PARENT_KEY>
     └─ listitem [breadcrumb-current-issue-container]   <- our anchor
          ├─ link to /browse/<CURRENT_KEY>              <- the clickable that triggers summary edit
          └─ 🔒 (our toggle button, appended)
```

## Known behaviors

- **Cancel silently discards.** No "Discard changes?" dialog on recent Jira Cloud. If the user's changes weren't saved, they're lost.
- **Esc natively closes editor without saving.** Atlaskit installs its own Esc handler in capture-ish phase. Without our override it exits silently (no save, no explicit cancel). This is why we handle Esc ourselves.
- **SPA navigation within the issue app.** Clicking another issue in a backlog/board updates the side panel without a full page reload. The content script persists; only DOM churns. `MutationObserver` with `subtree: true` catches the new breadcrumb rendering.

## When Atlaskit changes things

The July 2025 Jira UI rollout broke earlier versions of similar scripts. Expect this to happen again every few months. Checklist when selectors drift:

1. Open DevTools on a working Jira issue, inspect the element that changed.
2. Look for `data-testid` on the element or its ancestors — preferred stable identifier.
3. If no testid, look for `data-vc` or semantic roles (`role="heading"`, etc.).
4. Update the constant in `content.js`, test, push.
5. Update this file with the new selector and a dated note of when the old one broke.

## Update log

- **2026-04-21** — Initial inventory, all testids verified via Playwright MCP against `bookmd.atlassian.net` on current Jira Cloud.
