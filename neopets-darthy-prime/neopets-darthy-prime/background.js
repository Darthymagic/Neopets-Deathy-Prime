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

// Handle GM_xmlhttpRequest proxy + simple pings
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ ok: true, version: '1.1.0' });
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
