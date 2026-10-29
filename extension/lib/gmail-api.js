/**
 * Gmail API access (read-only) and parsing of its message format.
 *
 * parseThread is pure and Node-testable. fetch* calls need an OAuth access token.
 * HTML-only messages are converted to text with the browser's DOMParser.
 */
var GmailApi = (function () {
  var BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

  // ---------- fetch ----------

  function request(token, path) {
    return fetch(BASE + path, { headers: { Authorization: 'Bearer ' + token } }).then(function (res) {
      if (res.ok) return res.json();
      var err = new Error('Gmail API ' + res.status);
      err.status = res.status;
      throw err;
    });
  }

  function fetchThread(token, threadId) {
    return request(token, '/threads/' + encodeURIComponent(threadId) + '?format=full');
  }

  function fetchProfile(token) {
    return request(token, '/profile');
  }

  /** Attachment bytes as a Blob. */
  function fetchAttachment(token, messageId, attachmentId, mimeType) {
    return request(token, '/messages/' + messageId + '/attachments/' + attachmentId).then(function (json) {
      return new Blob([base64UrlToBytes(json.data)], { type: mimeType || 'application/octet-stream' });
    });
  }

  // ---------- decoding ----------

  function base64UrlToBytes(data) {
    var bin = atob(String(data || '').replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function decodeText(data, charset) {
    var bytes = base64UrlToBytes(data);
    try {
      return new TextDecoder(charset || 'utf-8').decode(bytes);
    } catch (e) {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }

  function header(headers, name) {
    var h = (headers || []).filter(function (x) { return x.name.toLowerCase() === name.toLowerCase(); })[0];
    return h ? h.value : '';
  }

  function charsetOf(part) {
    var m = header(part.headers, 'Content-Type').match(/charset="?([^";\s]+)/i);
    return m ? m[1] : 'utf-8';
  }

  // ---------- HTML to text (HTML-only messages) ----------

  var BLOCK = /^(p|div|br|tr|li|h[1-6]|table|ul|ol|blockquote|hr|pre|section|article)$/i;

  /** Close to Gmail's own plain-text rendering: quotes as "> ", images as placeholders. */
  function htmlToText(html) {
    if (typeof DOMParser === 'undefined') return String(html).replace(/<[^>]+>/g, ' ');
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('style, script, head, title').forEach(function (n) { n.remove(); });
    var out = '';
    function walk(node) {
      if (node.nodeType === 3) { out += node.nodeValue.replace(/\s+/g, ' '); return; }
      if (node.nodeType !== 1) return;
      var tag = node.tagName;
      if (tag === 'BR') { out += '\n'; return; }
      if (tag === 'IMG') {
        var src = node.getAttribute('src') || '';
        out += src.indexOf('cid:') === 0 ? '[cid:' + src.slice(4) + ']' : '[image: ' + (node.getAttribute('alt') || '') + ']';
        return;
      }
      if (tag === 'BLOCKQUOTE') {
        var start = out.length;
        out += '\n';
        Array.prototype.forEach.call(node.childNodes, walk);
        var quoted = out.slice(start).split('\n').map(function (l) { return l.trim() ? '> ' + l.trim() : '>'; }).join('\n');
        out = out.slice(0, start) + quoted + '\n';
        return;
      }
      if (tag === 'LI') out += '\n- ';
      else if (BLOCK.test(tag)) out += '\n';
      Array.prototype.forEach.call(node.childNodes, walk);
      if (BLOCK.test(tag)) out += '\n';
    }
    walk(doc.body);
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------- parsing ----------

  function walkParts(part, acc) {
    var type = (part.mimeType || '').toLowerCase();
    var filename = part.filename || '';
    var body = part.body || {};
    if (filename && (body.attachmentId || body.data)) {
      acc.attachments.push({
        filename: filename,
        mimeType: part.mimeType,
        size: body.size || 0,
        attachmentId: body.attachmentId || null,
        data: body.attachmentId ? null : body.data,
        contentId: header(part.headers, 'Content-ID').replace(/^<|>$/g, '')
      });
    } else if (type === 'text/plain' && body.data && acc.plain === null) {
      acc.plain = decodeText(body.data, charsetOf(part));
    } else if (type === 'text/html' && body.data && acc.html === null) {
      acc.html = decodeText(body.data, charsetOf(part));
    }
    (part.parts || []).forEach(function (p) { walkParts(p, acc); });
  }

  /** Content-IDs of cid images in HTML document order (matches plain-text placeholder order). */
  function htmlCids(html) {
    var cids = [];
    String(html || '').replace(/src=["']cid:([^"']+)["']/gi, function (_, cid) { cids.push(cid); });
    return cids;
  }

  function parseMessage(msg) {
    var acc = { plain: null, html: null, attachments: [] };
    walkParts(msg.payload || {}, acc);
    var cids = htmlCids(acc.html);
    var attachments = acc.attachments.map(function (a) {
      a.inline = !!a.contentId && cids.indexOf(a.contentId) > -1;
      return a;
    });
    return {
      id: msg.id,
      labelIds: msg.labelIds || [],
      sender: header(msg.payload && msg.payload.headers, 'From'),
      subject: header(msg.payload && msg.payload.headers, 'Subject'),
      date: new Date(Number(msg.internalDate)),
      plainBody: acc.plain !== null ? acc.plain : acc.html !== null ? htmlToText(acc.html) : msg.snippet || '',
      htmlCids: cids,
      attachments: attachments
    };
  }

  /** API thread to parsed messages, oldest first, drafts left out. */
  function parseThread(apiThread) {
    return (apiThread.messages || [])
      .filter(function (m) { return (m.labelIds || []).indexOf('DRAFT') === -1; })
      .map(parseMessage)
      .sort(function (a, b) { return a.date - b.date; });
  }

  /** Parsed messages in the shape the cleaning engine takes (real attachments only). */
  function toEngineThread(messages) {
    return {
      subject: messages.length ? messages[0].subject : '',
      messages: messages.map(function (m) {
        return {
          sender: m.sender,
          date: m.date,
          subject: m.subject,
          plainBody: m.plainBody,
          attachments: m.attachments.filter(function (a) { return !a.inline; })
        };
      })
    };
  }

  return {
    fetchThread: fetchThread,
    fetchProfile: fetchProfile,
    fetchAttachment: fetchAttachment,
    parseThread: parseThread,
    toEngineThread: toEngineThread,
    htmlToText: htmlToText,
    base64UrlToBytes: base64UrlToBytes
  };
})();

if (typeof module !== 'undefined') module.exports = GmailApi;
