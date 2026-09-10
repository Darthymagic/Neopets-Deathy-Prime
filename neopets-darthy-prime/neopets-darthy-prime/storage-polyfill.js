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
  function chromeAlive() {
    try { return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local); }
    catch (_) { return false; }
  }
  const readyPromise = (async () => {
    try {
      if (chromeAlive()) {
        const all = await chrome.storage.local.get(null);
        Object.assign(cache, all || {});
      }
    } catch (_) {}
    ready = true;
  })();

  try {
    if (chromeAlive() && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes) return;
        Object.keys(changes).forEach((k) => {
          if (Object.prototype.hasOwnProperty.call(changes[k], 'newValue')) cache[k] = changes[k].newValue;
          else delete cache[k];
        });
        try {
          window.dispatchEvent(new CustomEvent('darthy-storage-changed', { detail: changes }));
        } catch (_) {}
      });
    }
  } catch (_) {}

  // Sync-style after ready (returns from cache). Callers that need guarantee
  // should await DarthyPrimeStorage.ready
  function isTrackedTotalKey(key) {
    return key === 'darthy_shop_profit_total' ||
      key === 'darthy_spending_total' ||
      /^neopets_stats_/i.test(key) ||
      /^neopets_log_/i.test(key);
  }

  let bc = null;
  try { bc = new BroadcastChannel('darthy-prime-sync'); } catch (_) {}
  if (bc) {
    bc.onmessage = (ev) => {
      const msg = ev && ev.data;
      if (!msg || !msg.key) return;
      cache[msg.key] = msg.value;
      try {
        window.dispatchEvent(new CustomEvent('darthy-storage-changed', {
          detail: { [msg.key]: { newValue: msg.value } }
        }));
      } catch (_) {}
    };
  }
  function broadcast(key, value) {
    try { if (bc) bc.postMessage({ key, value }); } catch (_) {}
  }

  function GM_getValue(key, defaultValue) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key];
    }
    // Do not use localStorage for live totals — other tabs make it stale
    if (!isTrackedTotalKey(key)) {
      try {
        const raw = localStorage.getItem('dp_' + key);
        if (raw !== null) return JSON.parse(raw);
      } catch (_) {}
    }
    return defaultValue;
  }

  function remember(key, value) {
    cache[key] = value;
    if (!isTrackedTotalKey(key)) {
      try { localStorage.setItem('dp_' + key, JSON.stringify(value)); } catch (_) {}
    }
    broadcast(key, value);
  }

  function sendBg(payload, tries) {
    tries = tries || 0;
    return new Promise((resolve, reject) => {
      if (!chromeAlive()) return reject(new Error('no chrome'));
      try {
        chrome.runtime.sendMessage(payload, (resp) => {
          if (chrome.runtime.lastError || !resp || resp.error) {
            if (tries < 4) {
              setTimeout(() => sendBg(payload, tries + 1).then(resolve, reject), 120 * (tries + 1));
              return;
            }
            return reject(chrome.runtime.lastError || new Error('bg failed'));
          }
          resolve(resp);
        });
      } catch (e) { reject(e); }
    });
  }

  function GM_addValue(key, amount) {
    amount = Number(amount) || 0;
    if (!amount) return Promise.resolve(Number(GM_getValue(key, 0)) || 0);
    return sendBg({ type: 'storage-add', key, amount }).then((resp) => {
      remember(key, resp.value);
      return resp.value;
    });
  }

  function GM_addStat(key, stat, amount) {
    amount = Number(amount) || 0;
    return sendBg({ type: 'storage-add-stat', key, stat, amount }).then((resp) => {
      remember(key, resp.stats);
      return resp.stats;
    });
  }

  function GM_appendLog(logKey, dateKey, today, line) {
    return sendBg({ type: 'storage-append-log', logKey, dateKey, today, line }).then((resp) => {
      if (resp && resp.log) remember(logKey, resp.log);
      if (resp && resp.date) remember(dateKey, resp.date);
      return (resp && resp.log) || [];
    });
  }

  function GM_setValue(key, value) {
    remember(key, value);
    if (!chromeAlive()) return;
    try {
      const p = chrome.storage.local.set({ [key]: value });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
  }

  function GM_deleteValue(key) {
    delete cache[key];
    try { localStorage.removeItem('dp_' + key); } catch (_) {}
    if (!chromeAlive()) return;
    try {
      const p = chrome.storage.local.remove(key);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) {}
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
      if (!chromeAlive()) return;
      try {
        const all = await chrome.storage.local.get(null);
        Object.keys(cache).forEach(k => delete cache[k]);
        Object.assign(cache, all || {});
      } catch (_) {}
    }
  };

  // Also attach classic names for easy porting
  global.GM_getValue = GM_getValue;
  global.GM_setValue = GM_setValue;
  global.GM_deleteValue = GM_deleteValue;
  global.GM_addValue = GM_addValue;
  global.GM_addStat = GM_addStat;
  global.GM_appendLog = GM_appendLog;

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

    if (!chromeAlive()) {
      if (details.onerror) details.onerror(new Error('Extension context invalidated'));
      return;
    }
    try {
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
    } catch (err) {
      if (details.onerror) details.onerror(err);
    }
  };

  // GM_addStyle polyfill
  global.GM_addStyle = function (css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };

})(typeof window !== 'undefined' ? window : self);
