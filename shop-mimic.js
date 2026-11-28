/**
 * Shop Mimic – Your Shop stock page helpers
 * - Redirect type=your → order_by=price
 * - Process Stock: save all priced items, then submit Update
 * - Add Prices: fill cost=0 fields from saved price book
 */
(function () {
  'use strict';

  const PRICE_BOOK_KEY = 'darthy_shop_price_book'; // { "item name lower": { name, price } }

  function getBook() {
    return GM_getValue(PRICE_BOOK_KEY, {}) || {};
  }
  function setBook(obj) {
    GM_setValue(PRICE_BOOK_KEY, obj || {});
  }

  function parsePrice(text) {
    if (!text) return 0;
    const n = parseInt(String(text).replace(/,/g, '').replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  function formatPriceInput(n) {
    return String(n || 0);
  }

  function isYourShopPage() {
    if (!/\/market\.phtml/i.test(location.pathname)) return false;
    const type = (new URLSearchParams(location.search).get('type') || '').toLowerCase();
    return type === 'your' || type === 'you' || type.startsWith('your');
  }

  function ensureOrderByPrice() {
    if (!isYourShopPage()) return;
    const params = new URLSearchParams(location.search);
    if ((params.get('order_by') || '').toLowerCase() === 'price') return;
    // Also trigger if Shop Stock nav is active
    const stockNav = document.querySelector('a.mkt-subnav__link.is-active[href*="type=your"], a.mkt-subnav__link[aria-current="page"][href*="type=your"]');
    if (!stockNav && !isYourShopPage()) return;

    if (sessionStorage.getItem('darthy_shop_order_price') === '1') return;
    sessionStorage.setItem('darthy_shop_order_price', '1');
    const url = new URL(location.href);
    url.searchParams.set('type', 'your');
    url.searchParams.set('order_by', 'price');
    location.replace(url.toString());
    setTimeout(() => sessionStorage.removeItem('darthy_shop_order_price'), 4000);
  }

  function collectShopRows() {
    const rows = [];
    document.querySelectorAll('tr.np-table-row').forEach(tr => {
      const nameEl = tr.querySelector('.market-your-item__name');
      const costInput = tr.querySelector('input[name^="cost_"]');
      const stockEl = tr.querySelector('.mkt-cell-label + b, td b');
      if (!nameEl || !costInput) return;
      const name = (nameEl.textContent || '').trim();
      if (!name) return;
      const price = parsePrice(costInput.value);
      let stock = 0;
      const stockMobile = tr.querySelector('.market-your-item__stock-mobile');
      if (stockMobile) {
        const m = (stockMobile.textContent || '').match(/(\d+)/);
        if (m) stock = parseInt(m[1], 10) || 0;
      }
      rows.push({ name, price, stock, costInput, tr });
    });
    return rows;
  }

  function processStock() {
    const rows = collectShopRows();
    const book = getBook();
    let saved = 0;
    let updated = 0;

    rows.forEach(r => {
      if (r.price <= 0) return;
      const key = r.name.toLowerCase();
      const prev = book[key];
      if (!prev || prev.price !== r.price) {
        if (prev && prev.price !== r.price) updated++;
        else saved++;
        book[key] = { name: r.name, price: r.price, ts: Date.now() };
      }
    });
    setBook(book);

    // Flash status then click real Update
    flash(`Process Stock: saved ${saved + updated} priced item(s)` + (updated ? ` (${updated} price changes)` : ''));

    const updateBtn = document.getElementById('market-your-update');
    if (updateBtn) {
      // Enable if disabled so submit works
      updateBtn.disabled = false;
      // Prefer form submit
      const form = updateBtn.closest('form');
      if (form) {
        setTimeout(() => {
          try { form.requestSubmit ? form.requestSubmit(updateBtn) : updateBtn.click(); } catch (_) { updateBtn.click(); }
        }, 400);
      } else {
        setTimeout(() => updateBtn.click(), 400);
      }
    }
  }

  function addPrices() {
    const rows = collectShopRows();
    const book = getBook();
    let filled = 0;
    rows.forEach(r => {
      if (r.price > 0) return; // already priced
      const entry = book[r.name.toLowerCase()];
      if (!entry || !entry.price) return;
      r.costInput.value = formatPriceInput(entry.price);
      r.costInput.dispatchEvent(new Event('input', { bubbles: true }));
      r.costInput.dispatchEvent(new Event('change', { bubbles: true }));
      filled++;
    });
    // Enable Update button if prices were filled
    const updateBtn = document.getElementById('market-your-update');
    if (updateBtn && filled > 0) updateBtn.disabled = false;
    flash(filled ? `Add Prices: filled ${filled} item(s) from price book` : 'Add Prices: no matching saved prices for unpriced items');
  }

  function flash(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:14%;left:50%;transform:translateX(-50%);background:#1e293b;color:#e2e8f0;border:2px solid #fbbf24;padding:12px 20px;border-radius:10px;z-index:999999;font-size:21px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-family:Verdana,sans-serif;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function injectButtons() {
    const row = document.querySelector('.market-your-submit-row');
    const updateBtn = document.getElementById('market-your-update');
    if (!row || !updateBtn) return false;
    if (document.getElementById('darthy-process-stock-btn')) {
      // Ensure Update stays hidden if we already injected
      updateBtn.style.display = 'none';
      return true;
    }

    // Hide native Update — Process Stock submits it
    updateBtn.style.display = 'none';
    updateBtn.setAttribute('aria-hidden', 'true');
    updateBtn.tabIndex = -1;

    // Neopets yellow style (matches button-yellow__2020 look)
    const yellowStyle = [
      'width:auto',
      'min-width:120px',
      'margin-right:8px',
      'padding:8px 16px',
      'border-radius:6px',
      'font-weight:bold',
      'font-size:21px',
      'cursor:pointer',
      'color:#3a2a00',
      'background:linear-gradient(180deg,#ffe566 0%,#f5c542 45%,#e0a800 100%)',
      'box-shadow:0 1px 0 rgba(255,255,255,0.45) inset, 0 2px 6px rgba(0,0,0,0.18)',
      'font-family:Verdana,Arial,sans-serif'
    ].join(';');

    // Add Prices — left, same yellow + gold border
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'darthy-add-prices-btn';
    addBtn.className = 'button-default__2020 button-yellow__2020';
    addBtn.style.cssText = yellowStyle + ';border:2px solid #d4a017;';
    addBtn.textContent = 'Add Prices';
    addBtn.onclick = (e) => { e.preventDefault(); addPrices(); };

    // Process Stock — right of Add Prices, Neopets yellow
    const processBtn = document.createElement('button');
    processBtn.type = 'button';
    processBtn.id = 'darthy-process-stock-btn';
    processBtn.className = 'button-default__2020 button-yellow__2020';
    processBtn.style.cssText = yellowStyle + ';border:1px solid #c9a227;';
    processBtn.textContent = 'Process Stock';
    processBtn.onclick = (e) => { e.preventDefault(); processStock(); };

    // Order: Add Prices | Process Stock  (Update hidden)
    row.insertBefore(processBtn, updateBtn);
    row.insertBefore(addBtn, processBtn);

    console.log('%c[DarthyPrime Shop Mimic] Add Prices + Process Stock (Update hidden)', 'color:#fbbf24;font-weight:bold');
    return true;
  }

  window.DarthyPrimeShopMimic = {
    init: function () {
      if (!/\/market\.phtml/i.test(location.pathname)) return;

      // Redirect your-shop pages to price sort
      ensureOrderByPrice();

      if (!isYourShopPage()) return;

      // Inject buttons when stock table is present
      let tries = 0;
      const tick = () => {
        if (injectButtons() || tries > 20) return;
        tries++;
        setTimeout(tick, 400);
      };
      tick();
    }
  };
})();
