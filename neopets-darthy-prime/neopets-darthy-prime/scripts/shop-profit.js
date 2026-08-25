/**
 * Shop Profit + Spending Tracker
 * - Shop sales history → Process Shop History → running profit total
 * - Usershop buy success popup → add to Spending total
 * - Trading Post lot purchase → add to Spending total
 * - Profile dropdown shows: Shop Name, Shop Profit, Spending Tracker
 */
(function () {
  'use strict';

  const PROFIT_KEY = 'darthy_shop_profit_total';
  const SPEND_KEY = 'darthy_spending_total';
  const SHOP_NAME_KEY = 'darthy_shop_name';
  const TRACK_TEXT_KEY = 'darthy_shop_track_text';
  const TRACK_COUNTS_KEY = 'darthy_shop_track_counts'; // { "negg": { name: "Negg", target: 4, sold: 2 }, ... }

  function parsePrice(text) {
    if (!text) return 0;
    const cleaned = String(text)
      .replace(/,/g, '')
      .replace(/\s*NP\s*/i, '')
      .replace(/[^\d]/g, '')
      .trim();
    const n = parseInt(cleaned, 10);
    return isNaN(n) ? 0 : n;
  }

  function formatNP(n) {
    return (n || 0).toLocaleString('en-US') + ' NP';
  }

  function getProfit() { return GM_getValue(PROFIT_KEY, 0) || 0; }
  function setProfit(val) {
    GM_setValue(PROFIT_KEY, val);
    try { chrome.runtime.sendMessage({ type: 'shop-profit-updated', total: val }).catch(() => {}); } catch (_) {}
  }
  function addProfit(amount) {
    if (!amount || amount <= 0) return getProfit();
    const t = getProfit() + amount;
    setProfit(t);
    return t;
  }

  function getSpend() { return GM_getValue(SPEND_KEY, 0) || 0; }
  function setSpend(val) {
    GM_setValue(SPEND_KEY, val);
    try { chrome.runtime.sendMessage({ type: 'spending-updated', total: val }).catch(() => {}); } catch (_) {}
  }
  function addSpend(amount) {
    if (!amount || amount <= 0) return getSpend();
    // Soft caps from user: usershop ~1e6, TP ~2e7 per txn – ignore absurd values
    if (amount > 20000000) return getSpend();
    const t = getSpend() + amount;
    setSpend(t);
    return t;
  }

  function getShopName() {
    return GM_getValue(SHOP_NAME_KEY, '') || '';
  }

  // ---------- Item track / restock list ----------
  function normalizeItemName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function parseTrackLine(line) {
    line = String(line || '').trim();
    if (!line) return null;
    // "Negg x 4" or "Negg x4" or just "Negg"
    const m = line.match(/^(.+?)(?:\s+x\s*(\d+)\s*)?$/i);
    if (!m) return null;
    const name = m[1].trim();
    if (!name) return null;
    const target = m[2] ? Math.max(1, parseInt(m[2], 10) || 1) : 1;
    return { name, target };
  }

  function getTrackText() {
    return GM_getValue(TRACK_TEXT_KEY, '') || '';
  }

  function setTrackText(val) {
    GM_setValue(TRACK_TEXT_KEY, val || '');
  }

  function getTrackCounts() {
    return GM_getValue(TRACK_COUNTS_KEY, {}) || {};
  }

  function setTrackCounts(obj) {
    GM_setValue(TRACK_COUNTS_KEY, obj || {});
  }

  /**
   * Rebuild counts from textarea text, preserving sold progress for items still listed.
   */
  function saveTrackListFromText(rawText) {
    const prev = getTrackCounts();
    const next = {};
    const lines = String(rawText || '').split(/\r?\n/);
    lines.forEach(line => {
      const parsed = parseTrackLine(line);
      if (!parsed) return;
      const key = normalizeItemName(parsed.name);
      if (!key) return;
      // If same item appears twice in list, keep the higher target
      const already = next[key];
      const target = already ? Math.max(already.target, parsed.target) : parsed.target;
      const prevSold = prev[key] ? (prev[key].sold || 0) : 0;
      next[key] = {
        name: already ? already.name : parsed.name,
        target,
        sold: Math.min(prevSold, target)
      };
    });
    setTrackText(rawText);
    setTrackCounts(next);
    return next;
  }

  function applySalesToTrackList(sales) {
    if (!sales || !sales.length) return { updated: 0, newlySoldOut: [] };
    const counts = getTrackCounts();
    if (!Object.keys(counts).length) return { updated: 0, newlySoldOut: [] };

    let updated = 0;
    const newlySoldOut = [];

    sales.forEach(sale => {
      const key = normalizeItemName(sale.item);
      const entry = counts[key];
      if (!entry) return;
      const before = entry.sold || 0;
      if (before >= entry.target) return; // already sold out, don't keep stacking
      entry.sold = before + 1;
      updated++;
      if (before < entry.target && entry.sold >= entry.target) {
        newlySoldOut.push(entry.name);
      }
    });

    setTrackCounts(counts);
    return { updated, newlySoldOut };
  }

  function getSoldOutItems() {
    const counts = getTrackCounts();
    return Object.values(counts).filter(e => (e.sold || 0) >= (e.target || 1));
  }

  function getInProgressItems() {
    const counts = getTrackCounts();
    return Object.values(counts).filter(e => (e.sold || 0) < (e.target || 1));
  }

  function restockSoldOut() {
    const counts = getTrackCounts();
    let n = 0;
    Object.keys(counts).forEach(key => {
      const e = counts[key];
      if ((e.sold || 0) >= (e.target || 1)) {
        e.sold = 0;
        n++;
      }
    });
    setTrackCounts(counts);
    return n;
  }

  function formatTrackProgressLine(entry) {
    const sold = entry.sold || 0;
    const target = entry.target || 1;
    const done = sold >= target;
    return `${entry.name}  ${sold}/${target}${done ? '  ✓ SOLD OUT' : ''}`;
  }

  // ---------- Profile dropdown ----------
  function ensureFinanceInDropdown() {
    const section = document.getElementById('neopets-stats-section');
    if (!section) return;

    // Prefer inserting after #stat-days
    const daysEl = document.getElementById('stat-days');
    if (!daysEl) return;

    let row = document.getElementById('shop-profit-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'shop-profit-row';
      row.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid #4a4a6a;';
      daysEl.parentNode.insertBefore(row, daysEl.nextSibling);
    }

    const shopName = getShopName();
    const nameLine = shopName
      ? `<div style="font-weight:bold;color:#fbbf24;margin-bottom:4px;font-size:12px;">${escapeHtml(shopName)}</div>`
      : `<div style="font-weight:bold;color:#fbbf24;margin-bottom:3px;font-size:12px;">Shop Profit</div>`;

    row.innerHTML = `
      ${nameLine}
      <div style="font-size:12px;">Profit: <span id="shop-profit-value" style="color:#4ade80;font-weight:bold;">${formatNP(getProfit())}</span></div>
      <div style="font-size:12px;margin-top:3px;">Spending: <span id="shop-spend-value" style="color:#f87171;font-weight:bold;">${formatNP(getSpend())}</span></div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateDropdownFinance() {
    const profitEl = document.getElementById('shop-profit-value');
    const spendEl = document.getElementById('shop-spend-value');
    if (profitEl) profitEl.textContent = formatNP(getProfit());
    if (spendEl) spendEl.textContent = formatNP(getSpend());
    if (!profitEl || !spendEl) ensureFinanceInDropdown();
  }

  // ---------- Sales History (profit) ----------
  function isSalesHistoryPage() {
    const url = location.href.toLowerCase();
    return (url.includes('market.phtml') && (url.includes('type=sales') || url.includes('type=history'))) ||
           document.querySelector('input[type="submit"][value="Clear Sales History"]') ||
           document.querySelector('input[type="submit"][value="Process Shop History"]');
  }

  function findSalesTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headerText = table.innerText || '';
      if (headerText.includes('Date') && headerText.includes('Item') &&
          headerText.includes('Buyer') && headerText.includes('Price')) {
        return table;
      }
    }
    return null;
  }

  /** Static notice always present on sales history page */
  function findSalesAnchor() {
    const paras = document.querySelectorAll('p');
    for (const p of paras) {
      const t = (p.textContent || '').replace(/\s+/g, ' ').trim();
      if (/Only purchases of\s*1000\s*NP\s*or greater will be displayed here/i.test(t)) {
        return p;
      }
      // looser match
      if (/Only purchases of/i.test(t) && /1000\s*NP/i.test(t) && /displayed here/i.test(t)) {
        return p;
      }
    }
    // XPath-ish fallback via query
    for (const p of document.querySelectorAll('p[align="center"], p')) {
      if (p.querySelector('b') && /1000\s*NP/i.test(p.textContent || '')) {
        const t = p.textContent || '';
        if (/purchases/i.test(t) && /displayed/i.test(t)) return p;
      }
    }
    return null;
  }

  function extractSales(table) {
    const rows = table.querySelectorAll('tr');
    const sales = [];
    let total = 0;

    rows.forEach(tr => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 4) return;

      const dateText = (cells[0].textContent || '').trim();
      const itemText = (cells[1].textContent || '').trim();
      const buyerCell = cells[2];
      const priceText = (cells[3].textContent || '').trim();

      if (!itemText || itemText.toLowerCase() === 'item' ||
          dateText.toLowerCase() === 'date' ||
          priceText.toLowerCase().includes('clear')) {
        return;
      }
      if (!/NP/i.test(priceText) && !/[\d,]+/.test(priceText)) return;

      const price = parsePrice(priceText);
      if (price <= 0) return;

      let buyer = '';
      const link = buyerCell.querySelector('a');
      if (link) {
        const href = link.getAttribute('href') || '';
        const m = href.match(/randomfriend=([^&]+)/i);
        buyer = m ? m[1] : (link.textContent || '').trim();
      } else {
        buyer = (buyerCell.textContent || '').trim();
      }

      sales.push({ date: dateText, item: itemText, buyer, price });
      total += price;
    });

    return { sales, total };
  }

  function renderTrackPanels() {
    const progressEl = document.getElementById('darthy-track-progress');
    const soldOutEl = document.getElementById('darthy-track-soldout');

    const inProgress = getInProgressItems();
    const soldOut = getSoldOutItems();

    if (progressEl) {
      if (inProgress.length === 0 && soldOut.length === 0) {
        progressEl.innerHTML = '<div style="color:#64748b;font-size:11px;">No items tracked yet. Paste a list and click Save List.</div>';
      } else if (inProgress.length === 0) {
        progressEl.innerHTML = '<div style="color:#94a3b8;font-size:11px;">All tracked items are sold out.</div>';
      } else {
        progressEl.innerHTML = inProgress.map(e => {
          const pct = Math.min(100, Math.round(((e.sold || 0) / (e.target || 1)) * 100));
          return `<div style="display:flex;justify-content:space-between;gap:6px;padding:4px 0;border-bottom:1px solid #334155;font-size:11px;">
            <span style="word-break:break-word;">${escapeHtml(e.name)}</span>
            <span style="color:#7dd3fc;font-weight:bold;white-space:nowrap;">${e.sold || 0}/${e.target || 1}</span>
          </div>`;
        }).join('');
      }
    }

    if (soldOutEl) {
      if (soldOut.length === 0) {
        soldOutEl.innerHTML = '<div style="color:#64748b;font-size:11px;">None — nothing needs restocking.</div>';
      } else {
        soldOutEl.innerHTML = soldOut.map(e =>
          `<div style="padding:4px 0;border-bottom:1px solid #7f1d1d;font-size:11px;color:#fca5a5;">
            ${escapeHtml(e.name)} <span style="color:#f87171;">×${e.target || 1}</span>
          </div>`
        ).join('');
      }
    }
  }

  function ensureSalesLayout(centerEl) {
    // Already wrapped?
    if (document.getElementById('darthy-sales-layout')) {
      // If a real sales table appeared and is not inside the layout, re-home onto the table
      const layout = document.getElementById('darthy-sales-layout');
      const table = findSalesTable();
      const center = document.getElementById('darthy-sales-center');
      if (table && center && !center.contains(table)) {
        // Move table into center; leave the 1000 NP notice above the layout if it was the old center
        const notice = findSalesAnchor();
        if (notice && center.contains(notice)) {
          // Put notice back above the layout
          layout.parentNode.insertBefore(notice, layout);
        }
        center.innerHTML = '';
        center.appendChild(table);
      }
      renderTrackPanels();
      return layout;
    }

    if (!centerEl || !centerEl.parentNode) return null;

    const layout = document.createElement('div');
    layout.id = 'darthy-sales-layout';
    layout.style.cssText = `
      display:flex; align-items:flex-start; justify-content:center; gap:14px;
      flex-wrap:wrap; margin: 12px auto; max-width: 1100px;
      font-family: Verdana, Arial, sans-serif;
    `;

    const parent = centerEl.parentNode;
    parent.insertBefore(layout, centerEl);

    // Left – track
    const left = document.createElement('div');
    left.id = 'darthy-track-left';
    left.style.cssText = `
      width: 220px; min-width: 180px; flex: 0 0 220px;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 2px solid #38bdf8; border-radius: 10px;
      padding: 12px; color: #e2e8f0; box-sizing: border-box;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    `;
    left.innerHTML = `
      <div style="font-size:12px;color:#38bdf8;font-weight:bold;margin-bottom:6px;">📦 Track Items</div>
      <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;line-height:1.35;">
        One per line. <b>Negg x 4</b> = track 4 sales. Plain name = 1.
      </div>
      <textarea id="darthy-track-textarea" spellcheck="false" placeholder="Negg x 4&#10;Mauket&#10;Woodland Mortog x 2"
        style="width:100%;height:180px;resize:vertical;overflow:auto;box-sizing:border-box;
               background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:6px;
               padding:8px;font-size:11px;font-family:Verdana,monospace;line-height:1.4;"></textarea>
      <button id="darthy-track-save" style="margin-top:8px;width:100%;background:#2563eb;color:white;border:none;padding:7px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">Save List</button>
      <div id="darthy-track-save-status" style="font-size:10px;color:#4ade80;min-height:14px;margin-top:4px;text-align:center;"></div>
      <div style="font-size:11px;color:#7dd3fc;font-weight:bold;margin:10px 0 4px;">In progress</div>
      <div id="darthy-track-progress" style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px 8px;max-height:200px;overflow-y:auto;"></div>
    `;

    // Center – only the chosen element (table OR notice), never both stacked in a way that overlaps
    const center = document.createElement('div');
    center.id = 'darthy-sales-center';
    center.style.cssText = 'flex: 0 1 auto; max-width: 100%; overflow-x: auto; text-align:center;';
    center.appendChild(centerEl);

    // Right – restock
    const right = document.createElement('div');
    right.id = 'darthy-track-right';
    right.style.cssText = `
      width: 220px; min-width: 180px; flex: 0 0 220px;
      background: linear-gradient(135deg, #1c0a0a, #0f172a);
      border: 2px solid #f87171; border-radius: 10px;
      padding: 12px; color: #e2e8f0; box-sizing: border-box;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    `;
    right.innerHTML = `
      <div style="font-size:12px;color:#f87171;font-weight:bold;margin-bottom:6px;">🔁 Needs Restock</div>
      <div style="font-size:10px;color:#94a3b8;margin-bottom:8px;line-height:1.35;">
        Items that hit their track target. Restock in your shop, then click Stocked.
      </div>
      <div id="darthy-track-soldout" style="background:#1c0a0a;border:1px solid #7f1d1d;border-radius:6px;padding:6px 8px;max-height:320px;overflow-y:auto;min-height:80px;"></div>
      <button id="darthy-track-stocked" style="margin-top:10px;width:100%;background:#16a34a;color:white;border:none;padding:8px;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;">Stocked</button>
      <div style="font-size:10px;color:#64748b;margin-top:6px;text-align:center;">Resets sold counters so tracking starts again.</div>
    `;

    layout.appendChild(left);
    layout.appendChild(center);
    layout.appendChild(right);

    const ta = left.querySelector('#darthy-track-textarea');
    if (ta) ta.value = getTrackText() || '';

    left.querySelector('#darthy-track-save').onclick = () => {
      const raw = document.getElementById('darthy-track-textarea').value;
      saveTrackListFromText(raw);
      renderTrackPanels();
      const st = document.getElementById('darthy-track-save-status');
      if (st) {
        st.textContent = 'Saved ✓';
        setTimeout(() => { st.textContent = ''; }, 1800);
      }
    };

    right.querySelector('#darthy-track-stocked').onclick = () => {
      const soldOut = getSoldOutItems();
      if (!soldOut.length) {
        alert('Nothing is sold out right now.');
        return;
      }
      if (!confirm(`Mark ${soldOut.length} sold-out item(s) as restocked and start tracking again?`)) return;
      const n = restockSoldOut();
      renderTrackPanels();
      const st = document.getElementById('darthy-track-save-status');
      if (st) {
        st.textContent = `Restocked ${n} item(s) ✓`;
        setTimeout(() => { st.textContent = ''; }, 2000);
      }
    };

    if (getTrackText() && !Object.keys(getTrackCounts()).length) {
      saveTrackListFromText(getTrackText());
    }
    renderTrackPanels();

    return layout;
  }

  function injectProfitDisplay(table) {
    // Side panels around the sales table
    ensureSalesLayout(table);

    // Profit panel below the layout (or below table if layout failed)
    const old = document.getElementById('darthy-shop-profit-panel');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = 'darthy-shop-profit-panel';
    panel.style.cssText = `
      margin: 16px auto; max-width: 530px;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 2px solid #fbbf24; border-radius: 10px;
      padding: 14px 18px; text-align: center;
      font-family: Verdana, Arial, sans-serif; color: #e2e8f0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    `;

    const shopName = getShopName();
    const title = shopName ? escapeHtml(shopName) : 'Shop Profit Tracker';

    panel.innerHTML = `
      <div style="font-size:13px;color:#fbbf24;font-weight:bold;margin-bottom:6px;">💰 ${title}</div>
      <div style="font-size:18px;font-weight:bold;color:#4ade80;margin:6px 0;" id="darthy-profit-display">
        Profit: ${formatNP(getProfit())}
      </div>
      <div style="font-size:16px;font-weight:bold;color:#f87171;margin:4px 0;" id="darthy-spend-display">
        Spending: ${formatNP(getSpend())}
      </div>
      <div style="font-size:11px;color:#94a3b8;margin:10px 0 8px;">
        Click "Process Shop History" to add current sales to Profit + update tracked items, then clear history.
      </div>
      <button id="darthy-reset-profit-btn" style="background:#dc2626;color:white;border:none;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;margin:0 4px;">Reset Profit</button>
      <button id="darthy-reset-spend-btn" style="background:#b45309;color:white;border:none;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;margin:0 4px;">Reset Spending</button>
    `;

    const layout = document.getElementById('darthy-sales-layout');
    if (layout && layout.parentNode) {
      layout.parentNode.insertBefore(panel, layout.nextSibling);
    } else {
      table.parentNode.insertBefore(panel, table.nextSibling);
    }

    document.getElementById('darthy-reset-profit-btn').onclick = () => {
      if (!confirm('Reset Shop Profit total to 0?')) return;
      setProfit(0);
      updateFinanceUI();
    };
    document.getElementById('darthy-reset-spend-btn').onclick = () => {
      if (!confirm('Reset Spending Tracker total to 0?')) return;
      setSpend(0);
      updateFinanceUI();
    };
  }

  function updateFinanceUI() {
    const p = document.getElementById('darthy-profit-display');
    const s = document.getElementById('darthy-spend-display');
    if (p) p.textContent = `Profit: ${formatNP(getProfit())}`;
    if (s) s.textContent = `Spending: ${formatNP(getSpend())}`;
    updateDropdownFinance();
  }

  function processHistory(table, form) {
    const { sales, total } = extractSales(table);
    if (sales.length === 0) {
      alert('No sales found in the history table to process.');
      return;
    }

    // Auto-save track list from textarea if present (so latest edits are used)
    const ta = document.getElementById('darthy-track-textarea');
    if (ta) saveTrackListFromText(ta.value);

    const trackResult = applySalesToTrackList(sales);
    const newTotal = addProfit(total);
    const summary = sales.length === 1
      ? `Added ${formatNP(total)} from 1 sale.`
      : `Added ${formatNP(total)} from ${sales.length} sales.`;

    let trackLine = '';
    if (trackResult.updated > 0) {
      trackLine = `<br><span style="font-size:13px;">Tracked item sales updated: ${trackResult.updated}</span>`;
      if (trackResult.newlySoldOut.length) {
        trackLine += `<br><span style="font-size:12px;color:#fde68a;">Sold out: ${trackResult.newlySoldOut.join(', ')}</span>`;
      }
    }

    updateFinanceUI();
    renderTrackPanels();

    const banner = document.createElement('div');
    banner.style.cssText = `
      position:fixed;top:18%;left:50%;transform:translate(-50%,-50%);
      background:#16a34a;color:white;padding:18px 32px;border-radius:12px;
      box-shadow:0 10px 30px rgba(0,0,0,0.4);z-index:999999;font-size:16px;
      text-align:center;font-family:Verdana,sans-serif;
    `;
    banner.innerHTML = `
      ✅ <b>Shop history processed</b><br>
      <span style="font-size:14px;">${summary}</span><br>
      <span style="font-size:13px;opacity:0.9;">New profit total: ${formatNP(newTotal)}</span>
      ${trackLine}
    `;
    document.body.appendChild(banner);

    setTimeout(() => {
      banner.remove();
      if (form) form.submit();
      else {
        const clearBtn = document.querySelector('input[type="submit"][value="Clear Sales History"], input[type="submit"][value="Process Shop History"]');
        if (clearBtn && clearBtn.form) clearBtn.form.submit();
      }
    }, 1600);
  }

  function enhanceSalesPage() {
    const table = findSalesTable();
    const notice = findSalesAnchor();

    // Prefer sales history TABLE when present so panels flank it (no overlap with notice).
    // Fall back to the static 1000 NP notice when history is empty/cleared.
    if (table) {
      ensureSalesLayout(table);
      // Keep the notice above the layout if it exists and was not moved
      if (notice && notice.parentNode && notice.closest('#darthy-sales-layout')) {
        const layout = document.getElementById('darthy-sales-layout');
        if (layout && layout.parentNode) {
          layout.parentNode.insertBefore(notice, layout);
        }
      }
    } else if (notice) {
      ensureSalesLayout(notice);
    } else {
      injectStandaloneTrackLayout();
      return;
    }

    if (table) {
      let processBtn =
        document.querySelector('input[type="submit"][value="Clear Sales History"]') ||
        document.querySelector('input[type="submit"][value="Process Shop History"]');

      if (processBtn) {
        const form = processBtn.closest('form');
        processBtn.value = 'Process Shop History';
        processBtn.style.cssText = `
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white; border: none; padding: 8px 18px; border-radius: 6px;
          font-weight: bold; font-size: 13px; cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        `;

        if (form && !form.dataset.darthyProcessBound) {
          form.dataset.darthyProcessBound = '1';
          form.addEventListener('submit', function (e) {
            const isClear = form.querySelector('input[name="clearhistory"][value="true"]');
            if (!isClear) return;
            e.preventDefault();
            e.stopPropagation();
            processHistory(table, form);
          }, true);
        }

        if (!processBtn.dataset.darthyClickBound) {
          processBtn.dataset.darthyClickBound = '1';
          processBtn.addEventListener('click', function (e) {
            if (!form) {
              e.preventDefault();
              processHistory(table, null);
            }
          });
        }
      }

      injectProfitDisplay(table);
    } else {
      injectProfitDisplay(notice || document.getElementById('darthy-sales-center'));
    }

    console.log('%c[DarthyPrime Shop] Panels on ' + (table ? 'sales table' : '1000 NP notice'), 'color:#fbbf24;font-weight:bold');
  }

  /** Fallback if the static notice isn't found */
  function injectStandaloneTrackLayout() {
    if (document.getElementById('darthy-sales-layout')) {
      renderTrackPanels();
      return;
    }

    const anchor =
      document.querySelector('.content') ||
      document.querySelector('#content') ||
      document.querySelector('td.content') ||
      document.body;

    const fake = document.createElement('div');
    fake.id = 'darthy-sales-empty';
    fake.style.cssText = 'min-width:280px;max-width:530px;padding:20px;text-align:center;color:#64748b;font-size:13px;';
    fake.innerHTML = '<div style="padding:24px;border:1px dashed #475569;border-radius:8px;background:#0f172a;color:#94a3b8;">Sales history is empty.<br>Track &amp; restock panels stay available.</div>';
    anchor.appendChild(fake);
    ensureSalesLayout(fake);
    injectProfitDisplay(fake);
  }

  // ---------- Spending: Usershop buy success ----------
  // Popup: "You bought X!" / "You spent 28,999 NP."
  // Multi-buy support: shops with quantity let you buy again without a full refresh.
  // The success popup is often REUSED with the same "You spent X NP" text, so we
  // key off each visible popup *showing* (open → count once → close → next open counts again).
  const processedSpendKeys = new Set();
  let currentUsershopPopupSig = null; // signature of the currently-open success popup we've counted
  let usershopSpendSeq = 0;

  function isSpendPopupVisible(el) {
    if (!el || !el.isConnected) return false;
    // Walk up looking for a hidden ancestor
    let node = el;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      node = node.parentElement;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || el.offsetHeight > 0;
  }

  function findUsershopSuccessParts() {
    const msg =
      document.getElementById('bsp-buy-success-msg') ||
      document.querySelector('.bsp-popup__copy') ||
      document.querySelector('.popup-body__2020 .bsp-popup__copy') ||
      document.querySelector('[id*="buy-success"]');

    const title =
      document.getElementById('bsp-buy-success-title') ||
      document.querySelector('.bsp-popup__title') ||
      document.querySelector('.popup-body__2020 .bsp-popup__title') ||
      document.querySelector('h4.bsp-popup__title');

    const img =
      document.getElementById('bsp-buy-success-img') ||
      document.querySelector('.bsp-popup__img');

    return { msg, title, img };
  }

  function tryParseUsershopSpend() {
    const { msg, title, img } = findUsershopSuccessParts();

    // Popup closed / gone → clear current signature so the next open can count
    if (!msg || !isSpendPopupVisible(msg)) {
      currentUsershopPopupSig = null;
      return;
    }

    const msgText = (msg.textContent || '').trim();
    // "It has been added to your inventory. You spent 28,999 NP."
    const m = msgText.match(/you\s+spent\s+([\d,]+)\s*NP/i);
    if (!m) return;

    const amount = parsePrice(m[1]);
    if (amount <= 0 || amount > 1000000) return; // usershop soft cap

    const titleText = title ? (title.textContent || '').trim() : '';
    const imgSrc = img ? (img.getAttribute('src') || '') : '';

    // Signature of THIS popup showing. Same item+price can be bought twice;
    // we only skip while this exact showing is still open (currentUsershopPopupSig).
    // When the popup is dismissed, currentUsershopPopupSig is cleared above.
    const signature = [titleText, amount, msgText, imgSrc].join('|');

    if (currentUsershopPopupSig === signature) return; // already counted this open

    // Also guard against rapid double-fires within the same open (observer + interval)
    const dedupeKey = 'us-open|' + signature + '|' + usershopSpendSeq;
    if (processedSpendKeys.has(dedupeKey) && currentUsershopPopupSig === signature) return;

    currentUsershopPopupSig = signature;
    usershopSpendSeq++;
    processedSpendKeys.add('us-open|' + signature + '|' + usershopSpendSeq);

    const newTotal = addSpend(amount);
    updateFinanceUI();
    flashSpendBanner(amount, newTotal, 'Usershop');
  }

  // ---------- Spending: Trading Post ----------
  // "You've successfully purchased lot 447788476 for 12 NP."
  // Supports multiple lot purchases visible / completed on the same page.
  function tryParseTradingPostSpend() {
    // Scan the whole page for unique "purchased lot N for X NP" messages.
    // Using body text + unique lot IDs avoids double-counting parent containers.
    const body = document.body ? (document.body.innerText || '') : '';
    const re = /successfully purchased lot\s+(\d+)\s+for\s+([\d,]+)\s*NP/gi;
    let match;
    while ((match = re.exec(body)) !== null) {
      const lotId = match[1];
      const amount = parsePrice(match[2]);
      if (amount <= 0 || amount > 20000000) continue;

      const key = 'tp|lot|' + lotId + '|' + amount;
      if (processedSpendKeys.has(key)) continue;
      processedSpendKeys.add(key);

      const newTotal = addSpend(amount);
      updateFinanceUI();
      flashSpendBanner(amount, newTotal, 'Trading Post');
    }
  }

  function flashSpendBanner(amount, newTotal, source) {
    const banner = document.createElement('div');
    banner.style.cssText = `
      position:fixed;top:16%;left:50%;transform:translateX(-50%);
      background:#b45309;color:white;padding:14px 26px;border-radius:10px;
      z-index:999999;font-size:14px;text-align:center;
      box-shadow:0 8px 24px rgba(0,0,0,0.35);font-family:Verdana,sans-serif;
      display:flex;align-items:center;gap:12px;
    `;

    // Trade purchases use the official accept icon + green border
    let iconHtml = '🛒';
    if (source === 'Trading Post') {
      iconHtml = `<img src="https://images.neopets.com/t/events/trade_accept.gif" width="40" height="40" alt="" style="width:40px;height:40px;border-radius:6px;border:2.5px solid #27ae60;background:#fff;object-fit:contain;box-sizing:border-box;">`;
    }

    banner.innerHTML = `
      ${iconHtml}
      <div style="text-align:left;">
        <b>${source} spend tracked</b><br>
        <span style="font-size:13px;">−${formatNP(amount)} · Spending total: ${formatNP(newTotal)}</span>
      </div>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 2800);
  }

  function startSpendWatchers() {
    // Initial pass
    tryParseUsershopSpend();
    tryParseTradingPostSpend();

    // Watch for popup injection (usershop) and TP success content
    const obs = new MutationObserver(() => {
      tryParseUsershopSpend();
      tryParseTradingPostSpend();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Poll a bit faster so successive same-shop buys are caught promptly
    setInterval(() => {
      tryParseUsershopSpend();
      tryParseTradingPostSpend();
    }, 600);
  }

  // ---------- Public init ----------
  window.DarthyPrimeShop = {
    init: function () {
      let tries = 0;
      const tryDropdown = () => {
        ensureFinanceInDropdown();
        updateDropdownFinance();
        if (!document.getElementById('shop-profit-row') && tries < 25) {
          tries++;
          setTimeout(tryDropdown, 400);
        }
      };
      tryDropdown();

      if (isSalesHistoryPage()) {
        setTimeout(enhanceSalesPage, 600);
        const obs = new MutationObserver(() => {
          if (!document.getElementById('darthy-sales-layout')) {
            enhanceSalesPage();
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 10000);
      }

      // Spending on usershops + trading post (and any page that shows those success messages)
      startSpendWatchers();
    },
    getTotal: getProfit,
    getProfit: getProfit,
    getSpend: getSpend,
    getShopName: getShopName,
    formatNP: formatNP,
    addProfit: addProfit,
    addSpend: addSpend,
    refreshUI: function () {
      updateFinanceUI();
      updateDropdownFinance();
    }
  };
})();
