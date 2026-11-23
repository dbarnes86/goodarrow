/* Persistence. On device the state lives in native preferences (UserDefaults), which iOS does not
   purge the way it can purge web storage. In a browser it falls back to localStorage. */
window.Store = (function () {
  'use strict';
  var KEY = 'goodarrows.state.v1';
  var cap = window.Capacitor;
  var prefs = cap && cap.isNativePlatform && cap.isNativePlatform() && cap.registerPlugin ? cap.registerPlugin('Preferences') : null;
  var pending = null, writing = false;

  function parse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  // Falls back to the key used by pre-release builds, so a game in progress carries over.
  function local() { try { return parse(localStorage.getItem(KEY)) || parse(localStorage.getItem('oche.state.v1')); } catch (e) { return null; } }

  function flush() {
    if (!prefs || writing || pending == null) return;
    var s = pending; pending = null; writing = true;
    prefs.set({ key: KEY, value: s }).catch(function () {}).then(function () { writing = false; flush(); });
  }

  return {
    /** Resolves the saved state object, or null on first launch. Never rejects. */
    load: function () {
      if (!prefs) return Promise.resolve(local());
      return prefs.get({ key: KEY }).then(function (r) { return parse(r && r.value) || local(); })
        .catch(function () { return local(); });
    },
    /** Saves the whole state. Writes are serialised and coalesced, so calling it on every tap is fine. */
    save: function (state) {
      var s = JSON.stringify(state);
      try { localStorage.setItem(KEY, s); } catch (e) {}
      pending = s; flush();
    }
  };
})();
