// Anonymised samples that copy the structure of real threads (names, numbers, firms are made up).
// Gmail-sent bodies are hard-wrapped near 76 chars on purpose: the engine must rejoin them.

const DANA_SIG_OUTLOOK = `Dana Reyes
Chief Executive Officer
Reg. No. 0A00000

Harbor Studio, Inc.
Reg. No. 0B00000
P.O. Box 100, Seaside, CA 90000-0000
M: 555-010-0001 | D: 555-010-0002| F: 555-010-0003
dana@harbor.example<mailto:dana@harbor.example> | www.harbor.example<https://www.harbor.example/>

[cid:image001.png@01DD0000.AAAAAAA0]

The best compliment I can receive is a referral from my customers and friends, or a review about our service!<https://example.com/review>

Confidentiality Notice: This email and any files transmitted with it are confidential and intended solely for the individual or entity named above.`;

// Same signature as Gmail renders it inside a forward: bold, blank lines, phone links, wrapped.
const DANA_SIG_GMAIL = `*Dana Reyes*

Chief Executive Officer

Reg. No. 0A00000

*Harbor Studio, Inc. *

P.O. Box 100, Seaside, CA 90000-0000

M: *555-010-0001 <(555)%20010-0001>* | D: *555-010-0002 <(555)%20010-0002>*|

dana@harbor.example | www.harbor.example

*Confidentiality Notice:* This email and any files transmitted with it are
confidential and intended solely for the individual or entity named above.`;

const DANA_ORIGINAL = `Morning team,

I ran two reports through the tool last night and have a few comments as
we keep refining it. Both files are attached.

*Cover Page*

   - Please remove the tagline from the cover page template.

*Tables*

   - Totals should not have their own column. They can just be a row.
   Same for subtotals.

[image: A table listing coverage limits for several policies. AI-generated
content may be incorrect.]

${DANA_SIG_GMAIL}`;

const SAM_FORWARD = `Thanks for the notes, Dana. We're on it, and we're adding another engineer
@Alex Kim who will help us move quickly. Sam

---------- Forwarded message ---------
From: Dana Reyes <dana@harbor.example>
Date: Tue, Oct 27, 2026 at 6:14 AM
Subject: Report formatting
To: sam <sam@example.com>
Cc: pat <pat@example.com>

${DANA_ORIGINAL}`;

const DANA_REPLY_1 = `Thanks. Alex, nice to meet you. We appreciate the help.



We are close!



${DANA_SIG_OUTLOOK}

From: Sam Lee <sam@example.com>
Sent: Tuesday, October 27, 2026 11:41 AM
To: Dana Reyes <dana@harbor.example>
Cc: Alex Kim <alex@example.com>
Subject: Fwd: Report formatting

Thanks for the notes, Dana. We're on it, and we're adding another engineer @Alex Kim who will help us move quickly. Sam
---------- Forwarded message ---------
From: Dana Reyes <dana@harbor.example<mailto:dana@harbor.example>>
Date: Tue, Oct 27, 2026 at 6:14 AM
Subject: Report formatting

Morning team,`;

const ALEX_SHORT = `Great to meet you Dana. Excited to dive into this

On Tue, 27 Oct 2026 at 15:54, Dana Reyes <dana@harbor.example>
wrote:

> Thanks. Alex, nice to meet you. We appreciate the help.
>
> We are close!
>`;

const ALEX_LONG = `Hey Dana, here are the updates on the feedback:

*1. Cover Page*
Feedback item: "Please remove the tagline from the cover page template."
Status: Done. It's removed from the cover page and the share link.

*2. Tables*
Feedback item: "Totals should not have their own column. They can just
be a row."
Status: Done. Totals and subtotals now print as rows, and the column
widths were adjusted to match.
*One question: **do you want one signature per section page or a shared
one?*

Cheers,
Alex

On Tue, Oct 27, 2026 at 5:37 PM Alex Kim <alex@example.com> wrote:

> Great to meet you Dana. Excited to dive into this
>
> On Tue, 27 Oct 2026 at 15:54, Dana Reyes <dana@harbor.example>
> wrote:
>`;

