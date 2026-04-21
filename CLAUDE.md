# CLAUDE.md

Guidance for Claude Code (and future-me) when working on this repo.

## What this is

A minimal Manifest V3 Chrome extension with two behaviors on Jira:

1. Blocks click-to-edit on issue title and description (toggleable via a 🔒 / 🔓 button anchored near the Description heading).
2. Binds **Esc** while focused inside any contenteditable to click the nearest **Cancel** button — addresses the pain of long AI-generated descriptions where Cancel is off-screen after accidental entry into edit mode.

~100 lines of JS, one content script, no background worker, no popup.

Inspired by [this userscript gist](https://gist.github.com/fanuch/1511dd5423e0c68bb9d66f63b3a9c875) and the [Atlassian community thread](https://community.atlassian.com/forums/Jira-questions/How-do-I-disable-click-to-edit-description/qaq-p/2195913) where it evolved, but rebuilt as a standalone extension rather than a userscript.

## Design decisions

### Why a Chrome extension, not a userscript

A userscript needs Tampermonkey/Violentmonkey — a third-party extension with access to every page you visit, that auto-updates on its own schedule. Rolling our own extension means:

- Zero third-party code in the trust chain
- `matches` in manifest is a hard boundary; script cannot run on any other site
- No auto-update channel; code changes only when we change it
- ~50 lines, fully auditable

Tradeoff accepted: load-unpacked requires manual reload after edits, and Chrome shows a "disable developer mode extensions" banner. Both are cosmetic.

### Why host-wide `matches`, not `/browse/*` only

Original gist matched `*.atlassian.net/browse/*`. The fork added `/jira/*`. We match the whole host (`bookmd.atlassian.net/*`) instead — simpler than tracking every route pattern Atlassian adds, and the script only acts when its selectors match anyway. Also narrower in host scope than the gist (single Atlassian instance, not all of `*.atlassian.net`) — tighter blast radius.

### Why content script only — no storage permission, no background worker

Minimizes the permission surface shown to the user at install and the code paths that could go wrong. Toggle state persists via page-context `localStorage` instead of `chrome.storage.local` so we don't need the `storage` permission. The stored value is a boolean — not sensitive, and Jira having incidental access to `localStorage.jira-noedit-blocked` is a non-issue.

### Why a document-level capture-phase click listener

Two properties worth preserving:

1. **Survives DOM re-renders.** Jira is a React SPA; attaching listeners to specific elements means re-attaching after every re-render. A listener on `document` never gets wiped.
2. **Runs before Jira's handlers.** Capture phase fires listeners top-down (document → target). Jira's own listeners are attached at or near the target in the bubble phase. Capture + `stopImmediatePropagation` means we prevent Jira's handlers from ever seeing the click.

`preventDefault()` is defensive — click has no default action to prevent in this case — but cheap.

### Why the button is anchored to the description (not floating)

Earlier version had a fixed-position floating 🔒 button top-right. Current version inserts it near the Description heading.

Tradeoff: anchoring is more contextual and less visually noisy, but creates a correlated failure mode — if `BODY_SELECTOR` breaks, both blocking *and* the toggle button disappear at once. With the floating button, the toggle would still be there even if blocking selectors went stale, giving the user a clue the script was loaded.

If this turns out to bite, reverting to floating is simple: move `placeButton` to append to `document.body` and re-add fixed positioning styles.

### Why the insertion point uses a semantic heading walk, not a fixed number of parent levels

First attempt inserted before `renderer` (button landed inside the styled content box). Second attempt inserted at grandparent level (still inside the box — the visual frame extends further up than expected). Fixed-depth parent walks are fragile because Jira wraps the renderer in a variable number of styled divs.

Current approach: walk up from the renderer, at each level look for any descendant heading (`h1`–`h4` or `[role="heading"]`) whose text matches `/description/i` *and* is not a descendant of the current node (i.e., lives in a sibling subtree). When found, that's the field section — insert the button before the current node, which lands it between the heading and the content box.

The `!node.contains(heading)` check is load-bearing: without it, a heading *inside* the renderer subtree would match at level 0 and insertion would land above the heading.

Constant `HEADING_WALK_MAX` caps the walk at 10 levels to avoid runaway in unexpected DOM shapes.

### Why `MutationObserver` with `subtree: true`

The description renderer appears/reappears in response to:
- SPA navigation between issues
- Edit-mode → read-mode transition (edit widgets replace the renderer, then get replaced back on save/cancel)

The renderer can land anywhere in the subtree, so `subtree: true` is required. The callback is cheap — a single `getElementById` and `querySelector` on hit/miss — so the volume of mutation events a SPA generates isn't a performance concern in practice.

**Historical note:** an earlier version of this code used `subtree: false` when the button was floating (attached directly to `body`). For that design, narrower was correct — we only needed to detect body-direct-child removal. The move to anchored placement changed the requirement. This is a good example of Chesterton's fence: the observer scope was load-bearing in a way that depended on the button's placement.

### Why default-blocked

Accidental edits are the problem the extension exists to solve. Failing open (default-allowed) defeats the purpose. Users who want it off can toggle — that state persists.

### Why Esc → Cancel uses bubble phase, not capture

The Esc handler lives alongside the click blocker but with opposite propagation intent. The click blocker uses *capture* to run before Jira's own handlers. The Esc handler uses *bubble* so Atlaskit editor features (mention popups, autocomplete, slash-command menus) get Esc first and can `stopPropagation()` if they're handling dismissal. Only if Esc bubbles all the way to `document` without being consumed do we treat it as "user wants out of edit mode" and click Cancel.

Cancel lookup walks up from the focused contenteditable searching ancestors for a `<button>` with text exactly `"Cancel"`. Nearest-wins, so if multiple fields are in edit mode simultaneously, we cancel the active one (the one that has focus).

**Known limits:**
- English UI assumed — "Cancel" literal match. Localized Jira would need the label swapped.
- Applies to any contenteditable, not just the description. Side effect: Esc will also cancel comment/subtask edits the same way. Probably a feature.
- Jira may show a "Discard changes?" confirm dialog when Cancel is clicked with unsaved changes. That's Jira's behavior; we don't override it.

## Known risks

- **Atlassian UI changes.** `data-testid` values and class names (`.ak-renderer-document`, the title heading `data-testid`) shift periodically. The July 2025 Jira UI rollout broke earlier versions of similar scripts. Expect to update selectors every few months.
- **Keyboard edit shortcuts.** This script only blocks mouse clicks. If Jira adds (or already has) keyboard shortcuts to enter edit mode, they are not blocked. Out of scope unless someone asks.
- **Correlated failure (see anchored-button section).** Stale `BODY_SELECTOR` = no button = no easy toggle.

## What NOT to add

- **Background worker / service worker.** Nothing in the current design needs one. Adding one requires more manifest surface and complicates the mental model.
- **`chrome.storage` permission.** `localStorage` is sufficient for a boolean flag. Only switch if syncing across devices becomes a requirement.
- **Popup UI.** The floating/anchored toggle button is enough. A popup means an extension icon, a new HTML file, and adds nothing users can't do with the inline button.
- **Selector auto-discovery / "smart" fallbacks.** If Atlassian changes selectors, we fix the constants. Heuristics that "find the description by walking the DOM" tend to break in different ways over time and mask the failure.
- **Icons, store listing, packaging.** This is a personal-use tool loaded unpacked. Publishing to Chrome Web Store would require icons, a privacy policy, and review — not worth it.

## Testing after changes

There are no automated tests. After any change:

1. Reload the extension on `chrome://extensions` (refresh icon on the card).
2. Hard-reload a Jira issue page.
3. Verify: 🔒 button visible above description, clicks on title/description are blocked, toggle to 🔓 makes edit work, SPA nav to another issue preserves button and state, hard-refresh preserves toggle state (via `localStorage`).
4. Edge cases: navigate to a board/dashboard (no description) — no button, no errors in console. Enter edit mode (toggle 🔓, click), save, return to read mode — button reappears above the renderer.

## File layout

```
jira-noedit/
├── manifest.json     # MV3, matches bookmd.atlassian.net/*, content script only
├── content.js        # The whole extension (~70 lines)
├── README.md         # User-facing: install, use, troubleshoot
└── CLAUDE.md         # This file
```
