# jira-noedit

Chrome extension with two behaviors on Jira issue pages:

- Blocks click-to-edit on issue title, description, comments, and the current-issue breadcrumb self-link. A 🔒 / 🔓 button appears next to the current-issue breadcrumb (falls back to floating below the header if the breadcrumb can't be found); click it to toggle.
- Binds **Esc** to click **Cancel** in any description/comment editor — skip scrolling to the bottom of long AI-written descriptions when you've accidentally entered edit mode.

Scoped to Atlassian Cloud (`https://*.atlassian.net/*`). To narrow it to a single instance, edit the `matches` pattern in `manifest.json`.

## Load

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** and pick this folder
4. Visit a Jira issue — a 🔒 button appears next to the issue key in the breadcrumb (or top-right below the header if the breadcrumb isn't detected); clicks on title/description/comments/self-breadcrumb are blocked

## Troubleshooting

- **Button doesn't appear**: check `chrome://extensions`, confirm the extension is enabled and the `matches` pattern covers the host. DevTools console should be free of `[jira-noedit]` errors.
- **Title clicks still edit**: the title selector (`h1[data-testid="issue.views.issue-base.foundation.summary.heading"]`) may have changed. Update `TITLE_SELECTOR` in `content.js`.
- **Description/comment clicks still edit**: `.ak-renderer-document` may have been renamed. Update `BODY_SELECTOR` in `content.js`.
- **Reset toggle state**: DevTools console on any Jira page → `localStorage.removeItem('jira-noedit-blocked')` → reload.

See `CLAUDE.md` for design decisions and tradeoffs.
