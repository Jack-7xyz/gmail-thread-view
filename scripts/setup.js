#!/usr/bin/env node
// One-command setup: settings, optional Google Cloud project via gcloud, build, open Chrome.
// Humans run it plainly and answer prompts. Agents pass --yes plus flags (see SETUP.md);
// with --yes it never prompts and exits with code 2 when it needs the person to do something.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const env = require('./env');

const ROOT = path.join(__dirname, '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
  })
);
const AUTO = !!args.yes;
const OPEN = !args['no-open'];

const say = (s = '') => console.log(s);
const step = (n, s) => say(`\n[${n}] ${s}`);
const done = (s) => say(`    ok  ${s}`);
const todo = (s) => say(`    ->  ${s}`);

function ask(question) {
  if (AUTO || !process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(`    ?   ${question} `, (a) => { rl.close(); resolve(a.trim()); }));
}

function run(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe' });
}

function has(cmd) {
  return run(process.platform === 'win32' ? 'where' : 'which', [cmd]).status === 0;
}

function open(target, app) {
  if (!OPEN) return;
  if (process.platform === 'darwin') run('open', app ? ['-a', app, target] : [target]);
  else if (process.platform === 'win32') run('cmd', ['/c', 'start', '', target]);
  else run('xdg-open', [target]);
}

function stop(message) {
  say(`\n${message}`);
  process.exit(2);
}

async function main() {
  say('Thread View for Gmail: setup');

  // 1. Tools
  step(1, 'Checking tools');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) stop(`Node ${process.versions.node} is too old. Install Node 20 or newer from https://nodejs.org and re-run.`);
  done(`Node ${process.versions.node}`);
  const gcloud = has('gcloud');
  done(gcloud ? 'gcloud found (can create the Google Cloud project for you)' : 'gcloud not found (fine, the project is made in the browser instead)');

  // 2. Settings file and extension key
  step(2, 'Settings');
  if (!fs.existsSync(env.FILE)) {
    fs.copyFileSync(path.join(ROOT, '.env.example'), env.FILE);
    done('created .env');
  }
  if (args['extension-key']) env.set('EXTENSION_KEY', args['extension-key']);
  if (!env.read().EXTENSION_KEY) run(process.execPath, [path.join(__dirname, 'keygen.js')]);
  done('extension key in .env');
  if (args['login-hint']) env.set('LOGIN_HINT', args['login-hint']);
  if (args['client-id']) env.set('GOOGLE_CLIENT_ID', args['client-id']);

  const redirect = `https://${env.extensionId(env.read().EXTENSION_KEY)}.chromiumapp.org/`;

  // 3. Google login client
  step(3, 'Google login client');
  if (env.read().GOOGLE_CLIENT_ID) {
    done('client ID in .env');
    if (args['extension-key'] === undefined && args['client-id']) {
      todo(`Shared client? Its owner must add this redirect URI to it: ${redirect}`);
    }
  } else {
    let project = typeof args.project === 'string' ? args.project : '';
    if (!project && !AUTO) project = await ask('Google Cloud project ID to create (e.g. thread-view-yourname), or Enter to do it in the browser:');

    if (project && gcloud) {
      const account = run('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']).stdout.trim();
      if (!account) {
        if (AUTO) stop('gcloud is not signed in. Ask the person to run `gcloud auth login` (it opens a browser), then re-run this command.');
        run('gcloud', ['auth', 'login'], { inherit: true });
      }
      if (run('gcloud', ['projects', 'describe', project]).status !== 0) {
        const org = run('gcloud', ['organizations', 'list', '--format=value(ID)']).stdout.trim().split('\n')[0];
        const created = run('gcloud', ['projects', 'create', project, ...(org ? [`--organization=${org}`] : [])], { inherit: true });
        if (created.status !== 0) stop('Could not create the project (the ID may be taken). Re-run with another --project=ID.');
        done(`project ${project} created${org ? ' in your organisation' : ''}`);
      } else {
        done(`project ${project} exists`);
      }
      const enabled = run('gcloud', ['services', 'enable', 'gmail.googleapis.com', `--project=${project}`], { inherit: true });
      if (enabled.status !== 0) stop('Could not turn on the Gmail API. Check billing or permissions on the project, then re-run.');
      done('Gmail API on');
    }

    const q = project ? `?project=${encodeURIComponent(project)}` : '';
    say('');
    say('    Two pages in Google Cloud need a person (no API for these):');
    if (!project) {
      todo(`Create a project and turn on the Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com`);
    }
    todo(`Login screen: https://console.cloud.google.com/auth/overview/create${q}`);
    say('           app name: anything; support and contact email: yours');
    say('           audience: Internal (work Google account) or External + add yourself as a test user (personal Gmail)');
    todo(`Login client: https://console.cloud.google.com/auth/clients/create${q}`);
    say('           type: Web application');
    say(`           Authorized redirect URI: ${redirect}`);
    say('           then copy the Client ID (the secret is not needed)');
    open(`https://console.cloud.google.com/auth/overview/create${q}`);

    const id = await ask('Paste the Client ID:');
    if (!id) stop('Waiting on the Client ID. Re-run with:  npm run setup -- --client-id=YOUR_CLIENT_ID');
    env.set('GOOGLE_CLIENT_ID', id);
    done('client ID saved to .env');
  }

  // 4. Build
  step(4, 'Building');
  const built = run(process.execPath, [path.join(__dirname, 'build.js')], { inherit: true });
  if (built.status !== 0) stop('Build failed, see above.');

  // 5. Chrome
  step(5, 'Load it into Chrome (a person has to click these)');
  todo('Open chrome://extensions and turn on Developer mode (top right)');
  todo(`Click Load unpacked and pick: ${path.join(ROOT, 'dist')}`);
  todo('Open a thread in Gmail, press Alt+Shift+T (or click the toolbar icon), then Connect');
  if (process.platform === 'darwin') {
    open('chrome://extensions', 'Google Chrome');
    if (OPEN) run('open', ['-R', path.join(ROOT, 'dist', 'manifest.json')]);
  }
  say('\nDone. New Google login clients can take a few minutes before Connect works.');
}

main();
