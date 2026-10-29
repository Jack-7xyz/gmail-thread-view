/**
 * Thread cleaning engine.
 *
 * Pure JS with no Apps Script calls: the add-on loads it as a global, Node tests
 * load it through module.exports. Input is a thread of raw plain-text messages.
 * Output is a timeline: every message the thread contains, including ones only
 * present as quoted or forwarded history, oldest first, each with new text only.
 * Rules and their reasons: docs/brief.md, section 4.
 */
var ThreadCleaner = (function () {
  // ---------- markers ----------

  var FORWARD_RE = /^-{4,}\s*Forwarded message\s*-{4,}$|^Begin forwarded message:$/i;
  var ORIGINAL_RE = /^-{3,}\s*Original Message\s*-{3,}$/i;
  var RULE_RE = /^_{10,}$/;
  var HEADER_FROM_RE = /^\*?From:\*?\s+\S/;
  var HEADER_SENT_RE = /^\*?(Sent|Date):\*?\s+\S/;
  var ON_WROTE_RE = /^On\s.+\swrote:\s*$/;
  var QUOTE_LINE_RE = /^>/;
  var FWD_SUBJECT_RE = /^\s*(fw|fwd)\s*:/i;

  var FOOTER_RES = [
    /^\W*confidentiality notice\b/i,
    /^\W*(this|the) (e-?mail|message)( and any (files|attachments))? (transmitted|is confidential|contains confidential)/i,
    /^\W*(this|the) information (contained )?in this (e-?mail|message)/i,
    /\bintended solely for the (use of the )?(individual|addressee|person)/i,
    /^\W*disclaimer\W*:/i
  ];
  var MOBILE_RE = /^(sent from my (iphone|ipad|android|samsung|mobile)|sent from (outlook|mail) for |get outlook for (ios|android))/i;
  var BANNER_RE = /^\W*(caution|warning|external)\W*:?\s*this (e-?mail|message) (originated|came) from outside/i;
  var FIRST_CONTACT_RE = /^You don't often get email from \S+\.?\s*Learn why this is important\s*/i;
  var SIGNOFF_RE = /^(kind(est)? regards|best regards|warm(est)? regards|regards|best|best wishes|all the best|many thanks|thanks( again| so much)?|thank you|cheers|sincerely|talk soon|speak soon)[\s,.!]*$/i;
  var SIG_SEPARATOR_RE = /^--\s?$/;
  var LIST_START_RE = /^\s*([-*•]|\d{1,2}[.)]|[a-z][.)])\s+/;
  var LABEL_START_RE = /^[A-Z][\w /]{0,24}:\s/;
  // Outlook names pasted and signature images image001.png...; they also ride along on quoted replies.
  var INLINE_IMAGE_NAME_RE = /^image\d{3}\.(png|jpe?g|gif)$/i;

  // Image placeholders become numbered tokens: "[[img 3]]" or "[[img 3 <content-id>]]".
  // The number is the placeholder's position in the message body, matching the order of
  // cid images in its HTML; the panel resolves tokens to the message's inline images.
  var IMAGE_PLACEHOLDER_RE = /\[(?:image:[^\]]*|cid:([^\]]*))\]/gi;
  var IMAGE_TOKEN_RE = /\[\[img (\d+)(?: ([^\]\s]+))?\]\]/g;

  var MAX_SIGNATURE_LINES = 25;
  var WRAP_MIN = 60;
  var WRAP_MAX = 80;
  var MAX_DEPTH = 50;
  var SAME_TEXT = 0.8; // share of the shorter text's words found in the longer one

  // ---------- small helpers ----------

  function parseAddress(raw) {
    var s = String(raw || '').replace(/<mailto:[^>]*>/gi, '').replace(/[*]/g, '').trim();
    var m = s.match(/^"?([^"<]*?)"?\s*<([^>]+)>/);
    if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
    if (/^\S+@\S+$/.test(s)) return { name: s.split('@')[0], email: s.toLowerCase() };
    return { name: s, email: '' };
  }

  function normalizeLine(line) {
    return String(line)
      .replace(/<[^>\s]*>/g, '')
      .replace(/[*_]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–•,.:;]+|[\s\-–,.:;]+$/g, '')
      .toLowerCase();
  }

  function isBlank(line) {
    return !String(line).trim();
  }

  function hasContent(lines) {
    return lines.some(function (l) { return !isBlank(l); });
  }

  function trimBlankEdges(lines) {
    var a = 0;
    var b = lines.length;
    while (a < b && isBlank(lines[a])) a++;
    while (b > a && isBlank(lines[b - 1])) b--;
    return lines.slice(a, b);
  }

  function collapseBlanks(lines) {
    var out = [];
    lines.forEach(function (l) {
      if (isBlank(l) && out.length && isBlank(out[out.length - 1])) return;
      out.push(isBlank(l) ? '' : l);
    });
    return trimBlankEdges(out);
  }

  function senderKey(sender) {
    return sender.email || normalizeLine(sender.name);
  }

  function addTrim(trimmed, label) {
    if (trimmed.indexOf(label) === -1) trimmed.push(label);
  }

  function tokenizeImages(body) {
    var n = 0;
    return String(body || '').replace(IMAGE_PLACEHOLDER_RE, function (_, cid) {
      return '[[img ' + n++ + (cid ? ' ' + cid.replace(/\s+/g, '') : '') + ']]';
    });
  }

  function isImageLine(normalized) {
    return /^\[\[img \d+[^\]]*\]\]$/.test(normalized);
  }

  // ---------- finding the next quoted message ----------

  /**
   * Earliest quote or forward marker in raw lines, or null.
   * Returns where own text ends and how to read the quoted message's header.
   */
  function findCut(lines, subject) {
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      if (FORWARD_RE.test(line)) return { index: i, kind: 'forward', header: 'block', headerStart: i + 1 };
      if (ORIGINAL_RE.test(line)) return { index: i, kind: 'reply', header: 'block', headerStart: i + 1 };
      if (RULE_RE.test(line) && nextHeaderBlock(lines, i + 1)) return blockCut(i, nextHeaderBlock(lines, i + 1), subject);
      if (HEADER_FROM_RE.test(line) && sentFollows(lines, i)) return blockCut(i, i, subject);

      if (/^On\s/.test(line)) {
        var joined = line;
        var k = 0;
        while (!ON_WROTE_RE.test(joined) && k < 3 && i + k + 1 < lines.length) {
          k++;
          joined += ' ' + lines[i + k].trim();
        }
        if (ON_WROTE_RE.test(joined)) return { index: i, kind: 'reply', header: 'onwrote', wrote: joined, bodyStart: i + k + 1 };
      }
      if (QUOTE_LINE_RE.test(line) && nextNonBlankIsQuote(lines, i)) {
        return { index: i, kind: 'reply', header: 'none', bodyStart: i };
      }
    }
    return null;
  }

  function blockCut(index, headerStart, subject) {
    // Outlook forwards use the same From/Sent block as replies; only the subject tells them apart.
    var kind = FWD_SUBJECT_RE.test(subject || '') ? 'forward' : 'reply';
    return { index: index, kind: kind, header: 'block', headerStart: headerStart };
  }

  function sentFollows(lines, i) {
    for (var k = 1; k <= 5 && i + k < lines.length; k++) {
      if (HEADER_SENT_RE.test(lines[i + k].trim())) return true;
    }
    return false;
  }

  function nextHeaderBlock(lines, from) {
    for (var k = from; k < lines.length && k < from + 3; k++) {
      if (HEADER_FROM_RE.test(lines[k].trim()) && sentFollows(lines, k)) return k;
    }
    return 0;
  }

  function nextNonBlankIsQuote(lines, i) {
    for (var k = i + 1; k < lines.length; k++) {
      if (isBlank(lines[k])) continue;
      return QUOTE_LINE_RE.test(lines[k].trim());
    }
    return true;
  }

  /** From / Sent / Subject block that opens a quoted or forwarded message. */
  function parseHeaderBlock(lines, start) {
    var header = {};
    var i = start;
    while (i < lines.length && isBlank(lines[i])) i++;
    var lastKey = null;
    for (; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) break;
      var m = line.match(/^\*?(From|Date|Sent|Subject|To|Cc):\*?\s*(.*)$/i);
      if (m) {
        lastKey = m[1].toLowerCase();
        header[lastKey] = m[2];
      } else if (lastKey) {
        header[lastKey] += ' ' + line; // wrapped header line
      } else {
        break;
      }
    }
    return {
      sender: parseAddress(header.from || ''),
      date: (header.date || header.sent || '').trim(),
      subject: (header.subject || '').trim(),
      bodyStart: i
    };
  }

  /** "On <date>, <name> <email> wrote:" in US or UK Gmail form. */
  function parseOnWrote(text) {
    var m =
      text.match(/^On\s+(.*?\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*,?\s+(.*?)\s*wrote:\s*$/i) ||
      text.match(/^On\s+(.*),\s*(.*?)\s*wrote:\s*$/i);
    if (!m) return { sender: { name: 'Earlier message', email: '' }, date: '' };
    return { sender: parseAddress(m[2]), date: m[1].trim() };
  }

  /** Gmail prefixes quoted lines with "> "; Outlook does not. Remove one level when present. */
  function stripQuoteLevel(lines) {
    var first = lines.filter(function (l) { return !isBlank(l); })[0];
    if (!first || !QUOTE_LINE_RE.test(first.trim())) return lines;
    return lines.map(function (l) { return l.replace(/^\s*> ?/, ''); });
  }

  /**
   * Split one raw body into the messages it contains, oldest first.
   * The last segment is the message's own text.
   */
  function unroll(body, top) {
    var lines = String(body || '').replace(/\r\n?/g, '\n').split('\n');
    var cur = top;
    var segments = [];
    for (var depth = 0; depth < MAX_DEPTH; depth++) {
      var cut = findCut(lines, cur.subject);
      segments.push({ sender: cur.sender, date: cur.date, source: cur.source, forwardedBy: cur.forwardedBy, own: cut ? lines.slice(0, cut.index) : lines });
      if (!cut) break;

      var next;
      if (cut.header === 'block') {
        var h = parseHeaderBlock(lines, cut.headerStart);
        next = { sender: h.sender, date: h.date, subject: h.subject, bodyStart: h.bodyStart };
      } else if (cut.header === 'onwrote') {
        var w = parseOnWrote(cut.wrote);
        next = { sender: w.sender, date: w.date, subject: '', bodyStart: cut.bodyStart };
      } else {
        next = { sender: { name: 'Earlier message', email: '' }, date: '', subject: '', bodyStart: cut.bodyStart };
      }

      var rest = stripQuoteLevel(lines.slice(next.bodyStart));
      if (!hasContent(rest)) break;
      if (cut.header === 'none' && rest.join('\n') === lines.slice(next.bodyStart).join('\n')) break;

      cur = {
        sender: next.sender,
        date: next.date,
        subject: next.subject,
        source: cut.kind === 'forward' ? 'forwarded' : 'quoted',
        forwardedBy: cut.kind === 'forward' ? cur.sender : null
      };
      lines = rest;
    }
    return segments.reverse();
  }

  // ---------- text tidy ----------

  function tidyInline(text) {
    return text
      .replace(/<mailto:[^>]*>/gi, '')
      .replace(/(@?\b[A-Z][\w.'-]*(?: [A-Z][\w.'-]*)*) <[^<>\s]+@[^<>\s]+>/g, '$1') // "@Pat Lane <pat@x>" mention chips
      .replace(/\s?<\(\d{3}\)%20[^>]*>/g, '') // Gmail phone links
      .replace(/(\S)<\s*(https?:[^>\s]*)\s*>/g, '$1') // "text<url>" from Outlook
      .replace(/^<(https?:[^>\s]*)>$/gm, '$1')
      .replace(FIRST_CONTACT_RE, '');
  }

  /** Join lines that Gmail hard-wrapped at ~76 chars back into logical lines. */
  function unwrap(lines) {
    var out = [];
    var prevRawLen = 0; // length of the previous source line, not the joined one
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');
      var joinable =
        out.length > 0 &&
        !isBlank(out[out.length - 1]) &&
        !isBlank(line) &&
        prevRawLen >= WRAP_MIN &&
        prevRawLen <= WRAP_MAX &&
        !LIST_START_RE.test(line) &&
        !LABEL_START_RE.test(line.trim());
      if (joinable) out[out.length - 1] += ' ' + line.trim();
      else out.push(line);
      prevRawLen = line.length;
    }
    // The sidebar is narrow: drop indentation, normalise bullets to "- ".
    return out.map(function (l) {
      var bullet = l.match(/^\s*[-*•]\s+(.*)$/);
      return bullet ? '- ' + bullet[1] : l.trim();
    });
  }

  /** Own text to logical, tidied lines (before signature and footer cuts). */
  function prepareOwn(ownLines) {
    return unwrap(tidyInline(ownLines.join('\n')).split('\n'));
  }

  // ---------- footers and signatures ----------

  function cutFooters(lines, trimmed) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (MOBILE_RE.test(line)) { addTrim(trimmed, 'mobile footer'); continue; }
      if (BANNER_RE.test(line)) { addTrim(trimmed, 'warning banner'); continue; }
      if (i > 0 && FOOTER_RES.some(function (re) { return re.test(line); })) {
        addTrim(trimmed, 'disclaimer');
        break;
      }
      out.push(lines[i]);
    }
    return out;
  }

  function signatureStart(lines, sender, knownSig) {
    var first = -1;
    for (var f = 0; f < lines.length; f++) if (!isBlank(lines[f])) { first = f; break; }
    if (first < 0) return -1;

    var names = [];
    if (sender && sender.name) {
      var full = normalizeLine(sender.name);
      names.push(full);
      if (full.indexOf(' ') > 0) names.push(full.split(' ')[0]);
    }

    for (var i = first + 1; i < lines.length; i++) {
      var raw = lines[i].trim();
      if (!raw) continue;
      var norm = normalizeLine(raw);
      var tail = lines.slice(i).filter(function (l) { return !isBlank(l); }).length; // Gmail spaces signatures out with blank lines
      if (SIG_SEPARATOR_RE.test(raw)) return i;
      if (SIGNOFF_RE.test(norm) && tail <= MAX_SIGNATURE_LINES) return i;
      if (names.indexOf(norm) > -1 && tail <= MAX_SIGNATURE_LINES) return i;
    }

    // Learned from this sender's other messages: strip a trailing run of repeated lines.
    if (knownSig && knownSig.size) {
      var cut = lines.length;
      for (var j = lines.length - 1; j > first; j--) {
        var n = normalizeLine(lines[j]);
        if (!n || isImageLine(n) || knownSig.has(n)) cut = j;
        else break;
      }
      if (cut < lines.length && hasContent(lines.slice(cut))) return cut;
    }
    return -1;
  }

  /** New text of one segment, with what was trimmed. Never returns empty for non-empty input. */
  function cleanSegment(seg, knownSig) {
    var trimmed = [];
    var lines = prepareOwn(seg.own);
    var original = collapseBlanks(lines);
    lines = cutFooters(lines, trimmed);
    var sig = signatureStart(lines, seg.sender, knownSig);
    if (sig > -1) {
      if (hasContent(lines.slice(sig))) addTrim(trimmed, 'signature');
      lines = lines.slice(0, sig);
    }
    lines = collapseBlanks(lines);

    var fellBack = !hasContent(lines) && hasContent(original);
    return {
      text: (fellBack ? original : lines).join('\n'),
      trimmed: fellBack ? [] : trimmed,
      fellBack: fellBack
    };
  }

  // ---------- thread ----------

  /**
   * Lines that end two or more of a sender's distinct messages: their signature, however it is laid out.
   * Quoted copies of one message count once (keyed by its first line), or its own text would look repeated.
   */
  function learnSignatures(segments) {
    var bySender = {};
    var counted = {};
    segments.forEach(function (s) {
      var key = senderKey(s.sender);
      var lines = prepareOwn(s.own);
      var firstLine = lines.filter(function (l) { return !isBlank(l); })[0];
      var identity = key + '|' + normalizeLine(firstLine || '');
      if (!firstLine || counted[identity]) return;
      counted[identity] = true;
      var seen = {};
      lines.slice(-MAX_SIGNATURE_LINES * 2).forEach(function (l) {
        var n = normalizeLine(l);
        if (n.length >= 3 && !isImageLine(n)) seen[n] = true;
      });
      bySender[key] = bySender[key] || {};
      Object.keys(seen).forEach(function (n) {
        bySender[key][n] = (bySender[key][n] || 0) + 1;
      });
    });
    var known = {};
    Object.keys(bySender).forEach(function (key) {
      known[key] = new Set(Object.keys(bySender[key]).filter(function (n) { return bySender[key][n] >= 2; }));
    });
    return known;
  }

  /** Best display name per email: "Sam Lee" beats "sam". */
  function nameBook(segments) {
    var book = {};
    segments.forEach(function (s) {
      if (!s.sender.email) return;
      var name = s.sender.name;
      var best = book[s.sender.email];
      var score = (/\s/.test(name) ? 2 : 0) + (/^[A-Z]/.test(name) ? 1 : 0) - (name.indexOf('@') > -1 ? 3 : 0);
      if (!best || score > best.score) book[s.sender.email] = { name: name, score: score };
    });
    return book;
  }

  function sameSender(a, b) {
    if (a.email && b.email) return a.email === b.email;
    return normalizeLine(a.name).split(' ')[0] === normalizeLine(b.name).split(' ')[0];
  }

  function words(text) {
    return normalizeLine(text).match(/[a-z0-9]+/g) || [];
  }

  /** A quoted copy may be reflowed, re-bulleted or cut short; compare by shared words. */
  function sameText(a, b) {
    var wa = words(a);
    var wb = words(b);
    if (!wa.length || !wb.length) return false;
    if (wa.length < 3 || wb.length < 3) {
      // Too short to compare word sets: same if one is the start of the other (a cut-short quote).
      var s = (wa.length <= wb.length ? wa : wb).join(' ');
      var l = (wa.length <= wb.length ? wb : wa).join(' ');
      return l === s || l.indexOf(s + ' ') === 0;
    }
    var shorter = wa.length <= wb.length ? wa : wb;
    var longer = new Set(wa.length <= wb.length ? wb : wa);
    var hits = shorter.filter(function (w) { return longer.has(w); }).length;
    return hits / shorter.length >= SAME_TEXT;
  }

  /**
   * thread: { subject, messages: [{ sender, date, subject, plainBody, attachments: [{ filename }] }] }, oldest first.
   * The add-on asks Gmail to leave out inline images; Outlook-named images are dropped here too.
   */
  function cleanThread(thread) {
    var messages = thread.messages || [];
    var perMessage = messages.map(function (m) {
      return unroll(tokenizeImages(m.plainBody), { sender: parseAddress(m.sender), date: m.date, subject: m.subject || '', source: 'message', forwardedBy: null });
    });
    var all = [].concat.apply([], perMessage);
    var known = learnSignatures(all);
    var book = nameBook(all);

    function finish(seg, messageIndex, original, attachments) {
      var sender = book[seg.sender.email] ? { name: book[seg.sender.email].name, email: seg.sender.email } : seg.sender;
      var cleaned = cleanSegment({ own: seg.own, sender: sender }, known[senderKey(seg.sender)]);
      return {
        sender: sender,
        date: seg.date,
        source: seg.source,
        forwardedBy: seg.forwardedBy ? (book[seg.forwardedBy.email] || seg.forwardedBy).name : null,
        text: cleaned.text,
        trimmed: cleaned.trimmed,
        fellBack: cleaned.fellBack,
        original: original,
        messageIndex: messageIndex,
        attachments: attachments
      };
    }

    var timeline = [];
    perMessage.forEach(function (segments, mi) {
      var m = messages[mi];
      segments.forEach(function (seg, si) {
        var isOwn = si === segments.length - 1;
        if (isOwn) {
          var attachments = (m.attachments || [])
            .map(function (a) { return a.filename; })
            .filter(function (name) { return !INLINE_IMAGE_NAME_RE.test(name); });
          timeline.push(finish(seg, mi, String(m.plainBody || ''), attachments));
          return;
        }
        if (!hasContent(seg.own)) return;
        var entry = finish(seg, mi, collapseBlanks(seg.own).join('\n'), []);
        var shown = timeline.some(function (t) { return sameSender(t.sender, entry.sender) && sameText(t.text, entry.text); });
        if (!shown) timeline.push(entry);
      });
    });

    return {
      subject: thread.subject || (messages[0] && messages[0].subject) || '',
      messageCount: messages.length,
      count: timeline.length,
      entries: timeline
    };
  }

  return {
    cleanThread: cleanThread,
    IMAGE_TOKEN_RE: IMAGE_TOKEN_RE,
    _unwrap: unwrap // exposed for tests
  };
})();

if (typeof module !== 'undefined') module.exports = ThreadCleaner;
