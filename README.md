# jira-noedit

Chrome extension with two behaviors on Jira issue pages:

- Blocks click-to-edit on issue title and description. A 🔒 / 🔓 button appears near the Description heading; click it to toggle.
- Binds **Esc** to click **Cancel** in any description/comment editor — skip scrolling to the bottom of long AI-written descriptions when you've accidentally entered edit mode.

Scoped to Atlassian Cloud (`https://*.atlassian.net/*`). To narrow it to a single instance, edit the `matches` pattern in `manifest.json`.

## Load

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** and pick this folder
4. Visit a Jira issue — a 🔒 button appears above the description; clicks on title/description are blocked

## Narrow or change the host scope

Edit the `matches` entry in `manifest.json` (e.g. `https://yourorg.atlassian.net/*` for a single instance), then click **Reload** on the extension card in `chrome://extensions`.

## Troubleshooting

- **Button doesn't appear**: the description renderer selector (`.ak-renderer-document`) may have changed. Open DevTools, inspect the description body, and update `BODY_SELECTOR` in `content.js`.
- **Title clicks still edit**: the title selector (`h1[data-testid="issue.views.issue-base.foundation.summary.heading"]`) may have changed. Update `TITLE_SELECTOR` in `content.js`.
- **Reset toggle state**: DevTools console on any Jira page → `localStorage.removeItem('jira-noedit-blocked')` → reload.
- **Nothing at all working**: check `chrome://extensions`, confirm the extension is enabled and the `matches` pattern covers the host you're on.

See `CLAUDE.md` for design decisions and tradeoffs.
