# CLAUDE.md

Guidance for Claude Code (and future-me) when working on this repo.

## What this is

A minimal Manifest V3 Chrome extension with two behaviors on Jira:

1. **Block click-to-edit** on issue title, description, every comment, and the self-referencing breadcrumb (the last crumb, when its key matches the URL). Toggleable via a floating 🔒 / 🔓 button top-right.
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

### Why a floating button, not anchored near the Description heading

Two abandoned anchored designs:
- **Insert before renderer** — button landed *inside* the styled content box.
- **Insert at renderer's grandparent** — still inside the box; the visual frame extends further up than expected.
- **Semantic heading walk** — look for an ancestor containing a "Description" heading in a sibling subtree. Never triggered on tested pages (Atlaskit may use buttons/divs, not semantic headings, for collapsible section labels; `querySelector('.ak-renderer-document')` sometimes returned a *comment* renderer first because comments use the same class).

The toggle also affects *all comments and the breadcrumb* — not just the description. Anchoring to the description misrepresents scope; a floating button is neutral. The failure modes of the heading walk confirmed the choice: no amount of heuristics beats a fixed-position button for reliability.

Floating tradeoff accepted: slightly more visually noisy. `zIndex: 2147483647` + `position: fixed` puts it above Jira chrome regardless of layout.

### Why comments are blocked by the same selector as description

Both use `.ak-renderer-document`. Comments are additionally wrapped in `.is-comment`. Accidental comment edits are just as annoying as accidental description edits, so the block applies to both. The toggle wording in `btn.title` names the scope ("title, description, comments") so the UI isn't misleading.

### Why the breadcrumb self-reference is blocked

The last crumb on an issue page is the current issue's key, rendered as a link. Clicking it (while already on that issue) triggers edit mode on the summary field rather than a no-op navigation. Detection: clicked element or a close ancestor has trimmed text equal to the URL's issue key, *or* it's an `<a>` whose `href` points to the same `/browse/<KEY>`. Walk capped at `BREADCRUMB_WALK_MAX` (6) levels so large containers whose text happens to contain the key don't match.

Side effect: a self-link in the description or a comment (mentioning the current issue) is also blocked. Harmless — clicking it would navigate to the same page anyway.

### Why `MutationObserver` with `subtree: false`

The button lives as a direct child of `document.body`, which persists across Jira's SPA route changes. The observer's job is narrow: re-add the button if anything removes it. `childList: true, subtree: false` on body is sufficient and orders of magnitude cheaper than subtree mode (which fires on every keystroke/tooltip/etc.). Callback is a single `getElementById` check.

### Why default-blocked

Accidental edits are the problem the extension exists to solve. Failing open (default-allowed) defeats the purpose. Users who want it off can toggle — that state persists.

### Why Esc → Cancel uses bubble phase, not capture

The Esc handler lives alongside the click blocker but with opposite propagation intent. The click blocker uses *capture* to run before Jira's own handlers. The Esc handler uses *bubble* so Atlaskit editor features (mention popups, autocomplete, slash-command menus) get Esc first and can `stopPropagation()` if they're handling dismissal. Only if Esc bubbles all the way to `document` without being consumed do we treat it as "user wants out of edit mode" and click Cancel.

Cancel lookup walks up from the focused contenteditable searching ancestors for a `<button>` with text exactly `"Cancel"`. Nearest-wins, so if multiple fields are in edit mode, we cancel the active one (the one with focus).

**Known limits:**
- English UI assumed — "Cancel" literal match. Localized Jira would need the label swapped.
- Applies to any contenteditable, not just the description. Side effect: Esc also cancels comment/subtask edits. Probably a feature.
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
