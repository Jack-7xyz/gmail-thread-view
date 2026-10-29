const { test } = require('node:test');
const assert = require('node:assert/strict');
const GmailApi = require('../extension/lib/gmail-api.js');
const Format = require('../extension/lib/format.js');
const Cleaner = require('../extension/engine/clean.js');
const { reportThread } = require('./fixtures/samples.js');

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');

// Shape of a Gmail API threads.get?format=full response, trimmed to what we read.
const apiThread = {
  messages: [
    {
      id: 'm2',
      internalDate: String(Date.parse('2026-10-27T16:00:00Z')),
      labelIds: ['INBOX'],
      payload: {
        mimeType: 'multipart/related',
        headers: [
          { name: 'From', value: 'Dana Reyes <dana@harbor.example>' },
          { name: 'Subject', value: 'RE: Report' }
        ],
        parts: [
          {
            mimeType: 'multipart/alternative',
            parts: [
              { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="utf-8"' }], body: { data: b64('See below – thanks.\n\n[cid:image001.png@01DD]\n') } },
              { mimeType: 'text/html', body: { data: b64('<p>See below</p><img src="cid:image001.png@01DD">') } }
            ]
          },
          { mimeType: 'image/png', filename: 'image001.png', headers: [{ name: 'Content-ID', value: '<image001.png@01DD>' }], body: { attachmentId: 'a1', size: 2048 } },
          { mimeType: 'application/pdf', filename: 'Binder.pdf', headers: [], body: { attachmentId: 'a2', size: 120000 } }
        ]
      }
    },
    {
      id: 'm1',
      internalDate: String(Date.parse('2026-10-27T15:00:00Z')),
      labelIds: ['SENT'],
      payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'Sam Lee <sam@example.com>' }, { name: 'Subject', value: 'Report' }], body: { data: b64('Binder attached?') } }
    },
    { id: 'd1', internalDate: '0', labelIds: ['DRAFT'], payload: { mimeType: 'text/plain', headers: [], body: { data: b64('draft') } } }
  ]
};

test('gmail api: parses messages oldest first, drops drafts, decodes UTF-8', () => {
  const msgs = GmailApi.parseThread(apiThread);
  assert.deepEqual(msgs.map((m) => m.id), ['m1', 'm2']);
  assert.equal(msgs[1].plainBody.split('\n')[0], 'See below – thanks.');
  assert.equal(msgs[1].sender, 'Dana Reyes <dana@harbor.example>');
});

test('gmail api: inline images are told apart from real attachments', () => {
  const m = GmailApi.parseThread(apiThread)[1];
  assert.deepEqual(m.htmlCids, ['image001.png@01DD']);
  assert.deepEqual(m.attachments.map((a) => [a.filename, a.inline]), [['image001.png', true], ['Binder.pdf', false]]);
  const engine = GmailApi.toEngineThread([m]);
  assert.deepEqual(engine.messages[0].attachments.map((a) => a.filename), ['Binder.pdf']);
});

test('end to end: API thread to clean entries with a resolvable image token', () => {
  const msgs = GmailApi.parseThread(apiThread);
  const { entries } = Cleaner.cleanThread(GmailApi.toEngineThread(msgs));
  const dana = entries[1];
  assert.match(dana.text, /\[\[img 0 image001\.png@01DD\]\]/);
  const att = Format.resolveImage(msgs[dana.messageIndex], '0', 'image001.png@01DD');
  assert.equal(att.attachmentId, 'a1');
  assert.deepEqual(dana.attachments, ['Binder.pdf']);
});

test('format: image token without a cid resolves by position in the HTML', () => {
  const msg = { htmlCids: ['ii_a', 'ii_b'], attachments: [{ contentId: 'ii_b', filename: 'shot.png' }] };
  assert.equal(Format.resolveImage(msg, '1', '').filename, 'shot.png');
  assert.equal(Format.resolveImage(msg, '0', ''), null);
});

test('format: markdown export has subject, senders, bold and separators', () => {
  const r = Cleaner.cleanThread(reportThread);
  const md = Format.toMarkdown(r.subject, r.entries, reportThread.messages.map(() => ({ htmlCids: [], attachments: [] })));
  assert.ok(md.startsWith('# Fwd: Report formatting\n'));
  assert.ok(md.includes('**Dana Reyes** · Tue 27 Oct, 06:14 · forwarded by Sam Lee'));
  assert.ok(md.includes('**1. Cover Page**'));
  assert.ok(md.includes('_[image: image]_'));
  assert.equal((md.match(/\n---\n/g) || []).length, r.entries.length - 1);
});

test('format: plain text export drops markup', () => {
  const r = Cleaner.cleanThread(reportThread);
  const txt = Format.toPlainText('', [r.entries[4]], reportThread.messages.map(() => ({ htmlCids: [], attachments: [] })));
  assert.ok(txt.startsWith('Alex Kim · '));
  assert.ok(txt.includes('\n1. Cover Page\n'));
  assert.ok(!txt.includes('*'));
});

test('format: html escapes, links, bolds and slots images', () => {
  const html = Format.toHtml('<b>hi</b> *bold* https://example.com/a?b=1&c=2\n[[img 0 x@y]]', (n, cid) => `<i data-n="${n}" data-cid="${cid}"></i>`);
  assert.equal(
    html,
    '<p>&lt;b&gt;hi&lt;/b&gt; <strong>bold</strong> <a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">example.com/a…</a><br><i data-n="0" data-cid="x@y"></i></p>'
  );
});
