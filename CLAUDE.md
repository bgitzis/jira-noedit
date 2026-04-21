# CLAUDE.md

Guidance for Claude Code (and future-me) when working on this repo.

## What this is

A minimal Manifest V3 Chrome extension with two behaviors on Jira:

1. **Block click-to-edit** on issue title, description, every comment, and the self-referencing breadcrumb (the last crumb, when its key matches the URL). Toggleable via a 🔒 / 🔓 button placed next to the breadcrumb crumb (or floating below the header as a fallback).
2. **Bind Esc → Cancel.** When focus is inside any contenteditable (description/comment editor), pressing Esc clicks the nearest `Cancel` button — saves scrolling to the bottom of long AI-written descriptions after accidental entry into edit mode.

~100 lines of JS, one content script, no background worker, no popup.

Inspired by [this userscript gist](https://gist.github.com/fanuch/1511dd5423e0c68bb9d66f63b3a9c875) and the [Atlassian community thread](https://community.atlassian.com/forums/Jira-questions/How-do-I-disable-click-to-edit-description/qaq-p/2195913) where it evolved, but rebuilt as a standalone extension rather than a userscript.

## Design decisions

### Why a Chrome extension, not a userscript

A userscript needs Tampermonkey/Violentmonkey — a third-party extension with access to every page you visit, that auto-updates on its own schedule. Rolling our own means:

- Zero third-party code in the trust chain
- `matches` in manifest is a hard boundary; script cannot run on any other site
- No auto-update channel; code changes only when we change it
- Fully auditable

Tradeoff accepted: load-unpacked requires manual reload after edits, and Chrome shows a "disable developer mode extensions" banner. Both cosmetic.

### Why host-wide `matches`, not `/browse/*` only

Original gist matched `*.atlassian.net/browse/*`. The fork added `/jira/*`. We match the entire Atlassian Cloud host pattern (`*.atlassian.net/*`) — simpler than tracking every route pattern Atlassian adds, and the script only acts when its selectors match anyway. Users who want a tighter blast radius can edit `matches` to a specific subdomain.

### Why content script only — no storage permission, no background worker

Minimizes the permission surface. Toggle state persists via page-context `localStorage` instead of `chrome.storage.local` so we don't need the `storage` permission. The stored value is a boolean — not sensitive, and Jira having incidental access to `localStorage['jira-noedit-blocked']` is a non-issue.

### Why a document-level capture-phase click listener

Two properties worth preserving:

1. **Survives DOM re-renders.** Jira is a React SPA; attaching listeners to specific elements means re-attaching after every re-render. A listener on `document` never gets wiped.
2. **Runs before Jira's handlers.** Capture phase fires listeners top-down (document → target). Jira's own listeners are attached at or near the target in the bubble phase. Capture + `stopImmediatePropagation` means Jira's handlers never see the click.

`preventDefault()` is defensive — click has no default action here — but cheap.

### Why the button is anchored next to the breadcrumb crumb (with floating fallback)

**Discarded placements and why:**
- **Above the Description heading** — inserting before the `.ak-renderer-document` landed the button inside the styled content box; its grandparent was still inside. A semantic heading-walk looking for a "Description" heading in a sibling subtree never triggered on real pages (Atlaskit uses buttons/divs for collapsible section labels, not headings; also `querySelector('.ak-renderer-document')` sometimes returned a comment renderer first because comments use the same class).
- **Fixed top-right** — reliable, but overlapped Jira's user-settings avatar.

**Current placement** (priority order):
1. `[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"]` — Atlaskit's stable testid for the last breadcrumb item. Appended as the last child of the container.
2. `<a href="/browse/<CURRENT_KEY>">` whose text equals the key — heuristic fallback via URL matching. Inserted as the next sibling after the link.
3. Any small element with text equal to the key, within the top `BREADCRUMB_TOP_MAX_PX` of the viewport — text-matching last-resort fallback.

All three lean on the same element we detect for self-reference click-blocking, so the button placement is self-documenting: the lock sits next to the thing it protects.

If the crumb can't be found (non-issue page, unfamiliar layout, Atlassian UI drift), fall back to floating **below** Jira's header bar (`top: 70px, right: 10px`) rather than at the very top — the top-right area is occupied by user menu / notifications / help icons.

Tradeoff: correlated failure with breadcrumb detection. If Jira changes how breadcrumbs are rendered, the button moves to the fallback position. The fallback is intentionally visible (not hidden), so the user still has a working toggle even when anchoring fails.

### Why comments are blocked by the same selector as description

Both the description and every comment render their content in `.ak-renderer-document`. Accidental comment edits are just as annoying as accidental description edits, so the block applies to both. The toggle wording in `btn.title` names the scope so the UI isn't misleading.

**Note on `.is-comment`:** the class name suggests it identifies comments, but Playwright inspection revealed that descriptions *also* have `.is-comment` on a wrapper. Don't rely on it to distinguish comments from the description. If that distinction becomes necessary, use `[data-testid="issue.views.field.rich-text.description"]` for the description positively instead of trying to negate-match comments.

### Why the breadcrumb self-reference is blocked

The last crumb on an issue page is the current issue's key, rendered as a link. Clicking it (while already on that issue) triggers edit mode on the summary field rather than a no-op navigation. Detection: clicked element or a close ancestor has trimmed text equal to the URL's issue key, *or* it's an `<a>` whose `href` points to the same `/browse/<KEY>`. Walk capped at `BREADCRUMB_WALK_MAX` (6) levels so large containers whose text happens to contain the key don't match.

Side effect: a self-link in the description or a comment (mentioning the current issue) is also blocked. Harmless — clicking it would navigate to the same page anyway.

### Why `MutationObserver` with `subtree: true`

The button lives either inside the breadcrumb (when anchoring succeeds) or as a direct child of `body` (fallback). The breadcrumb re-renders on SPA navigation between issues, so we need to detect button disappearance anywhere in the tree — `subtree: true` is required. The callback is cheap: `getElementById(BUTTON_ID)` returns immediately when the button is present, and only on removal do we run the anchor search.

**Historical note:** an earlier version used `subtree: false` when the button was a body-direct-child only. That was correct for its design. The switch to breadcrumb anchoring made the narrower scope insufficient. Classic Chesterton's fence: observer scope depends on where the button lives.

### Why default-blocked

Accidental edits are the problem the extension exists to solve. Failing open (default-allowed) defeats the purpose. Users who want it off can toggle — that state persists.

### Why Esc → Cancel uses capture phase (reversed from earlier versions)

An earlier version used bubble phase to let Atlaskit editor features (mention popups, autocomplete) get Esc first. Playwright inspection showed the handler never fired: Atlaskit's own editor installs an Esc listener that closes the editor *silently* (without explicit Save or Cancel) before the event ever reaches document's bubble phase. Our bubble-phase listener was dead code.

Capture is mandatory here. When our handler fires and successfully clicks Cancel, we `stopImmediatePropagation()` + `preventDefault()` so Atlaskit's later handler can't interfere. When we don't find Cancel (no contenteditable focused, no button to click), we let the event continue — so Atlaskit's native Esc handling still works for unrelated contexts.

Tradeoff with capture: if Atlaskit pops up a mention dropdown inside the editor and you press Esc to dismiss it, our handler fires first and clicks Cancel (exiting the whole editor). Not ideal, but acceptable — the user can re-enter edit mode if they got out by accident. If this becomes a pain point, tighten the contenteditable check to also require that no floating dropdown/menu is open.

### Why Cancel uses `data-testid="comment-cancel-button"` with text fallback

Atlaskit gives both the description editor's and comment editor's Cancel button the same testid: `comment-cancel-button`. (The name is misleadingly "comment-" even for the description editor, but it's stable.) Testid is more robust than text matching across Atlassian UI versions and localization. Fallback to walking up from the editor searching for a `<button>` with text `"Cancel"` handles cases where Atlaskit renames or removes the testid.

**Known limits:**
- English fallback only. Localized Jira relies on the testid working; if it's renamed *and* locale changes the label, the fallback also fails.
- Jira may show a "Discard changes?" confirm dialog when Cancel is clicked with unsaved changes. That's Jira's behavior; we don't override it.

## Known risks

- **Atlassian UI changes.** `data-testid` values and class names (`.ak-renderer-document`, the title `data-testid`) shift periodically. The July 2025 Jira UI rollout broke earlier versions of similar scripts. Expect to update selectors every few months.
- **Keyboard edit shortcuts.** This script only blocks mouse clicks. If Jira adds (or already has) keyboard shortcuts to enter edit mode, they are not blocked. Out of scope unless someone asks.
- **Localization.** "Cancel" text match is English-only.
- **Self-link false positives.** Rare, but any clickable element on the page whose trimmed text equals the current issue key will be blocked. No known harm — clicking such a link would self-navigate anyway.

## What NOT to add

- **Background worker / service worker.** Nothing in the current design needs one. Adds manifest surface and complicates the mental model.
- **`chrome.storage` permission.** `localStorage` is sufficient for a boolean flag. Only switch if syncing across devices becomes a requirement.
- **Popup UI.** The floating toggle button is enough. A popup means an extension icon, a new HTML file, and adds nothing users can't do inline.
- **Selector auto-discovery / "smart" fallbacks.** If Atlassian changes selectors, fix the constants. Heuristics that "find the description by walking the DOM" tend to break in different ways and mask the failure (see the anchored-button section — we tried the heuristic route and it didn't pay off).
- **Icons, store listing, packaging.** Loaded unpacked, personal use. Publishing to the Chrome Web Store would require icons, a privacy policy, and review — not worth it.
- **Locale-aware Cancel detection.** Only worth adding when someone running a non-English Jira complains.

## Testing after changes

There are no automated tests. After any change:

1. Reload the extension on `chrome://extensions` (refresh icon on the card).
2. Hard-reload a Jira issue page.
3. Verify:
   - 🔒 button visible top-right
   - Clicks on title, description, comments, and the current-issue breadcrumb are blocked
   - Toggle to 🔓 → clicks enter edit mode normally
   - SPA nav to another issue preserves button and toggle state
   - Hard-refresh preserves toggle state (via `localStorage`)
   - Esc inside an open editor clicks Cancel
4. Edge cases: navigate to a board/dashboard (no issue content) — button still visible, no errors, nothing to block.

## File layout

```
jira-noedit/
├── manifest.json     # MV3, matches *.atlassian.net/*, content script only
├── content.js        # The whole extension
├── README.md         # User-facing: install, use, troubleshoot
└── CLAUDE.md         # This file
```
