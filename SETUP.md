# Setup guide for AI agents

Read this if a person asked you to install Thread View for Gmail for them. You run the commands; they do the few clicks only a person can do (Google Cloud console, Chrome). Keep each request to them short and specific, and wait for them to confirm before moving on.

## 0. Before you start
- **Check tools:** `node -v` (20 or newer), `git --version`, and that Google Chrome is installed. If Node is missing or old, ask the person to install it from https://nodejs.org.
- **Get the code** (skip if you are already in the repo):

```bash
git clone https://github.com/Jack-7xyz/gmail-thread-view.git && cd gmail-thread-view
```

## 1. Ask one question
"Did your team give you a Client ID and an Extension key (for example in a password manager)?"

- **Yes:** go to 2A.
- **No:** go to 2B.

## 2A. Team values (about 2 minutes)

```bash
npm run setup -- --yes --client-id=CLIENT_ID --extension-key=EXTENSION_KEY --login-hint=THEIR_WORK_EMAIL
```

Then go to 3.

## 2B. Their own Google login client (about 10 minutes)

1. Ask for their work email and pick a project ID, lowercase with dashes (e.g. `thread-view-sam`).
2. If `gcloud` is installed, run this. It creates the project and turns on the Gmail API:

```bash
npm run setup -- --yes --project=PROJECT_ID --login-hint=THEIR_EMAIL
```

   - Exit code 2 with "gcloud is not signed in": ask them to run `gcloud auth login` (a browser opens), then run the same command again.
   - Without `gcloud`, run `npm run setup -- --yes`; it prints the console links to do it by hand.
3. The command stops (exit code 2) and prints two console pages. Walk the person through them, signed in with the account whose mail they want to read:
   - **Login screen:** Get started; app name of their choice; their email as support and contact email; audience **Internal** for a work (Google Workspace) account, or **External** for personal Gmail, then add themselves under Audience, Test users; agree to the policy; Create.
   - **Login client:** Application type **Web application**; under Authorized redirect URIs add the exact URI the command printed; Create; copy the **Client ID**. They do not need the client secret.
4. Save it and build:

```bash
npm run setup -- --yes --client-id=CLIENT_ID
```

## 3. Load into Chrome (person)
You cannot click inside Chrome. Tell them:

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose the `dist` folder (give them its full path).
3. Pin it from the puzzle-piece menu.
4. Open any Gmail thread, press **Alt+Shift+T**, click **Connect**, choose their account.

If Connect fails right after creating the client, wait a few minutes and try again: new Google login clients take a little while to activate.

## 4. Updates later

```bash
git pull && npm run build
```

Then the reload icon on the extension's card in `chrome://extensions`.

## Rules
- Never commit `.env` or `dist/` (Git ignores them). The values are not passwords, but they stay out of the repo.
- Never paste the person's email content into issues, chat or files.
- The extension only needs read-only Gmail access. Do not add permissions.
