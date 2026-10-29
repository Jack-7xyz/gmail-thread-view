/**
 * Google sign-in for the Gmail API, read-only scope.
 *
 * Uses chrome.identity.launchWebAuthFlow (token flow) rather than getAuthToken, so the
 * account is whichever Google account the user picks (hinted by CONFIG.loginHint), not
 * Chrome's own profile account. The token lives in session storage: memory only, gone
 * when Chrome closes, never written to disk.
 */
var Auth = (function () {
  var SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
  var KEY = 'gmailToken';
  var SKEW_MS = 60 * 1000;

  function authUrl(interactive) {
    var params = {
      client_id: CONFIG.clientId,
      response_type: 'token',
      redirect_uri: chrome.identity.getRedirectURL(),
      scope: SCOPE,
      include_granted_scopes: 'true'
    };
    if (CONFIG.loginHint) params.login_hint = CONFIG.loginHint;
    if (!interactive) params.prompt = 'none';
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(params).toString();
  }

  function cached() {
    return chrome.storage.session.get(KEY).then(function (r) {
      var t = r[KEY];
      return t && t.expiresAt - SKEW_MS > Date.now() ? t.token : null;
    });
  }

  function signIn(interactive) {
    return chrome.identity.launchWebAuthFlow({ url: authUrl(interactive), interactive: interactive }).then(function (redirect) {
      var params = new URLSearchParams(new URL(redirect).hash.slice(1));
      var token = params.get('access_token');
      if (!token) throw new Error(params.get('error') || 'No token returned');
      var entry = { token: token, expiresAt: Date.now() + Number(params.get('expires_in') || 3600) * 1000 };
      var save = {};
      save[KEY] = entry;
      return chrome.storage.session.set(save).then(function () { return token; });
    });
  }

  /** A valid token: cached, else silent sign-in, else (only if interactive) the account picker. */
  function getToken(interactive) {
    return cached().then(function (token) {
      if (token) return token;
      return signIn(false).catch(function (err) {
        if (!interactive) throw err;
        return signIn(true);
      });
    });
  }

  function forget() {
    return chrome.storage.session.remove(KEY);
  }

  return { getToken: getToken, forget: forget };
})();
