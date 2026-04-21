# Development

How to iterate on this extension. See also:
- `../CLAUDE.md` — design decisions and rationale
- `./atlaskit.md` — selector reference / DOM discoveries
- `./publishing.md` — what it'd take to ship to the Chrome Web Store

## Prerequisites

- Chrome (or Chromium-based: Edge, Brave, Arc). Firefox needs manifest v2-style adaptations — not supported.
- A Jira Cloud instance you can log into. The extension assumes Atlassian Cloud (`*.atlassian.net`). On-prem Jira Server has different DOM and is out of scope.

## First-time install

1. `chrome://extensions` → toggle **Developer mode**
2. **Load unpacked** → pick the `jira-noedit/` folder (the one containing `manifest.json`)
3. Visit any Jira issue under `*.atlassian.net` — 🔒 should appear next to the issue key in the breadcrumb

## Edit → reload cycle

Every change to `content.js` or `manifest.json` needs a reload:

1. Save your edits
2. `chrome://extensions` → click the **reload** (circular arrow) icon on the `jira-noedit` card
3. Hard-refresh the Jira tab (Cmd/Ctrl + Shift + R) — content scripts only inject on fresh page loads

No rebuild step. No bundler. One file = one change.

### Reloading programmatically

The extension card on `chrome://extensions` is built with Web Components (shadow DOM), so automation requires piercing it. The one-liner the Playwright testing uses:

```js
(() => {
  const mgr = document.querySelector('extensions-manager');
  const list = mgr.shadowRoot.querySelector('extensions-item-list');
  const card = list.shadowRoot.querySelectorAll('extensions-item')[0];
  card.shadowRoot.querySelector('#dev-reload-button').click();
})();
```

Run in the DevTools console on `chrome://extensions` (or via `browser_evaluate` from Playwright MCP). If you have multiple extensions, replace `[0]` with the index or filter by name via `shadowRoot.querySelector('#name').textContent`.

## Testing

There are no unit tests. Verification is end-to-end: reload, exercise the extension in a live Jira instance, watch the console.

### What to check after any change

1. **Baseline** (direct issue view, `/browse/<KEY>`):
   - Button visible next to the issue key in the breadcrumb (not floating)
   - Click on title / description / comments / breadcrumb-self → blocked (console log `[jira-noedit] click-to-edit blocked on ...`)
   - Toggle to 🔓 → clicks enter edit mode
   - Hard-refresh → toggle state persists

2. **Esc → Cancel:**
   - Open editor, press Esc → editor closes, console log `[jira-noedit] Esc → Cancel clicked`
   - Open editor, type `@`, wait for popup, press Esc → only popup closes (editor stays). Press Esc again → editor cancels.

3. **Click-outside → Save:**
   - Open editor, click somewhere outside the description (e.g., the activity section) → editor closes, console log `[jira-noedit] click-outside → Save clicked`
   - Open editor, click the editor's floating toolbar button (e.g., Lists) → editor stays open, no save log
   - Open editor, type `@`, click a suggestion in the popup → no spurious save log

4. **Placement re-evaluation:**
   - Navigate to a board / backlog / sprint view with `?selectedIssue=<KEY>` → button moves from fallback (floating) into the side-panel's breadcrumb
   - Close the side panel → button returns to floating

5. **Self-breadcrumb block:**
   - Lock enabled, click the current-issue key (last crumb) → blocked
   - Click the parent-issue key (earlier crumb) → works, navigates

### Testing with Playwright MCP

If you're using Claude Code with the Playwright MCP plugin, the browser instance it controls is separate from your normal Chrome — it won't have your Jira auth by default. Workflow:

1. `browser_navigate` to `https://bookmd.atlassian.net` (or your instance) and log in manually in that browser window
2. Load the extension unpacked in that browser (chrome://extensions → Load unpacked → the repo folder)
3. From then on, `browser_navigate`, `browser_click`, `browser_press_key`, and `browser_evaluate` all see the extension running on live Jira

Two tools are especially useful:
- `browser_snapshot` with `depth: 10+` returns an ARIA-labelled tree you can grep for refs like `Description section` or `Description area, start typing`
- `browser_evaluate` runs arbitrary JS in the page context — use it to query testids, inspect `activeElement`, dispatch events, etc.

The `.playwright-mcp/console-*.log` files capture all console output. Filter for `jira-noedit` to see only extension logs:

```sh
grep -E 'jira-noedit' ~/ws/vim/.playwright-mcp/console-*.log | tail -20
```

## Debugging

### Button doesn't appear

- `document.getElementById('jira-noedit-toggle')` in DevTools — returns the button (or `null`).
- If null: check `chrome://extensions` shows the extension enabled. Watch for errors on the extension card.
- If non-null but invisible: check `getBoundingClientRect()` and `position`. If `position === 'fixed'` and out of view, CSS problem.

### Blocker not firing

- Toggle state: `localStorage.getItem('jira-noedit-blocked')` should be `'true'` (default) or unset. `'false'` means you unlocked it.
- Listener registration: `getEventListeners(document)` in DevTools console (Chrome only) should show `click` listeners in capture phase.

### Esc / click-outside silent

Ask the console — the handlers log warnings when they can't find the Cancel / Save testids:
- `[jira-noedit] Esc: Cancel button testid not found on page` — Atlaskit renamed `comment-cancel-button`
- No `click-outside → Save clicked` but Save button still present — the target was inside an excluded zone (editor container, popup role, Save/Cancel button itself)

### Finding a new testid

When Atlaskit moves something, find its replacement:

```js
// What testids exist near the description?
Array.from(document.querySelectorAll('[data-testid*="description" i]')).map(e => e.dataset.testid)

// What testids exist near an open editor?
const editor = document.querySelector('[contenteditable="true"]');
let n = editor, chain = [];
while (n && chain.length < 15) {
  if (n.dataset && n.dataset.testid) chain.push(n.dataset.testid);
  n = n.parentElement;
}
chain
```

## Git workflow

The repo has a per-repo git config that overrides the global one so pushes go to the personal GitHub account:

```
user.name=Barak Gitsis
user.email=1637878+bgitzis@users.noreply.github.com
core.sshcommand=ssh -i ~/.ssh/id_ed25519_github_personal_with_pf -F /dev/null -o IdentitiesOnly=yes
```

Branch: `main`. Push directly with `git push` — no PR process (one-person repo). Commits follow the standard format; test by reloading + exercising before pushing.

## Adding a new behavior

Typical pattern:

1. Decide whether it's click-driven (add to `blockClicks` / `handleClickOutsideSave`), key-driven (add a new handler), or DOM-driven (add to `placeButton` or a sibling observer callback).
2. If it needs a stable Atlaskit target, find the testid first — see `./atlaskit.md` for the known ones, and the "Finding a new testid" snippet above for the search pattern.
3. Register the listener in the order that matters — capture-phase order is registration order. `handleClickOutsideSave` must come before `blockClicks` so save fires before block.
4. Add a `console.log` line for the happy path and a `console.warn` for the failure path. No silent failures.
5. Exercise the change against all five test scenarios above.
6. Update `../CLAUDE.md` with the *why* of the change.
