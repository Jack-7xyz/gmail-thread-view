# Agent instructions

Chrome extension (Manifest V3, side panel) that shows the open Gmail thread as a clean, read-only timeline.

## If a person asked you to install it
Follow [SETUP.md](SETUP.md). It tells you what to run and what to ask the person to click.

## If you are changing the code
- **How it works and why:** [docs/how-it-works.md](docs/how-it-works.md).
- **`extension/engine/clean.js`:** cleaning engine. Pure JS, no browser or chrome APIs; Node tests load it.
- **`extension/lib/`:** `gmail-api.js` (fetch and parse Gmail API messages), `format.js` (Markdown/text export, display HTML; pure), `auth.js` (Google sign-in), `view.js` (panel DOM, no chrome APIs).
- **`extension/sidepanel.js`:** controller. Follows the active Gmail tab, reads the open thread id from the page, calls the API, renders.
- **`extension/manifest.template.json`:** built into `dist/manifest.json` with the key from `.env`.
- **`scripts/`:** setup, build, keygen, redirect URI, icons. **`dev/`:** panel preview (`harness.html`) and the README image (`screenshot.html`).
- **`test/`:** Node tests (`npm test`). `test/fixtures/samples.js` is made-up mail. `test/fixtures/private/` is for real threads and is Git-ignored: never commit it.

## Rules
- Read-only Gmail scope only (`gmail.readonly`). Never add a scope or permission that sends, labels or modifies mail.
- No network calls except Google sign-in and the Gmail API. No analytics, no logging of message content.
- No keys, client IDs or tokens in tracked files: they live in `.env` and the built `dist/`, both ignored.
- The access token stays in `chrome.storage.session` (memory only).
- Run `npm test` before committing. Check UI changes in the harness, light and dark.
