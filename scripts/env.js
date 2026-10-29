// Minimal .env reader/writer (no dependencies). Values never get printed.
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '.env');

function read() {
  if (!fs.existsSync(FILE)) return {};
  const out = {};
  fs.readFileSync(FILE, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return out;
}

function set(key, value) {
  const text = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  fs.writeFileSync(FILE, re.test(text) ? text.replace(re, line) : text + (text && !text.endsWith('\n') ? '\n' : '') + line + '\n');
}

/** Chrome's extension ID: first 32 hex chars of sha256(public key DER), mapped 0-f to a-p. */
function extensionId(base64Key) {
  const hash = require('node:crypto').createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest('hex');
  return hash.slice(0, 32).replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}

module.exports = { read, set, extensionId, FILE };
