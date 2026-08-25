/**
 * Storage polyfill for porting Tampermonkey GM_* to Chrome Extension (MV3)
 * Uses chrome.storage.local under the hood + in-memory cache for near-sync access
 * after initial load. Also keeps localStorage for the Notification Prime keys
 * that originally used it (so existing data is preserved).
 *
 * GM_xmlhttpRequest is routed through the background service worker so that
 * cross-origin requests (e.g. Jellyneo) are not blocked by the page's CORS policy.
 */
(function (global) {
  'use strict';

  const cache = {};
  let ready = false;
  const readyPromise = (async () => {
    try {
      const all = await chrome.storage.local.get(null);
      Object.assign(cache, all || {});
    } catch (e) {
      console.warn('[DarthyPrime] storage load failed', e);
    }
    ready = true;
  })();

  // Sync-style after ready (returns from cache). Callers that need guarantee
  // should await DarthyPrimeStorage.ready
  function GM_getValue(key, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key];
    }
    return defaultValue;
  }

  function GM_setValue(key, value) {
    cache[key] = value;
    // Fire-and-forget persist
    chrome.storage.local.set({ [key]: value }).catch(err => {
      console.warn('[DarthyPrime] setValue failed', key, err);
    });
  }

  function GM_deleteValue(key) {
    delete cache[key];
    chrome.storage.local.remove(key).catch(() => {});
  }

  // Expose a ready promise + helpers
  global.DarthyPrimeStorage = {
    ready: readyPromise,
    isReady: () => ready,
    get: GM_getValue,
    set: GM_setValue,
    remove: GM_deleteValue,
    // Force reload from chrome.storage
    reload: async () => {
      const all = await chrome.storage.local.get(null);
      Object.keys(cache).forEach(k => delete cache[k]);
      Object.assign(cache, all || {});
    }
  };

  // Also attach classic names for easy porting
  global.GM_getValue = GM_getValue;
  global.GM_setValue = GM_setValue;
  global.GM_deleteValue = GM_deleteValue;

  /**
   * GM_xmlhttpRequest polyfill.
   * Always goes through the background service worker so CORS is not an issue
   * (content scripts are limited by the page origin; background is not).
   */
  global.GM_xmlhttpRequest = function (details) {
    const method = (details.method || 'GET').toUpperCase();
    const payload = {
      type: 'gm-xhr',
      url: details.url,
      method: method,
      headers: details.headers || {},
      data: details.data || null
    };

    chrome.runtime.sendMessage(payload)
      .then((resp) => {
        if (!resp) {
          if (details.onerror) details.onerror(new Error('No response from background'));
          return;
        }
        if (resp.error) {
          if (details.onerror) details.onerror(new Error(resp.error));
          return;
        }
        const response = {
          responseText: resp.responseText || '',
          response: resp.responseText || '',
          status: resp.status || 0,
          statusText: resp.statusText || '',
          readyState: 4,
          finalUrl: resp.finalUrl || details.url
        };
        if (details.onload) details.onload(response);
      })
      .catch((err) => {
        if (details.onerror) details.onerror(err);
      });
  };

  // GM_addStyle polyfill
  global.GM_addStyle = function (css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

})(typeof window !== 'undefined' ? window : self);
