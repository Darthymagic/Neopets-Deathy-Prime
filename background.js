/**
 * Neopets Darthy Prime – background service worker (MV3)
 * - Handles cross-origin fetches for GM_xmlhttpRequest (Jellyneo etc.)
 * - Keeps the extension alive for messaging
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      darthy_pet_name: 'Darthenvy',
      darthy_modules: {
        stats: true,
        notification: true,
        stamp: true,
        shop: true
      },
      darthy_shop_profit_total: 0
    });
    console.log('[DarthyPrime] Installed – default pet set to Darthenvy');
  }
});

let storageChain = Promise.resolve();
function enqueueStorage(fn) {
  const run = storageChain.then(fn, fn);
  storageChain = run.catch(() => {});
  return run;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ ok: true, version: '1.1.0' });
    return true;
  }

  if (msg.type === 'storage-add') {
    const key = msg.key;
    const amount = Number(msg.amount) || 0;
    enqueueStorage(async () => {
      const data = await chrome.storage.local.get(key);
      const next = (Number(data[key]) || 0) + amount;
      await chrome.storage.local.set({ [key]: next });
      sendResponse({ value: next });
    }).catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  if (msg.type === 'storage-add-stat') {
    const key = msg.key;
    const stat = msg.stat;
    const amount = Number(msg.amount) || 0;
    enqueueStorage(async () => {
      const data = await chrome.storage.local.get(key);
      const stats = Object.assign({ level: 0, hp: 0, strength: 0, defence: 0 }, data[key] || {});
      if (Object.prototype.hasOwnProperty.call(stats, stat)) stats[stat] += amount;
      await chrome.storage.local.set({ [key]: stats });
      sendResponse({ stats });
    }).catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  if (msg.type === 'storage-append-log') {
    enqueueStorage(async () => {
      const today = msg.today;
      const got = await chrome.storage.local.get([msg.logKey, msg.dateKey]);
      let log = Array.isArray(got[msg.logKey]) ? got[msg.logKey].slice() : [];
      const storedDate = got[msg.dateKey] || '';
      if (storedDate !== today) log = [];
      const line = String(msg.line || '').trim();
      if (line && log[log.length - 1] !== line) {
        log.push(line);
        if (log.length > 120) log.shift();
      }
      await chrome.storage.local.set({ [msg.logKey]: log, [msg.dateKey]: today });
      sendResponse({ log, date: today });
    }).catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  if (msg.type === 'gm-xhr') {
    // Perform the fetch from the background (no CORS restriction)
    const opts = {
      method: msg.method || 'GET',
      headers: msg.headers || {},
      credentials: 'omit'
    };
    if (msg.data) {
      opts.body = msg.data;
    }

    fetch(msg.url, opts)
      .then(async (resp) => {
        const text = await resp.text();
        sendResponse({
          responseText: text,
          status: resp.status,
          statusText: resp.statusText,
          finalUrl: resp.url
        });
      })
      .catch((err) => {
        console.warn('[DarthyPrime] background fetch failed:', msg.url, err);
        sendResponse({ error: err.message || String(err) });
      });

    // Keep the message channel open for the async response
    return true;
  }

  return false;
});
