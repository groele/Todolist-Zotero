// Minimal Chrome Extension API mock for local browser testing.
// Real extension pages use Chrome's native `chrome` object and skip this file.
(function() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) return;

  const storageListeners = [];
  const messageListeners = [];

  window.chrome = window.chrome || {};

  window.chrome.runtime = window.chrome.runtime || {
    lastError: null,
    getURL: (path) => path,
    onMessage: {
      addListener: (fn) => messageListeners.push(fn)
    },
    sendMessage: (msg) => {
      messageListeners.forEach(fn => {
        try { fn(msg, {}, () => {}); } catch(e) {}
      });
      return Promise.resolve();
    }
  };

  window.chrome.action = window.chrome.action || {
    setBadgeText: () => Promise.resolve(),
    setBadgeBackgroundColor: () => Promise.resolve(),
    onClicked: { addListener: () => {} }
  };

  window.chrome.sidePanel = window.chrome.sidePanel || {
    setPanelBehavior: () => Promise.resolve(),
    open: () => Promise.resolve()
  };

  window.chrome.notifications = window.chrome.notifications || {
    create: (id, options, cb) => { if (cb) cb(id); return Promise.resolve(id); }
  };

  window.chrome.alarms = window.chrome.alarms || {
    create: () => {},
    onAlarm: { addListener: () => {} }
  };

  window.chrome.contextMenus = window.chrome.contextMenus || {
    create: () => {},
    removeAll: (cb) => { if (cb) cb(); },
    onClicked: { addListener: () => {} }
  };

  window.chrome.storage = window.chrome.storage || {};
  window.chrome.storage.onChanged = window.chrome.storage.onChanged || {
    addListener: (fn) => storageListeners.push(fn)
  };

  window.chrome.storage.local = {
    get: (keys, callback) => {
      const p = new Promise(resolve => {
        const result = {};
        const keysArray = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});

        keysArray.forEach(key => {
          try {
            const val = localStorage.getItem('todolist_' + key);
            result[key] = val !== null ? JSON.parse(val) : (typeof keys === 'object' && !Array.isArray(keys) ? keys[key] : null);
          } catch (e) {
            result[key] = null;
          }
        });

        if (callback) callback(result);
        resolve(result);
      });
      return p;
    },

    set: (data, callback) => {
      const p = new Promise(resolve => {
        const changes = {};
        Object.entries(data).forEach(([key, val]) => {
          const oldVal = localStorage.getItem('todolist_' + key);
          localStorage.setItem('todolist_' + key, JSON.stringify(val));
          changes[key] = { oldValue: oldVal ? JSON.parse(oldVal) : null, newValue: val };
        });

        storageListeners.forEach(fn => {
          try { fn(changes, 'local'); } catch(e) {}
        });

        if (callback) callback();
        resolve();
      });
      return p;
    },

    remove: (keys, callback) => {
      const p = new Promise(resolve => {
        const keysArray = Array.isArray(keys) ? keys : [keys];
        keysArray.forEach(key => {
          localStorage.removeItem('todolist_' + key);
        });

        if (callback) callback();
        resolve();
      });
      return p;
    }
  };
})();