const DANA_REPLY_2 = `You don't often get email from alex@example.com. Learn why this is important
Thank you Alex!

2. One shared signature is fine.

${DANA_SIG_OUTLOOK}

From: Alex Kim <alex@example.com>
Sent: Wednesday, October 28, 2026 1:52 PM
To: Dana Reyes <dana@harbor.example>
Subject: Re: Report formatting

Hey Dana, here are the updates on the feedback:`;

const reportThread = {
  subject: 'Fwd: Report formatting',
  messages: [
    {
      sender: 'Sam Lee <sam@example.com>',
      date: '2026-10-27T15:40:48Z',
      subject: 'Fwd: Report formatting',
      plainBody: SAM_FORWARD,
      attachments: [{ filename: 'image001.png' }, { filename: 'image002.png' }, { filename: 'REPORT_A.docx' }]
    },
    {
      sender: 'Dana Reyes <dana@harbor.example>',
      date: '2026-10-27T15:54:37Z',
      subject: 'RE: Report formatting',
      plainBody: DANA_REPLY_1,
      attachments: [{ filename: 'image001.png' }]
    },
    { sender: 'Alex Kim <alex@example.com>', date: '2026-10-27T17:37:17Z', subject: 'Re: Report formatting', plainBody: ALEX_SHORT },
    { sender: 'Alex Kim <alex@example.com>', date: '2026-10-28T17:51:41Z', subject: 'Re: Report formatting', plainBody: ALEX_LONG },
    {
      sender: 'Dana Reyes <dana@harbor.example>',
      date: '2026-10-28T23:28:29Z',
      subject: 'RE: Report formatting',
      plainBody: DANA_REPLY_2
    }
  ]
};

// One message holding the whole history: Gmail quote ("> ") around Outlook replies that do not
// re-quote. Same shape as a real "for viz" forward-by-reply.
const NESTED_BODY = `@Pat Lane <pat@example.com> / @Alex Kim <alex@example.com> for viz

On Mon, Oct 26, 2026 at 7:02 PM Dana Reyes <dana@harbor.example>
wrote:

> Okk. Please let me know when ready
>
>
>
> *Dana Reyes*
>
> Chief Executive Officer
>
> Reg. No. 0A00000
>
>
>
> *Harbor Studio, Inc. *
>
> P.O. Box 100, Seaside, CA 90000-0000
>
>
>
> *Confidentiality Notice:* This email and any files transmitted with it
> are confidential and intended solely for the individual or entity named
> above.
>
>
>
> *From:* Sam Lee <sam@example.com>
> *Sent:* Monday, October 26, 2026 10:01 PM
> *To:* Dana Reyes <dana@harbor.example>
> *Cc:* pat <pat@example.com>
> *Subject:* Re: Website update
>
>
>
> I don't think we pushed the full login flow yet, still need to know if
> you're testing right now
>
>
>
> On Fri, Oct 23, 2026 at 8:49 PM Dana Reyes <dana@harbor.example>
> wrote:
>
> Thanks Pat!
>
> Answers to your questions
> 1. Pricing: Yes, please show annual plans.
> 2. Team photos should be in the shared folder now.
> Best,
> Dana Reyes
> Chief Executive Officer
> Reg. No. 0A00000
>
> Confidentiality Notice: This email and any files transmitted with it are
> confidential and intended solely for the individual or entity named above.
>
> From: Pat Lane <pat@example.com>
> Sent: Friday, October 23, 2026 12:13 PM
> To: Dana Reyes <dana@harbor.example>
> Cc: sam <sam@example.com>
> Subject: Website update
>
>
> Hi Dana,
>
> All items from your notes are fixed and checked. A few quick questions:
>
> 1. Should the pricing page show annual plans?
> 2. Where are the missing team photos kept?
>
> Best,
>
> Pat
> Pat Lane
> Managing Partner | Example Co
>
>`;

const nestedThread = {
  subject: 'Re: Website update',
  messages: [{ sender: 'Sam Lee <sam@example.com>', date: '2026-10-27T02:09:50Z', subject: 'Re: Website update', plainBody: NESTED_BODY, attachments: [{ filename: 'Homepage_v3.pdf' }] }]
};

function single(sender, plainBody, subject) {
  return { subject: subject || 'Re: test', messages: [{ sender, date: '2026-10-28T10:00:00Z', subject: subject || 'Re: test', plainBody }] };
}

module.exports = { reportThread, nestedThread, single, DANA_SIG_OUTLOOK };
