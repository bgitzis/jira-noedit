# Publishing to the Chrome Web Store

Notes on what it'd take to ship this extension publicly. **Not done yet.** The extension works as a load-unpacked personal tool; publishing adds process overhead without much gain unless you want easy distribution.

## Decision tree

- **Personal use only?** Load unpacked. Don't publish. This is the current state.
- **Share with a few coworkers?** Load unpacked + share the repo, or publish **unlisted** (see below).
- **Broad distribution / anyone can find it?** Publish **public**.

Unlisted is the reasonable middle ground: public URL exists, but the listing isn't indexed in the store or surfaced in search. Same review process as public.

## One-time setup

1. **Developer account.** [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) — $5 one-time fee. Choose individual or org.
2. **Identity verification.** Google requires a government ID for new developers (since ~2024). Processing takes a few days.

## What this extension specifically needs before submitting

Currently missing:

- **Icons.** Chrome requires 128×128 (store listing) and recommends 48×48, 32×32, 16×16. Reference them in `manifest.json`:

  ```json
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
  ```

  Design suggestion: a 🔒 on a simple colored background (blue/green). Don't overthink — it's a tiny icon.

- **Store listing assets:**
  - Short description (≤ 132 chars) — rewrite the README's opening line
  - Detailed description (≤ 16,000 chars) — expand on the three behaviors
  - At least 1 screenshot at 1280×800 or 640×400. Useful captures: (a) the 🔒 button in the breadcrumb, (b) an editor with the "Esc → Cancel" behavior annotated.
  - Optional but nice: promo tile 440×280

- **Privacy policy URL.** Required for any extension that requests permissions or touches user data. Even though we don't collect anything, Google's review will ask. One-page statement is fine:
  > jira-noedit runs entirely in the browser. It does not send any data to remote servers, does not collect analytics, and does not share anything with third parties. The only state stored is a single boolean (`jira-noedit-blocked`) in the page's `localStorage` to remember the toggle setting across reloads.

  Host it on GitHub Pages (add a `docs/privacy.md` or a `gh-pages` branch).

- **Permission justifications.** For each host match and permission, a short explanation shown during review:
  - `https://*.atlassian.net/*` (host match): "Modifies Jira UI behavior on Atlassian Cloud to prevent accidental click-to-edit and adds save/cancel keyboard shortcuts. No data is sent anywhere."

- **Version bumping strategy.** Currently `1.0.0`. Every update = new zip with a higher `version` in manifest. Decide on semver or calver and stick to it.

- **Clean package.** The zip should contain only files the extension needs:
  - `manifest.json`
  - `content.js`
  - `icons/`
  - No `CLAUDE.md`, `docs/`, `.git/`, `.gitignore`, `README.md` (for the store; README lives on GitHub separately)

## Submission flow

1. Zip the extension folder contents (not the folder itself — the manifest must be at the zip's root).
2. Upload to dev console, fill in the listing.
3. Submit for review. First review typically 1–3 business days; can be longer if anything is flagged. Subsequent updates to an existing extension are usually faster (hours).

## Ongoing maintenance once published

- **Each update = new zip + version bump + re-submit + review.** No way around the review for public extensions. Unlisted same story.
- **Host permission audits.** Google periodically emails asking developers to re-justify broad host permissions. Non-response = removal from store. Our justification is clear: we only act on Jira's DOM.
- **MV3 API deprecations.** Google usually gives ~6 months before removing an MV3 API. We use almost none — `MutationObserver`, `document.addEventListener`, `localStorage`, no extension APIs. Very low risk.
- **Jira UI drift.** See `./atlaskit.md` — expect to update selectors every few months regardless of publishing status.

## Realistic time estimate

4–8 hours of actual work spread over ~1 week (most of which is Google's identity check and first review queue).

Breakdown:
- Icons: 30 min (Figma / any icon editor)
- Screenshots: 15 min
- Privacy policy: 15 min (markdown file + gh-pages)
- Description + permission justifications: 30 min
- Dev console signup + ID verification: ~1 week blocker
- First review: 1–3 days
- Iterate on review feedback: usually one round of clarification

## Alternatives to the store

- **Just share the GitHub repo.** Users clone, load unpacked. Nerd audience only. Free, no review.
- **Self-host a `.crx`.** Chrome makes this awkward now — most users can't install off-store CRX files without enterprise policy. Don't bother.
- **Enterprise / Google Workspace force-install.** If you want to push this to everyone in an org without user action, Workspace admins can deploy unpacked or hosted extensions via policy. Same packaging requirements as the store.

## If someone asks "can I install your extension?"

Today, the honest answer: "clone the repo, `chrome://extensions`, Developer mode, Load unpacked, pick the folder. If you want a one-click install, I'd need to publish, which takes ~1 week of bureaucratic latency and I haven't done that yet."
