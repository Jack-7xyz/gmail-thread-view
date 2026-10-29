// Checks real threads in test/fixtures/private (Git-ignored). Skips when none are present.
// Assertions are structural so no message content needs to live in this file.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Cleaner = require('../extension/engine/clean.js');

const dir = path.join(__dirname, 'fixtures', 'private');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const NOISE = [/license #/i, /confidentiality/i, /^From: /m, /^Sent: /m, /\swrote:$/m, /\bcid:/, /mailto:/, /^-- ?$/m, /Sent from my/i];

test('private fixtures present', { skip: files.length === 0 && 'no private fixtures' }, () => {});

files.forEach((file) => {
  test(`private: ${file} has no signature, footer or quote leaks`, () => {
    const thread = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const { entries } = Cleaner.cleanThread(thread);
    assert.ok(entries.length >= thread.messages.length, 'timeline lost real messages');
    entries.forEach((e, i) => {
      NOISE.forEach((re) => assert.ok(!re.test(e.text), `entry ${i} matched ${re}`));
      assert.ok(e.text.trim(), `entry ${i} is empty`);
      e.attachments.forEach((a) => assert.ok(!/^image\d{3}\./i.test(a), `entry ${i} lists inline image ${a}`));
    });
    // no message shown twice
    const keys = entries.map((e) => `${e.sender.email}|${e.text.slice(0, 60)}`);
    assert.equal(new Set(keys).size, keys.length, 'duplicate entry in timeline');
  });
});
