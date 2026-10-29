// Prints the sign-in redirect URI to register on the Google OAuth client (derived from EXTENSION_KEY).
const env = require('./env');

const key = env.read().EXTENSION_KEY;
if (!key) {
  console.error('No EXTENSION_KEY in .env. Run: npm run keygen');
  process.exit(1);
}
console.log(`https://${env.extensionId(key)}.chromiumapp.org/`);
