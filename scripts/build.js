// Builds the loadable extension into dist/ from extension/ plus local settings in .env.
// dist/ is Git-ignored: it holds the key and client ID, which stay out of tracked files.
const fs = require('node:fs');
const path = require('node:path');
const env = require('./env');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'dist');

const vars = env.read();
const missing = ['EXTENSION_KEY', 'GOOGLE_CLIENT_ID'].filter((k) => !vars[k]);
if (missing.length && !process.argv.includes('--allow-missing')) {
  console.error(`Missing in .env: ${missing.join(', ')}. See .env.example.`);
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, {
  recursive: true,
  filter: (src) => !src.endsWith('manifest.template.json')
});

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.template.json'), 'utf8'));
if (vars.EXTENSION_KEY) manifest.key = vars.EXTENSION_KEY;
else delete manifest.key;
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const config = { clientId: vars.GOOGLE_CLIENT_ID || '', loginHint: vars.LOGIN_HINT || '' };
fs.writeFileSync(path.join(OUT, 'config.js'), `var CONFIG = ${JSON.stringify(config, null, 2)};\n`);

console.log(`Built ${path.relative(ROOT, OUT)}/. Load it at chrome://extensions (Developer mode, Load unpacked).`);
