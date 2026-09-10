/**
 * ShopWiz Pro – expand native Shop Wizard results grid
 * No separate panel: stacks unique shops into the existing results list,
 * sorted lowest→highest, max 200, lowest price highlighted red, expandable.
 * Page: https://www.neopets.com/shops/wizard.phtml
 */
(function () {
  'use strict';

  const MAX_SHOPS = 200;
  const COLLAPSED_MAX = 12; // rows shown when collapsed

  // In-memory only — does NOT survive refresh / leaving the page
  let memState = { itemKey: '', shops: {}, expanded: false };

  function isWizardPage() {
    return /\/shops\/wizard\.phtml/i.test(location.pathname + location.href);
  }

  function parsePrice(text) {
    if (!text) return 0;
    const n = parseInt(String(text).replace(/,/g, '').replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  function formatNP(n) {
    return (n || 0).toLocaleString() + ' NP';
  }

  function loadState() {
    return memState;
  }

  function saveState(state) {
    memState = state || { itemKey: '', shops: {}, expanded: false };
  }

  function getSearchKey() {
    const input =
      document.querySelector('input[name="shopwizard"]') ||
      document.querySelector('#shopwizard') ||
      document.querySelector('input[type="text"][name*="wizard"]');
    const q = input ? String(input.value || '').trim().toLowerCase() : '';
    return q || 'default';
  }

  function findResultsGrid() {
    return document.querySelector('.wizard-results-grid.wizard-results-grid-shop') ||
           document.querySelector('.wizard-results-grid');
  }

  function scrapeResults(grid) {
    if (!grid) return [];
    const out = [];
    grid.querySelectorAll('li').forEach(li => {
      if (li.classList.contains('wizard-results-grid-header')) return;
      if (li.classList.contains('dsw-native-ctrl')) return;
      const a = li.querySelector('a[href*="browseshop.phtml"]');
      if (!a) return;
      const owner = (a.textContent || '').trim();
      if (!owner) return;
      let href = a.getAttribute('href') || '';
      if (href.startsWith('/')) href = 'https://www.neopets.com' + href;
      const stockP = li.querySelector('p');
      const stock = stockP ? parseInt(String(stockP.textContent).replace(/[^\d]/g, ''), 10) || 0 : 0;
      const priceEl = li.querySelector('.wizard-results-price');
      const price = parsePrice(priceEl ? priceEl.textContent : '');
      if (!price) return;
      out.push({ owner, stock, price, link: href });
    });
    return out;
  }

  function mergeShops(existingMap, rows) {
    const map = Object.assign({}, existingMap);
    rows.forEach(r => {
      const key = r.owner.toLowerCase();
      const prev = map[key];
      if (!prev || r.price < prev.price) {
        map[key] = { owner: r.owner, stock: r.stock, price: r.price, link: r.link };
      } else if (prev && r.price === prev.price) {
        map[key] = {
          owner: r.owner,
          stock: r.stock || prev.stock,
          price: prev.price,
          link: r.link || prev.link
        };
      }
    });

    let list = Object.values(map).sort((a, b) => a.price - b.price || a.owner.localeCompare(b.owner));
    if (list.length > MAX_SHOPS) {
      list = list.slice(0, MAX_SHOPS);
      const kept = {};
      list.forEach(s => { kept[s.owner.toLowerCase()] = s; });
      return kept;
    }
    return map;
  }

  function sortedList(map) {
    return Object.values(map).sort((a, b) => a.price - b.price || a.owner.localeCompare(b.owner));
  }

  function injectStyles() {
    if (document.getElementById('darthy-shopwiz-pro-css')) return;
    const style = document.createElement('style');
    style.id = 'darthy-shopwiz-pro-css';
    style.textContent = `
      .wizard-results-grid .dsw-lowest a {
        color: #dc2626 !important;
        font-weight: bold !important;
      }
      .wizard-results-grid .dsw-lowest .wizard-results-price {
        color: #dc2626 !important;
        font-weight: bold !important;
      }
      .wizard-results-grid li.dsw-lowest {
        background: rgba(220, 38, 38, 0.08);
        outline: 1px solid rgba(220, 38, 38, 0.35);
        border-radius: 4px;
      }
      .wizard-results-grid li.dsw-native-ctrl {
        display: flex !important;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        padding: 8px 6px !important;
        background: #f1f5f9;
        border-radius: 6px;
        margin: 6px 0;
        grid-column: 1 / -1;
      }
      .wizard-results-grid .dsw-ctrl-meta {
        font-size: 12px;
        color: #334155;
        font-weight: bold;
      }
      .wizard-results-grid .dsw-ctrl-btns {
        display: flex;
        gap: 6px;
      }
      .wizard-results-grid .dsw-ctrl-btns button {
        font-size: 11px;
        font-weight: bold;
        padding: 5px 10px;
        border-radius: 5px;
        border: 1px solid #94a3b8;
        background: #fff;
        cursor: pointer;
        color: #0f172a;
      }
      .wizard-results-grid .dsw-ctrl-btns button.dsw-primary {
        background: #2563eb;
        border-color: #1d4ed8;
        color: #fff;
      }
      .wizard-results-grid.dsw-collapsed li.dsw-shop-row.dsw-overflow {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function rebuildNativeList(grid, list, expanded) {
    if (!grid) return;
    let ul = grid.querySelector('ul');
    if (!ul) {
      ul = document.createElement('ul');
      grid.appendChild(ul);
    }

    // Keep / rebuild header
    const headerHtml = `<li class="wizard-results-grid-header">
      <h3>Shop Owner</h3>
      <h3>Stock</h3>
      <h3>Price</h3>
    </li>`;

    const lowest = list.length ? list[0].price : null;
    const rows = list.map((s, i) => {
      const isLow = s.price === lowest;
      const overflow = (!expanded && i >= COLLAPSED_MAX) ? ' dsw-overflow' : '';
      const lowCls = isLow ? ' dsw-lowest' : '';
      // Relative link like native
      let href = s.link || '#';
      try {
        const u = new URL(href, 'https://www.neopets.com');
        href = u.pathname + u.search;
      } catch (_) {}
      return `<li class="dsw-shop-row${lowCls}${overflow}">
        <a href="${href}">${s.owner}</a>
        <p>${s.stock}</p>
        <div class="wizard-results-price">${formatNP(s.price)}</div>
      </li>`;
    }).join('');

    const shown = expanded ? list.length : Math.min(list.length, COLLAPSED_MAX);
    const canExpand = list.length > COLLAPSED_MAX;
    const ctrl = `<li class="dsw-native-ctrl">
      <span class="dsw-ctrl-meta">ShopWiz Pro · ${list.length} / ${MAX_SHOPS} shops · showing ${shown}${canExpand ? (expanded ? ' (expanded)' : ' (collapsed)') : ''} · lowest → highest</span>
      <span class="dsw-ctrl-btns">
        ${canExpand ? `<button type="button" id="dsw-toggle" class="dsw-primary">${expanded ? 'Collapse' : 'Expand all'}</button>` : ''}
        <button type="button" id="dsw-clear">Clear stack</button>
      </span>
    </li>`;

    ul.innerHTML = headerHtml + ctrl + rows;

    if (expanded) grid.classList.remove('dsw-collapsed');
    else grid.classList.add('dsw-collapsed');

    const toggle = ul.querySelector('#dsw-toggle');
    if (toggle) {
      toggle.onclick = (e) => {
        e.preventDefault();
        const st = loadState();
        st.expanded = !st.expanded;
        saveState(st);
        rebuildNativeList(grid, list, st.expanded);
      };
    }
    const clearBtn = ul.querySelector('#dsw-clear');
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.preventDefault();
        const st = loadState();
        st.shops = {};
        st.expanded = false;
        saveState(st);
        // Restore whatever is currently on the page from a fresh scrape only
        ingest(true);
      };
    }
  }

  function ingest(forceEmpty) {
    const grid = findResultsGrid();
    if (!grid && !forceEmpty) return;

    injectStyles();

    const key = getSearchKey();
    let state = loadState();
    if (state.itemKey && state.itemKey !== key) {
      state = { itemKey: key, shops: {}, expanded: false };
    }
    state.itemKey = key;

    if (!forceEmpty && grid) {
      const rows = scrapeResults(grid);
      if (rows.length) {
        state.shops = mergeShops(state.shops, rows);
      }
    }

    saveState(state);
    const list = sortedList(state.shops);
    if (grid) {
      rebuildNativeList(grid, list, !!state.expanded);
    }

    console.log('%c[ShopWiz Pro] ' + list.length + ' shops in native grid', 'color:#38bdf8;font-weight:bold');
  }

  window.DarthyPrimeShopWiz = {
    init: function () {
      if (!isWizardPage()) return;

      injectStyles();
      setTimeout(() => ingest(), 400);

      const obs = new MutationObserver(() => {
        // Only re-ingest when native results appear/change, not when we rewrite
        if (window.__dswRewriting) return;
        const grid = findResultsGrid();
        if (!grid) return;
        // If our ctrl is missing but shop links exist, native just refreshed
        if (grid.querySelector('a[href*="browseshop"]') && !grid.querySelector('.dsw-native-ctrl')) {
          clearTimeout(window.__dswIngestT);
          window.__dswIngestT = setTimeout(() => {
            window.__dswRewriting = true;
            try { ingest(); } finally {
              setTimeout(() => { window.__dswRewriting = false; }, 100);
            }
          }, 200);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });

      document.addEventListener('click', function (e) {
        const t = e.target;
        if (t && (t.id === 'resubmitWizard' || (t.closest && t.closest('#resubmitWizard')))) {
          setTimeout(() => ingest(), 500);
          setTimeout(() => ingest(), 1100);
        }
      }, true);

      console.log('%c[DarthyPrime] ShopWiz Pro (native grid) active', 'color:#38bdf8;font-weight:bold');
    }
  };
})();
