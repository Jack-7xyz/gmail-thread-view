// Creates the public key that pins the extension ID, stores it in .env.
// Run once. The ID must stay fixed: the Google sign-in redirect is registered against it.
const crypto = require('node:crypto');
const env = require('./env');

if (env.read().EXTENSION_KEY && !process.argv.includes('--force')) {
  console.log('EXTENSION_KEY already in .env (use --force to replace; the sign-in redirect would need updating).');
  process.exit(0);
}

const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
env.set('EXTENSION_KEY', der);
console.log('EXTENSION_KEY written to .env. Redirect URI: npm run redirect-uri');
