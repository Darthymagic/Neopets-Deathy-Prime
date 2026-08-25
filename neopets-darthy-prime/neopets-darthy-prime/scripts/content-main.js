/**
 * Neopets Darthy Prime – content script orchestrator
 */
(async function () {
  'use strict';

  if (window.DarthyPrimeStorage && window.DarthyPrimeStorage.ready) {
    await window.DarthyPrimeStorage.ready;
  }

  function injectBadge() {
    if (document.getElementById('darthy-prime-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'darthy-prime-badge';
    badge.className = 'darthy-prime-badge';
    badge.textContent = 'Darthy Prime ✓';
    document.body.appendChild(badge);
    setTimeout(() => {
      badge.style.transition = 'opacity 0.6s';
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 700);
    }, 3500);
  }

  try {
    // 0. First-run setup (pet + shop name)
    if (window.DarthyPrimeSetup && typeof window.DarthyPrimeSetup.init === 'function') {
      window.DarthyPrimeSetup.init();
    }

    // 1. Stats Tracker
    if (window.DarthyPrimeStats && typeof window.DarthyPrimeStats.init === 'function') {
      await window.DarthyPrimeStats.init();
    }

    // 2. Notification / Training Helper
    if (window.DarthyPrimeNotify && typeof window.DarthyPrimeNotify.init === 'function') {
      window.DarthyPrimeNotify.init();
    }

    // 3. Stamp Album Helper
    if (window.DarthyPrimeStamp && typeof window.DarthyPrimeStamp.init === 'function') {
      window.DarthyPrimeStamp.init();
    }

    // 4. Shop Profit + Spending Tracker
    if (window.DarthyPrimeShop && typeof window.DarthyPrimeShop.init === 'function') {
      window.DarthyPrimeShop.init();
    }

    // 5. Shop Mimic (Process Stock / Add Prices)
    if (window.DarthyPrimeShopMimic && typeof window.DarthyPrimeShopMimic.init === 'function') {
      window.DarthyPrimeShopMimic.init();
    }

    // 6. Random Events tracker
    if (window.DarthyPrimeRE && typeof window.DarthyPrimeRE.init === 'function') {
      window.DarthyPrimeRE.init();
    }

    // 7. Home pets grid (rows of 5)
    if (window.DarthyPrimeHomePets && typeof window.DarthyPrimeHomePets.init === 'function') {
      window.DarthyPrimeHomePets.init();
    }

    // 8. ShopWiz Pro
    if (window.DarthyPrimeShopWiz && typeof window.DarthyPrimeShopWiz.init === 'function') {
      window.DarthyPrimeShopWiz.init();
    }


    injectBadge();
    console.log('%c🐾 Neopets Darthy Prime loaded', 'color:#4a90e2;font-weight:bold;font-size:13px');
  } catch (err) {
    console.error('[DarthyPrime] Init error:', err);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'get-stats') {
      const s = window.DarthyPrimeStats ? window.DarthyPrimeStats.getStats() : null;
      const profit = window.DarthyPrimeShop ? window.DarthyPrimeShop.getProfit() : 0;
      const spend = window.DarthyPrimeShop ? window.DarthyPrimeShop.getSpend() : 0;
      const shopName = window.DarthyPrimeShop ? window.DarthyPrimeShop.getShopName() : '';
      sendResponse({ ok: true, stats: s, shopProfit: profit, spending: spend, shopName });
    } else if (msg.type === 'reload-pet-name') {
      location.reload();
    }
    return true;
  });
})();
