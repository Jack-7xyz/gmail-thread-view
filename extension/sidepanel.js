/**
 * Side panel controller: follows the active Gmail tab, reads the open thread through the
 * Gmail API, cleans it, renders it. Read-only; nothing leaves the browser except Gmail API calls.
 */
(function () {
  var root = document.getElementById('app');
  var current = { threadId: null, messages: [], cleaned: null };
  var imageUrls = {}; // "messageId/attachmentId" -> object URL
  var refreshTimer = null;

  // Runs inside the Gmail page. Gmail marks the open thread's subject heading with its id;
  // "thread-f:<decimal>" in hex is the Gmail API thread id.
  function readThreadId() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-thread-perm-id], [data-legacy-thread-id]'));
    var visible = els.filter(function (e) { return e.getClientRects().length > 0; });
    var el = visible.filter(function (e) { return e.tagName === 'H2'; })[0] || visible[0];
    if (!el) return null;
    var legacy = el.getAttribute('data-legacy-thread-id');
    if (legacy) return legacy;
    var m = (el.getAttribute('data-thread-perm-id') || '').match(/thread-f:(\d+)/);
    return m ? BigInt(m[1]).toString(16) : null;
  }

  function activeTab() {
    return chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(function (tabs) { return tabs[0]; });
  }

  function isGmail(tab) {
    return !!tab && /^https:\/\/mail\.google\.com\//.test(tab.url || '');
  }

  /** Gmail swaps its DOM a moment after the URL changes, so retry briefly. */
  function threadIdIn(tabId, tries) {
    return chrome.scripting.executeScript({ target: { tabId: tabId }, func: readThreadId }).then(function (res) {
      var id = res && res[0] && res[0].result;
      if (id || tries <= 0) return id || null;
      return new Promise(function (r) { setTimeout(r, 350); }).then(function () { return threadIdIn(tabId, tries - 1); });
    });
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { refresh(false); }, 250);
  }

  function refresh(force) {
    if (typeof CONFIG === 'undefined' || !CONFIG.clientId) {
      return PanelView.notice(root, 'Not set up yet', 'This build has no Google client ID. Run the build with GOOGLE_CLIENT_ID in .env.');
    }
    return activeTab().then(function (tab) {
      if (!isGmail(tab)) {
        current.threadId = null;
        return PanelView.notice(root, 'Open Gmail', 'Open a thread in Gmail and it shows here, cleaned up.');
      }
      return threadIdIn(tab.id, 8).then(function (threadId) {
        if (!threadId) {
          current.threadId = null;
          return PanelView.notice(root, 'Open a thread', 'Pick an email in Gmail to see the conversation here.');
        }
        if (threadId === current.threadId && !force) return;
        current.threadId = threadId;
        return load(threadId, false);
      });
    }).catch(function (err) {
      PanelView.notice(root, 'Something went wrong', err.message, { label: 'Try again', onClick: function () { refresh(true); } });
    });
  }

  function load(threadId, interactive) {
    PanelView.loading(root);
    return Auth.getToken(interactive)
      .then(function (token) {
        return GmailApi.fetchThread(token, threadId).then(function (apiThread) {
          if (current.threadId !== threadId) return; // user moved on
          var messages = GmailApi.parseThread(apiThread);
          var cleaned = ThreadCleaner.cleanThread(GmailApi.toEngineThread(messages));
          current.messages = messages;
          current.cleaned = cleaned;
          PanelView.thread(root, { subject: cleaned.subject, entries: cleaned.entries, messages: messages }, actions(token));
        });
      })
      .catch(function (err) {
        if (current.threadId !== threadId) return;
        if (err.status === 401) return Auth.forget().then(function () { return load(threadId, interactive); });
        if (err.status === 404) return notInMailbox();
        if (!err.status) {
          return PanelView.notice(root, 'Connect Gmail', 'Sign in once with ' + (CONFIG.loginHint || 'your Google account') + ' to read threads. Read-only access.', {
            label: 'Connect',
            onClick: function () { load(threadId, true); }
          });
        }
        PanelView.notice(root, 'Gmail API error', err.message, { label: 'Try again', onClick: function () { load(threadId, interactive); } });
      });
  }

  function notInMailbox() {
    return Auth.getToken(false).then(GmailApi.fetchProfile).then(function (p) {
      PanelView.notice(root, 'Not in this mailbox', 'This thread is not in ' + p.emailAddress + '. The panel reads that account only.');
    });
  }

  function actions(token) {
    var cleaned = current.cleaned;
    var messages = current.messages;
    return {
      copy: function (format, entryIndex) {
        var entries = entryIndex === undefined ? cleaned.entries : [cleaned.entries[entryIndex]];
        var subject = entryIndex === undefined ? cleaned.subject : '';
        var text = format === 'md' ? Format.toMarkdown(subject, entries, messages) : Format.toPlainText(subject, entries, messages);
        return navigator.clipboard.writeText(text);
      },
      refresh: function () { return refresh(true); },
      loadImage: function (entryIndex, n, cid) {
        var message = messages[cleaned.entries[entryIndex].messageIndex];
        var att = Format.resolveImage(message, n, cid);
        if (!att) return Promise.resolve(null);
        return blobUrl(token, message, att);
      },
      download: function (entryIndex, attIndex) {
        var message = messages[cleaned.entries[entryIndex].messageIndex];
        var att = message.attachments[attIndex];
        return blobUrl(token, message, att).then(function (url) {
          var a = document.createElement('a');
          a.href = url;
          a.download = att.filename;
          a.click();
        });
      }
    };
  }

  function blobUrl(token, message, att) {
    var key = message.id + '/' + (att.attachmentId || att.filename);
    if (imageUrls[key]) return Promise.resolve(imageUrls[key]);
    var blob = att.attachmentId
      ? GmailApi.fetchAttachment(token, message.id, att.attachmentId, att.mimeType)
      : Promise.resolve(new Blob([GmailApi.base64UrlToBytes(att.data)], { type: att.mimeType }));
    return blob.then(function (b) {
      imageUrls[key] = URL.createObjectURL(b);
      return imageUrls[key];
    });
  }

  chrome.tabs.onActivated.addListener(scheduleRefresh);
  chrome.tabs.onUpdated.addListener(function (tabId, info, tab) {
    if (tab.active && (info.url || info.status === 'complete')) scheduleRefresh();
  });
  chrome.windows.onFocusChanged.addListener(scheduleRefresh);

  refresh(true);
})();
