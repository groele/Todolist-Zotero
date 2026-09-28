/**
 * Todolist for Zotero - Bootstrap Entry
 * Supports Zotero 7+ (Gecko 102/115/128+ bootstrap architecture)
 */

if (typeof Zotero === 'undefined') {
  var Zotero;
}

var chromeHandle;
var startupGeneration = 0;
var cancelZoteroWait;

async function waitForZotero() {
  if (typeof Zotero !== 'undefined') {
    await Zotero.initializationPromise;
    return;
  }

  const getZotero = (domWindow) => {
    try {
      return domWindow?.Zotero || domWindow?.wrappedJSObject?.Zotero;
    } catch (_) {
      return null;
    }
  };

  const useWindow = (domWindow) => {
    const z = getZotero(domWindow);
    if (!z) return false;
    Zotero = z;
    return true;
  };

  const pendingWindows = [];
  var windows = Services.wm.getEnumerator('navigator:browser');
  while (windows.hasMoreElements()) {
    const domWindow = windows.getNext();
    if (useWindow(domWindow)) {
      await Zotero.initializationPromise;
      return;
    }
    pendingWindows.push(domWindow);
  }

  await new Promise((resolve) => {
    let settled = false;
    const loads = new Map();
    const cleanup = () => {
      Services.wm.removeListener(listener);
      for (const [win, handler] of loads) {
        win.removeEventListener('load', handler, false);
      }
      loads.clear();
      cancelZoteroWait = null;
    };
    cancelZoteroWait = () => {
      settled = true;
      cleanup();
      resolve();
    };
    const finish = (domWindow) => {
      if (settled || !useWindow(domWindow)) return;
      settled = true;
      cleanup();
      resolve();
    };
    const attachLoad = (domWindow) => {
      if (settled || !domWindow?.addEventListener) return;
      const loadHandler = () => {
        domWindow.removeEventListener('load', loadHandler, false);
        finish(domWindow);
      };
      loads.set(domWindow, loadHandler);
      domWindow.addEventListener('load', loadHandler, false);
      finish(domWindow);
    };
    var listener = {
      onOpenWindow: function (aWindow) {
        let domWindow = aWindow
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
        attachLoad(domWindow);
      },
    };
    pendingWindows.forEach(attachLoad);
    if (!settled) Services.wm.addListener(listener);
  });

  if (Zotero) await Zotero.initializationPromise;
}

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  const generation = ++startupGeneration;
  try {
    await waitForZotero();
    if (generation !== startupGeneration) return;

    if (!rootURI) {
      rootURI = resourceURI.spec;
    }
    if (!rootURI.endsWith('/')) {
      rootURI += '/';
    }
    if (generation !== startupGeneration) return;

    var aomStartup = Components.classes['@mozilla.org/addons/addon-manager-startup;1'].getService(
      Components.interfaces.amIAddonManagerStartup
    );
    var manifestURI = Services.io.newURI(rootURI + 'manifest.json');
    chromeHandle = aomStartup.registerChrome(manifestURI, [
      ['content', 'todolist', rootURI + 'chrome/content/'],
      ['locale', 'todolist', 'en-US', rootURI + 'locale/en-US/'],
      ['locale', 'todolist', 'zh-CN', rootURI + 'locale/zh-CN/'],
    ]);

    const ctx = {
      rootURI,
      addonId: id,
      version,
    };
    ctx._globalThis = ctx;

    Services.scriptloader.loadSubScript(`${rootURI}chrome/content/scripts/index.js`, ctx);
  } catch (error) {
    Zotero?.logError?.('Failed to startup Todolist addon: ' + error);
    if (generation === startupGeneration && chromeHandle) {
      try {
        chromeHandle.destruct();
      } catch (cleanupError) {
        Zotero?.logError?.('Failed to release Todolist chrome handle: ' + cleanupError);
      } finally {
        chromeHandle = null;
      }
    }
  }
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
  ++startupGeneration;
  cancelZoteroWait?.();
  if (reason === APP_SHUTDOWN) {
    return;
  }
  try {
    if (reason === ADDON_DISABLE) {
      Services.obs.notifyObservers(null, 'startupcache-invalidate', null);
    }
    if (typeof Zotero === 'undefined') {
      Zotero = Components.classes['@zotero.org/Zotero;1'].getService(
        Components.interfaces.nsISupports
      ).wrappedJSObject;
    }
    await Zotero?.Todolist?.shutdown?.();
  } catch (error) {
    Zotero?.logError?.('Error during Todolist shutdown: ' + error);
  }
  if (chromeHandle) {
    try {
      chromeHandle.destruct();
    } catch (error) {
      Zotero?.logError?.('Failed to release Todolist chrome: ' + error);
    } finally {
      chromeHandle = null;
    }
  }
}

function uninstall(data, reason) {}
