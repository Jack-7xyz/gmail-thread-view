/**
 * Panel DOM. Renders one state at a time; no chrome APIs here, so the dev harness can drive it.
 *
 * States: idle | loading | auth | error | thread. Thread actions are callbacks supplied by
 * the controller (copy, load image, download, refresh).
 */
var PanelView = (function () {
  var COLLAPSE_CHARS = 1400;
  var esc = Format.escapeHtml;

  var HUES = [214, 262, 328, 12, 30, 152, 188, 46]; // distinct, readable with white initials

  /** Stable colour per sender (FNV-1a; a simple sum clusters addresses on one domain). */
  function hue(key) {
    var h = 2166136261;
    for (var i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return HUES[(h >>> 0) % HUES.length];
  }

  function icon(name) {
    var paths = {
      copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
      refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
      file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
      text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
      eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
  }

  function notice(root, title, body, button) {
    root.innerHTML =
      '<div class="notice"><h2>' + esc(title) + '</h2>' +
      (body ? '<p>' + esc(body) + '</p>' : '') +
      (button ? '<button class="primary" data-act="notice">' + esc(button.label) + '</button>' : '') +
      '</div>';
    if (button) root.querySelector('[data-act="notice"]').addEventListener('click', button.onClick);
  }

  function loading(root) {
    var rows = '';
    for (var i = 0; i < 4; i++) rows += '<li class="msg skeleton"><div class="avatar"></div><div class="body"><div class="line w30"></div><div class="line w90"></div><div class="line w70"></div></div></li>';
    root.innerHTML = '<ol class="timeline">' + rows + '</ol>';
  }

  function subtitle(entries) {
    var unrolled = entries.filter(function (e) { return e.source !== 'message'; }).length;
    var s = entries.length + (entries.length === 1 ? ' message' : ' messages');
    return unrolled ? s + ' · ' + unrolled + ' from quoted history' : s;
  }

  function attachmentChips(entry, message, ei) {
    if (!message) return '';
    var real = message.attachments.filter(function (a) { return !a.inline && entry.attachments.indexOf(a.filename) > -1; });
    if (!real.length) return '';
    return '<div class="atts">' + real.map(function (a, ai) {
      return '<button class="att" data-act="download" data-entry="' + ei + '" data-att="' + message.attachments.indexOf(a) + '" title="Download ' + esc(a.filename) + '">' +
        icon('file') + '<span class="att-name">' + esc(a.filename) + '</span><span class="att-size">' + esc(Format.formatSize(a.size)) + '</span></button>';
    }).join('') + '</div>';
  }

  function entryHtml(entry, ei, messages) {
    var message = messages[entry.messageIndex];
    var name = entry.sender.name || entry.sender.email || 'Unknown';
    var key = entry.sender.email || name;
    var long = (entry.text || '').length > COLLAPSE_CHARS;
    var text = entry.text
      ? Format.toHtml(entry.text, function (n, cid) {
          return '<span class="img-slot" data-entry="' + ei + '" data-n="' + n + '" data-cid="' + esc(cid) + '">' + icon('image') + '<span>image</span></span>';
        })
      : '<p class="muted">No new text</p>';
    var chip = entry.source === 'quoted' ? '<span class="chip">quoted</span>'
      : entry.source === 'forwarded' ? '<span class="chip">forwarded by ' + esc(entry.forwardedBy || 'someone') + '</span>' : '';
    var note = entry.fellBack ? "Couldn't clean, showing original" : entry.trimmed.length ? 'Trimmed ' + entry.trimmed.join(', ') : '';

    return '<li class="msg' + (entry.source !== 'message' ? ' unrolled' : '') + '" data-entry="' + ei + '">' +
      '<div class="avatar" style="--h:' + hue(key) + '" title="' + esc(entry.sender.email || '') + '">' + esc(Format.initials(name)) + '</div>' +
      '<div class="body">' +
        '<div class="meta"><span class="name">' + esc(name) + '</span><span class="time">' + esc(Format.when(entry.date)) + '</span>' + chip + '</div>' +
        '<div class="text' + (long ? ' collapsed' : '') + '">' + text + '</div>' +
        (long ? '<button class="more" data-act="expand">Show more</button>' : '') +
        attachmentChips(entry, message, ei) +
        '<div class="foot">' +
          (note ? '<span class="note">' + esc(note) + '</span>' : '<span></span>') +
          '<span class="tools">' +
            '<button class="tool" data-act="copy-md" title="Copy as Markdown">' + icon('copy') + 'MD</button>' +
            '<button class="tool" data-act="copy-text" title="Copy as plain text">' + icon('text') + 'Text</button>' +
            '<button class="tool" data-act="original" title="Show the uncleaned text">' + icon('eye') + 'Original</button>' +
          '</span>' +
        '</div>' +
        '<pre class="original" hidden>' + esc(entry.original || '') + '</pre>' +
      '</div></li>';
  }

  function thread(root, data, actions) {
    root.innerHTML =
      '<header class="bar">' +
        '<div class="title"><h1 title="' + esc(data.subject) + '">' + esc(data.subject || '(no subject)') + '</h1>' +
        '<p class="sub">' + esc(subtitle(data.entries)) + '</p></div>' +
        '<div class="actions">' +
          '<button class="ghost" data-act="copy-all-md" title="Copy the whole thread as Markdown">' + icon('copy') + 'Markdown</button>' +
          '<button class="ghost" data-act="copy-all-text" title="Copy the whole thread as plain text">' + icon('text') + 'Text</button>' +
          '<button class="ghost icon-only" data-act="refresh" title="Reload thread">' + icon('refresh') + '</button>' +
        '</div>' +
      '</header>' +
      '<ol class="timeline">' + data.entries.map(function (e, i) { return entryHtml(e, i, data.messages); }).join('') + '</ol>' +
      '<div class="toast" role="status" aria-live="polite"></div>';

    root.onclick = function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) {
        var img = ev.target.closest('img.inline');
        if (img) window.open(img.src, '_blank');
        return;
      }
      var li = btn.closest('.msg');
      var ei = li ? Number(li.dataset.entry) : -1;
      switch (btn.dataset.act) {
        case 'copy-all-md': return copied(root, actions.copy('md'), 'Thread copied as Markdown');
        case 'copy-all-text': return copied(root, actions.copy('text'), 'Thread copied as text');
        case 'copy-md': return copied(root, actions.copy('md', ei), 'Message copied as Markdown');
        case 'copy-text': return copied(root, actions.copy('text', ei), 'Message copied as text');
        case 'refresh': return actions.refresh();
        case 'download': return actions.download(Number(btn.dataset.entry), Number(btn.dataset.att));
        case 'expand':
          li.querySelector('.text').classList.remove('collapsed');
          return btn.remove();
        case 'original':
          var pre = li.querySelector('.original');
          pre.hidden = !pre.hidden;
          btn.classList.toggle('on', !pre.hidden);
          return;
      }
    };

    root.querySelectorAll('.img-slot').forEach(function (slot) {
      actions.loadImage(Number(slot.dataset.entry), slot.dataset.n, slot.dataset.cid).then(function (url) {
        if (!url) return slot.classList.add('missing');
        var img = document.createElement('img');
        img.className = 'inline';
        img.alt = 'Inline image';
        img.src = url;
        slot.replaceWith(img);
      }).catch(function () { slot.classList.add('missing'); });
    });
  }

  function copied(root, promise, label) {
    var toast = root.querySelector('.toast');
    Promise.resolve(promise).then(function () {
      toast.textContent = label;
    }).catch(function () {
      toast.textContent = "Couldn't copy";
    }).then(function () {
      toast.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { toast.classList.remove('show'); }, 1600);
    });
  }

  return { notice: notice, loading: loading, thread: thread };
})();
