/**
 * Text conversions for the panel: Markdown and plain-text export, and safe HTML for display.
 * Pure (no DOM, no chrome APIs) so Node tests cover it.
 *
 * Engine text conventions: *bold* (Gmail's plain-text bold), "- " bullets, image tokens
 * "[[img N]]" / "[[img N <content-id>]]" (see engine IMAGE_TOKEN_RE).
 */
var Format = (function () {
  var IMAGE_TOKEN_RE = /\[\[img (\d+)(?: ([^\]\s]+))?\]\]/g;
  var URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/g;

  var WHEN = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

  /**
   * Real messages carry a Date. Quoted ones carry their header's text, written in the sender's
   * own time zone; it is parsed and printed as local time so the wall clock stays as written,
   * only the format changes. Unparseable text is shown as is.
   */
  function when(date) {
    if (date instanceof Date) return date.toLocaleString('en-GB', WHEN);
    var text = String(date || '');
    var parsed = new Date(text.replace(/\s+at\s+/, ' '));
    return isNaN(parsed) ? text : parsed.toLocaleString('en-GB', WHEN);
  }

  function sourceNote(entry) {
    if (entry.source === 'forwarded') return 'forwarded by ' + (entry.forwardedBy || 'someone');
    if (entry.source === 'quoted') return 'from quoted history';
    return '';
  }

  /** The inline image a token points at, from the real message that carried it. */
  function resolveImage(message, index, cid) {
    if (!message) return null;
    var id = cid || message.htmlCids[Number(index)];
    if (!id) return null;
    return message.attachments.filter(function (a) { return a.contentId === id; })[0] || null;
  }

  function imageLabel(message, index, cid) {
    var att = resolveImage(message, index, cid);
    return att ? att.filename : 'image';
  }

  // ---------- export ----------

  function entryHeader(entry) {
    var note = sourceNote(entry);
    return [entry.sender.name, when(entry.date), note].filter(Boolean).join(' · ');
  }

  function toMarkdown(subject, entries, messages) {
    var blocks = entries.map(function (e) {
      var msg = messages[e.messageIndex];
      var text = (e.text || '')
        .replace(/\*([^*\n]+?)\*/g, '**$1**')
        .replace(IMAGE_TOKEN_RE, function (_, n, cid) { return '_[image: ' + imageLabel(msg, n, cid) + ']_'; });
      var block = '**' + e.sender.name + '** · ' + [when(e.date), sourceNote(e)].filter(Boolean).join(' · ') + '\n\n' + text;
      if (e.attachments.length) block += '\n\n_Attachments: ' + e.attachments.join(', ') + '_';
      return block;
    });
    return (subject ? '# ' + subject + '\n\n' : '') + blocks.join('\n\n---\n\n') + '\n';
  }

  function toPlainText(subject, entries, messages) {
    var parts = subject ? [subject, ''] : [];
    entries.forEach(function (e) {
      var msg = messages[e.messageIndex];
      var text = (e.text || '')
        .replace(/\*([^*\n]+?)\*/g, '$1')
        .replace(IMAGE_TOKEN_RE, function (_, n, cid) { return '[image: ' + imageLabel(msg, n, cid) + ']'; });
      parts.push(entryHeader(e), text);
      if (e.attachments.length) parts.push('Attachments: ' + e.attachments.join(', '));
      parts.push('');
    });
    return parts.join('\n').trim() + '\n';
  }

  // ---------- display ----------

  function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeHtml(s) {
    return escapeText(s).replace(/"/g, '&quot;');
  }

  /**
   * Engine text to HTML: paragraphs, line breaks, links, bold, and image slots.
   * imageSlot(index, cid) returns HTML for an image token.
   */
  function toHtml(text, imageSlot) {
    var paragraphs = String(text || '').split(/\n\s*\n/);
    return paragraphs
      .map(function (p) {
        var slots = [];
        // Text escaping leaves quotes alone so URLs stay intact for linking; URL_RE never spans a quote.
        var safe = escapeText(p.replace(IMAGE_TOKEN_RE, function (_, n, cid) {
          slots.push(imageSlot(n, cid || ''));
          return '\u0000' + (slots.length - 1) + '\u0000';
        }));
        safe = safe
          .replace(/^- /gm, '• ')
          .replace(URL_RE, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + shortUrl(u) + '</a>'; })
          .replace(/\*([^*\n]+?)\*/g, '<strong>$1</strong>')
          .replace(/\n/g, '<br>')
          .replace(/\u0000(\d+)\u0000/g, function (_, i) { return slots[Number(i)]; });
        return '<p>' + safe + '</p>';
      })
      .join('');
  }

  function shortUrl(u) {
    var m = u.match(/^https?:\/\/([^/]+)(\/[^?#]{0,30})?/);
    if (!m) return u;
    var path = m[2] && m[2] !== '/' ? m[2] : '';
    return m[1].replace(/^www\./, '') + path + (u.length > (m[0] || '').length ? '…' : '');
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  return {
    when: when,
    sourceNote: sourceNote,
    resolveImage: resolveImage,
    toMarkdown: toMarkdown,
    toPlainText: toPlainText,
    toHtml: toHtml,
    escapeHtml: escapeHtml,
    initials: initials,
    formatSize: formatSize
  };
})();

if (typeof module !== 'undefined') module.exports = Format;
