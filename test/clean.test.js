const { test } = require('node:test');
const assert = require('node:assert/strict');
const Cleaner = require('../extension/engine/clean.js');
const { reportThread, nestedThread, single, DANA_SIG_OUTLOOK } = require('./fixtures/samples.js');

const NOISE = ['Reg. No.', 'Confidentiality', 'Chief Executive', 'P.O. Box', 'referral', 'wrote:', 'From:', 'Sent:', 'cid:', 'mailto:', 'Managing Partner'];

function noNoise(text) {
  NOISE.forEach((s) => assert.ok(!text.includes(s), `found "${s}" in:\n${text}`));
}

function who(entries) {
  return entries.map((e) => `${e.sender.name}/${e.source}`);
}

// ---------- timeline ----------

test('one message holding the whole history unrolls into a timeline, oldest first', () => {
  const r = Cleaner.cleanThread(nestedThread);
  assert.equal(r.messageCount, 1);
  assert.deepEqual(who(r.entries), [
    'Pat Lane/quoted',
    'Dana Reyes/quoted',
    'Sam Lee/quoted',
    'Dana Reyes/quoted',
    'Sam Lee/message'
  ]);
  r.entries.forEach((e) => noNoise(e.text));
});

test('unrolled messages keep their own text and the date their header showed', () => {
  const [pat, dana1, sam1, dana2, sam2] = Cleaner.cleanThread(nestedThread).entries;
  assert.ok(pat.text.startsWith('Hi Dana,'));
  assert.ok(pat.text.endsWith('2. Where are the missing team photos kept?'));
  assert.equal(pat.date, 'Friday, October 23, 2026 12:13 PM');
  assert.ok(dana1.text.includes('1. Pricing: Yes, please show annual plans.'));
  assert.ok(!dana1.text.includes('Best'));
  assert.equal(dana1.date, 'Fri, Oct 23, 2026 at 8:49 PM');
  assert.equal(sam1.text, "I don't think we pushed the full login flow yet, still need to know if you're testing right now");
  assert.equal(dana2.text, 'Okk. Please let me know when ready');
  assert.equal(sam2.text, '@Pat Lane / @Alex Kim for viz');
});

test('a thread whose replies quote each other shows each message once', () => {
  const { entries } = Cleaner.cleanThread(reportThread);
  assert.deepEqual(who(entries), [
    'Dana Reyes/forwarded',
    'Sam Lee/message',
    'Dana Reyes/message',
    'Alex Kim/message',
    'Alex Kim/message',
    'Dana Reyes/message'
  ]);
  entries.forEach((e) => noNoise(e.text));
});

test('a forward becomes its own entry, marked with who forwarded it', () => {
  const [fwd, sam] = Cleaner.cleanThread(reportThread).entries;
  assert.equal(fwd.forwardedBy, 'Sam Lee');
  assert.ok(fwd.text.startsWith('Morning team,'));
  assert.ok(fwd.text.includes('- Totals should not have their own column. They can just be a row. Same for subtotals.'));
  assert.match(fwd.text, /\[\[img 0\]\]/);
  assert.ok(!fwd.text.includes('Dana Reyes'));
  assert.equal(sam.text, "Thanks for the notes, Dana. We're on it, and we're adding another engineer @Alex Kim who will help us move quickly. Sam");
});

// ---------- per message rules ----------

test('Outlook From/Sent block ends the new text', () => {
  const e = Cleaner.cleanThread(reportThread).entries[2];
  assert.equal(e.text, 'Thanks. Alex, nice to meet you. We appreciate the help.\n\nWe are close!');
});

test('signature that starts with the sender name, no sign-off, is cut', () => {
  const e = Cleaner.cleanThread(reportThread).entries[5];
  assert.equal(e.text, 'Thank you Alex!\n\n2. One shared signature is fine.');
  assert.ok(e.trimmed.includes('signature'));
  assert.ok(e.trimmed.includes('disclaimer'));
});

test('Gmail "On ... wrote:" split over two lines is cut', () => {
  const e = Cleaner.cleanThread(reportThread).entries[3];
  assert.equal(e.text, 'Great to meet you Dana. Excited to dive into this');
});

test('long reply keeps structure, rejoins wrapped lines, drops sign-off', () => {
  const e = Cleaner.cleanThread(reportThread).entries[4];
  const lines = e.text.split('\n');
  assert.ok(lines.includes('*1. Cover Page*'));
  assert.ok(lines.includes('Feedback item: "Totals should not have their own column. They can just be a row."'));
  assert.ok(lines.some((l) => l.startsWith('Status: Done. Totals')));
  assert.ok(!e.text.includes('Cheers'));
  assert.ok(e.trimmed.includes('signature'));
});

test('inline Outlook images are not listed as attachments', () => {
  const { entries } = Cleaner.cleanThread(reportThread);
  assert.deepEqual(entries[1].attachments, ['REPORT_A.docx']);
  assert.deepEqual(entries[2].attachments, []);
  assert.deepEqual(entries[0].attachments, []);
});

test('Outlook first-contact banner is removed', () => {
  const e = Cleaner.cleanThread(reportThread).entries[5];
  assert.ok(!e.text.includes("don't often get email"));
});

test('mobile footer is cut', () => {
  const t = single('Sam Lee <sam@example.com>', 'Sounds good, ship it.\n\nSent from my iPhone\n\nOn Tue, Oct 27, 2026 at 9:00 AM Dana Reyes <dana@harbor.example> wrote:\n> ok?');
  const e = Cleaner.cleanThread(t).entries.pop();
  assert.equal(e.text, 'Sounds good, ship it.');
  assert.ok(e.trimmed.includes('mobile footer'));
});

test('legal footer without a signature is cut', () => {
  const t = single('ops@harbor.example', 'Policy docs attached.\n\nCONFIDENTIALITY NOTICE: This message is intended solely for the addressee.');
  const e = Cleaner.cleanThread(t).entries[0];
  assert.equal(e.text, 'Policy docs attached.');
  assert.deepEqual(e.trimmed, ['disclaimer']);
});

test('"-----Original Message-----" starts a quoted message', () => {
  const t = single('Dana Reyes <dana@harbor.example>', 'Approved.\n\n-----Original Message-----\nFrom: Sam Lee <sam@example.com>\nSent: Monday, October 26, 2026 9:00 AM\nSubject: Approve\n\nPlease approve.');
  const { entries } = Cleaner.cleanThread(t);
  assert.deepEqual(who(entries), ['Sam Lee/quoted', 'Dana Reyes/message']);
  assert.equal(entries[0].text, 'Please approve.');
  assert.equal(entries[1].text, 'Approved.');
});

test('"-- " signature separator is cut', () => {
  const t = single('Sam Lee <sam@example.com>', 'Call at 3?\n\n-- \nSam Lee | Example Co');
  assert.equal(Cleaner.cleanThread(t).entries[0].text, 'Call at 3?');
});

test('a message that would clean to empty shows the original, flagged', () => {
  const e = Cleaner.cleanThread(single('Sam Lee <sam@example.com>', 'Sent from my iPhone')).entries[0];
  assert.equal(e.fellBack, true);
  assert.equal(e.text, 'Sent from my iPhone');
  assert.deepEqual(e.trimmed, []);
});

test('a reply with nothing above the quote has empty text, the quote becomes an entry', () => {
  const body = 'On Tue, Oct 27, 2026 at 9:00 AM Dana Reyes <dana@harbor.example> wrote:\n> see attached file for the binder';
  const { entries } = Cleaner.cleanThread(single('Sam Lee <sam@example.com>', body));
  assert.deepEqual(who(entries), ['Dana Reyes/quoted', 'Sam Lee/message']);
  assert.equal(entries[1].text, '');
  assert.equal(entries[0].text, 'see attached file for the binder');
});

test('a signature-only message falls back rather than vanishing', () => {
  const e = Cleaner.cleanThread(single('Dana Reyes <dana@harbor.example>', DANA_SIG_OUTLOOK)).entries[0];
  assert.ok(e.text.startsWith('Dana Reyes'));
});

test('a signature repeated across messages is learned, even without a name or sign-off', () => {
  const sig = 'Harbor Operations Desk\n1 Main Street, Seaside\n555-010-0100';
  const t = {
    subject: 'Re: claims',
    messages: [
      { sender: 'Harbor Ops <ops@harbor.example>', subject: 'claims', plainBody: `Claim 1 received.\n\n${sig}` },
      { sender: 'Harbor Ops <ops@harbor.example>', subject: 'Re: claims', plainBody: `Claim 2 received.\n\n${sig}` }
    ]
  };
  const { entries } = Cleaner.cleanThread(t);
  assert.equal(entries[0].text, 'Claim 1 received.');
  assert.equal(entries[1].text, 'Claim 2 received.');
});

test('quoted copies of a message do not make its own text look like a signature', () => {
  const first = 'Thanks, nice to meet you.\n\nWe are close!\n\nDana Reyes\nChief Executive Officer';
  const t = {
    subject: 'Re: x',
    messages: [
      { sender: 'dana@harbor.example', subject: 'Re: x', plainBody: first },
      { sender: 'Sam Lee <sam@example.com>', subject: 'Re: x', plainBody: `Great.\n\nOn Tue, Oct 27, 2026 at 9:00 AM Dana Reyes <dana@harbor.example> wrote:\n\n${first.replace(/^/gm, '> ')}` },
      { sender: 'Alex Kim <alex@example.com>', subject: 'Re: x', plainBody: `+1\n\nOn Tue, Oct 27, 2026 at 9:00 AM Dana Reyes <dana@harbor.example> wrote:\n\n${first.replace(/^/gm, '> ')}` }
    ]
  };
  assert.equal(Cleaner.cleanThread(t).entries[0].text, 'Thanks, nice to meet you.\n\nWe are close!');
});

test('Outlook FW: with a From/Sent block is treated as a forward', () => {
  const body = 'FYI below.\n\nFrom: Dana Reyes <dana@harbor.example>\nSent: Monday, October 26, 2026 9:00 AM\nTo: Sam Lee\nSubject: Binder\n\nBinder is signed.';
  const { entries } = Cleaner.cleanThread(single('Sam Lee <sam@example.com>', body, 'FW: Binder'));
  assert.deepEqual(who(entries), ['Dana Reyes/forwarded', 'Sam Lee/message']);
  assert.equal(entries[0].text, 'Binder is signed.');
  assert.equal(entries[0].forwardedBy, 'Sam Lee');
  assert.equal(entries[1].text, 'FYI below.');
});

test('rejoin keeps list items and labels on their own lines', () => {
  const out = Cleaner._unwrap([
    'This first line is long enough that Gmail would have wrapped it right here',
    'and this continues it.',
    '   - A bullet that is also quite long and so Gmail wraps it onto the next',
    '   line with an indent.',
    'Status: Done.'
  ]);
  assert.deepEqual(out, [
    'This first line is long enough that Gmail would have wrapped it right here and this continues it.',
    '- A bullet that is also quite long and so Gmail wraps it onto the next line with an indent.',
    'Status: Done.'
  ]);
});
