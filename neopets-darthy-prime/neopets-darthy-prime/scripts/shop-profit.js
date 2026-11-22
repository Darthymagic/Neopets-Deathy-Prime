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
  const ITEM_SALES_KEY = 'darthy_item_sales'; // { "negg": { name: "Negg", qty: 4, np: 120000 } }
  const WEEK_KEY = 'darthy_weekly_profit';

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
    if (typeof GM_addValue === 'function') {
      GM_addValue(PROFIT_KEY, amount).then((t) => {
        try { chrome.runtime.sendMessage({ type: 'shop-profit-updated', total: t }).catch(() => {}); } catch (_) {}
        updateFinanceUI();
      }).catch(() => { try { updateFinanceUI(); } catch (_) {} });
      return getProfit() + amount;
    }
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
    if (amount > 20000000) return getSpend();
    if (typeof GM_addValue === 'function') {
      GM_addValue(SPEND_KEY, amount).then((t) => {
        try { chrome.runtime.sendMessage({ type: 'spending-updated', total: t }).catch(() => {}); } catch (_) {}
        updateFinanceUI();
      }).catch(() => {});
      return getSpend() + amount;
    }
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
      const old = prev[key];
      const oldTarget = old ? (old.target || 1) : 0;
      const prevSold = old ? (old.sold || 0) : 0;
      const soldOut = old && prevSold >= oldTarget;
      let pending = old ? (old.pendingRestock || 0) : 0;
      if (target > oldTarget) {
        // Already in the shop: previous target, or 1 for a new line with a qty.
        const stocked = soldOut ? 0 : (oldTarget > 0 ? oldTarget : 1);
        const missing = Math.max(0, target - stocked);
        pending = soldOut ? target : Math.max(pending, missing);
      }
      next[key] = {
        name: already ? already.name : parsed.name,
        target,
        sold: Math.min(prevSold, target),
        pendingRestock: pending
      };
    });
    setTrackText(rawText);
    setTrackCounts(next);
    return next;
  }


  function getItemSales() {
    return GM_getValue(ITEM_SALES_KEY, {}) || {};
  }
  function setItemSales(obj) {
    GM_setValue(ITEM_SALES_KEY, obj || {});
  }
  function recordItemSales(sales) {
    if (!sales || !sales.length) return;
    const book = getItemSales();
    const weeks = GM_getValue(WEEK_KEY, {}) || {};
    const days = getDaily();   // 1.8.44: per-day totals from each sale's date
    sales.forEach(sale => {
      const key = normalizeItemName(sale.item);
      if (!key) return;
      const entry = book[key] || { name: sale.item, qty: 0, np: 0 };
      entry.name = entry.name || sale.item;
      entry.qty = (parseInt(entry.qty, 10) || 0) + 1;
      entry.np = (parseInt(entry.np, 10) || 0) + (parseInt(sale.price, 10) || 0);
      book[key] = entry;
      const wk = weekKey(sale.date);
      const w = weeks[wk] || { np: 0, qty: 0 };
      w.np += parseInt(sale.price, 10) || 0;
      w.qty += 1;
      weeks[wk] = w;
      const dk = parseSaleDate(sale.date).toISOString().slice(0, 10);
      const dd = days[dk] || { np: 0, qty: 0 };
      dd.np += parseInt(sale.price, 10) || 0;
      dd.qty += 1;
      days[dk] = dd;
    });
    setItemSales(book);
    GM_setValue(WEEK_KEY, weeks);
    GM_setValue(DAY_KEY, days);
    renderTopSellers();
  }
  function brisbaneToday() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-');
    return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
  }
  function parseSaleDate(text) {
    const m = String(text || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return brisbaneToday();
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  }
  function mondayOf(date) {
    const d = new Date(date.getTime());
    const day = d.getUTCDay();
    const back = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - back);
    return d;
  }
  function weekKey(text) {
    const d = mondayOf(parseSaleDate(text));
    return d.toISOString().slice(0, 10);
  }
  function weekLabel(key) {
    const d = new Date(key + 'T00:00:00Z');
    return d.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  }
  function weekSeries() {
    const stored = GM_getValue(WEEK_KEY, {}) || {};
    const keys = Object.keys(stored).sort();
    const start = mondayOf(keys.length ? new Date(keys[0] + 'T00:00:00Z') : brisbaneToday());
    const end = mondayOf(brisbaneToday());
    const out = [];
    for (let d = new Date(start.getTime()); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
      const key = d.toISOString().slice(0, 10);
      out.push({ key: key, label: weekLabel(key), np: (stored[key] && stored[key].np) || 0, qty: (stored[key] && stored[key].qty) || 0 });
    }
    return out;
  }
  function formatCompact(n) {
    n = Number(n) || 0;
    const abs = Math.abs(n);
    const cut = (v, d) => {
      const s = v.toFixed(d).replace(/\.0$/, '');
      return (n < 0 ? '-' : '') + s;
    };
    if (abs >= 1e12) return cut(abs / 1e12, abs >= 1e13 ? 0 : 1) + 'T';
    if (abs >= 1e9) return cut(abs / 1e9, abs >= 1e10 ? 0 : 1) + 'B';
    if (abs >= 1e6) return cut(abs / 1e6, abs >= 1e7 ? 0 : 1) + 'M';
    if (abs >= 1e3) return cut(abs / 1e3, abs >= 1e4 ? 0 : 1) + 'K';
    return String(Math.round(n));
  }
  function renderWeekChart() {
    const weeks = weekSeries();
    if (!weeks.length) return '<div style="color:#64748b;font-size:11px;padding:8px;">No weeks yet.</div>';
    const max = Math.max(1, ...weeks.map(w => w.np));
    const cols = weeks.map(w => {
      const up = w.np > 0;
      const h = up ? Math.max(18, Math.round((w.np / max) * 92)) : 14;
      const color = up ? '#16a34a' : '#dc2626';
      const tip = up ? (formatCompact(w.np) + ' NP · ' + w.qty + ' sold') : 'No sales';
      return '<div title="' + tip + '" style="flex:0 0 42px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:128px;">' +
        '<div style="font-size:8px;color:#94a3b8;margin-bottom:3px;white-space:nowrap;">' + (up ? formatCompact(w.np) : '0') + '</div>' +
        '<div style="width:16px;height:' + h + 'px;background:' + color + ';border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.35);"></div>' +
        '<div style="width:1px;height:8px;background:' + color + ';"></div>' +
        '<div style="font-size:8px;color:#cbd5e1;margin-top:4px;white-space:nowrap;">' + w.label + '</div></div>';
    }).join('');
    return '<div style="font-size:10px;color:#94a3b8;margin:2px 0 6px;">Weekly profit · new candle each Monday · green = sales · red = none</div>' +
      '<div style="overflow-x:auto;overflow-y:hidden;border:1px solid #1e293b;border-radius:8px;background:#020617;padding:8px 6px 4px;">' +
      '<div style="display:flex;align-items:flex-end;gap:6px;min-width:max-content;">' + cols + '</div></div>';
  }
  // ---- 1.8.44: day-to-day breakdown + Month Deep Dive ----
  // Each processed sale is also added to its own day (the sale's date from the Shop History table, the same
  // date the weekly candles use) in darthy_daily_profit { 'YYYY-MM-DD': { np, qty } }, kept forever.
  // Weeks are Monday–Sunday, exactly like the week-to-week chart. Sales recorded before 1.8.44 only exist
  // as weekly totals, so those weeks show the week total with a note instead of day bars.
  const DAY_KEY = 'darthy_daily_profit';
  const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function getDaily() { const v = GM_getValue(DAY_KEY, {}); return (v && typeof v === 'object') ? v : {}; }
  function addDays(key, n) { const d = new Date(key + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function todayKey() { return brisbaneToday().toISOString().slice(0, 10); }
  function weekDays(wk) {
    const daily = getDaily(), today = todayKey();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const key = addDays(wk, i);
      const v = daily[key] || null;
      days.push({ key, label: DOW_LABELS[i], date: +key.slice(8, 10), np: (v && v.np) || 0, qty: (v && v.qty) || 0, future: key > today });
    }
    return days;
  }
  // week total vs what the daily records cover (the gap = sales from before daily tracking)
  function weekInfo(wk) {
    const stored = GM_getValue(WEEK_KEY, {}) || {};
    const w = stored[wk] || { np: 0, qty: 0 };
    const days = weekDays(wk);
    const dNp = days.reduce((s, d) => s + d.np, 0), dQty = days.reduce((s, d) => s + d.qty, 0);
    return { key: wk, np: w.np || 0, qty: w.qty || 0, days, gapNp: Math.max(0, (w.np || 0) - dNp), gapQty: Math.max(0, (w.qty || 0) - dQty) };
  }
  function weekRangeLabel(wk) {
    const e = addDays(wk, 6);
    return (+wk.slice(8, 10)) + ' ' + MONTHS[+wk.slice(5, 7) - 1] + ' – ' + (+e.slice(8, 10)) + ' ' + MONTHS[+e.slice(5, 7) - 1];
  }
  // the same stock-like candles as the week-to-week chart, one per day
  function renderDayBars(info) {
    const max = Math.max(1, ...info.days.map(d => d.np));
    const noDetail = info.gapNp > 0 && info.gapNp === info.np;   // only a weekly total exists for this week
    const cols = info.days.map(d => {
      const up = d.np > 0;
      const blank = d.future || noDetail;
      const color = blank ? '#334155' : (up ? '#16a34a' : '#dc2626');
      const h = up ? Math.max(18, Math.round((d.np / max) * 92)) : (blank ? 6 : 14);
      const tip = d.key + ' · ' + (d.future ? 'still to come' : noDetail ? 'no day detail' : (up ? formatCompact(d.np) + ' NP · ' + d.qty + ' sold' : 'No sales'));
      return '<div title="' + tip + '" style="flex:1 0 42px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:128px;">' +
        '<div style="font-size:8px;color:#94a3b8;margin-bottom:3px;white-space:nowrap;">' + (blank ? '' : (up ? formatCompact(d.np) : '0')) + '</div>' +
        '<div style="width:16px;height:' + h + 'px;background:' + color + ';border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.35);"></div>' +
        '<div style="width:1px;height:8px;background:' + color + ';"></div>' +
        '<div style="font-size:9px;color:#e2e8f0;margin-top:4px;font-weight:bold;">' + d.label + '</div>' +
        '<div style="font-size:8px;color:#64748b;white-space:nowrap;">' + d.date + '</div>' +
        '<div style="font-size:8px;color:#7dd3fc;white-space:nowrap;">' + (d.future || !d.qty ? '' : d.qty + ' sold') + '</div></div>';
    }).join('');
    const gap = info.gapNp > 0
      ? '<div style="font-size:9px;color:#64748b;margin-top:4px;">' + (info.gapNp === info.np ? 'No day detail for this week (sales recorded before daily tracking started in 1.8.44) — week total ' : 'Plus ') +
        formatCompact(info.gapNp) + ' NP · ' + info.gapQty + ' sold' + (info.gapNp === info.np ? '.' : ' from before daily tracking (1.8.44), not split by day.') + '</div>'
      : '';
    return '<div style="overflow-x:auto;overflow-y:hidden;border:1px solid #1e293b;border-radius:8px;background:#020617;padding:8px 6px 4px;">' +
      '<div style="display:flex;align-items:flex-end;gap:6px;min-width:max-content;">' + cols + '</div></div>' + gap;
  }
  function renderThisWeek() {
    const info = weekInfo(mondayOf(brisbaneToday()).toISOString().slice(0, 10));
    return '<div style="font-size:10px;color:#94a3b8;margin:2px 0 6px;">This week day by day · ' + weekRangeLabel(info.key) + ' · ' +
      formatCompact(info.np) + ' NP · ' + info.qty + ' sold · green = sales · red = none</div>' + renderDayBars(info) +
      '<div style="height:10px;"></div>';
  }
  // months with any sales (daily records, or weekly totals for older weeks), newest first; the current month always
  function deepDiveMonths() {
    const set = new Set([todayKey().slice(0, 7)]);
    Object.keys(getDaily()).forEach(k => { const v = getDaily()[k]; if (v && (v.np || v.qty)) set.add(k.slice(0, 7)); });
    const stored = GM_getValue(WEEK_KEY, {}) || {};
    Object.keys(stored).forEach(k => { if (stored[k] && (stored[k].np || stored[k].qty)) { set.add(k.slice(0, 7)); set.add(addDays(k, 6).slice(0, 7)); } });
    return [...set].sort().reverse();
  }
  // Monday–Sunday weeks that overlap the month
  function monthWeeks(month) {
    const first = month + '-01';
    const out = [];
    let wk = mondayOf(new Date(first + 'T00:00:00Z')).toISOString().slice(0, 10);
    while (wk.slice(0, 7) <= month && wk <= todayKey()) {
      if (addDays(wk, 6) >= first) out.push(wk);
      wk = addDays(wk, 7);
    }
    return out;
  }
  let ddMonth = '';
  const ddOpenWeeks = new Set();
  let ddOpen = false;
  function renderDeepDive() {
    const months = deepDiveMonths();
    if (!ddMonth || !months.includes(ddMonth)) ddMonth = months[0];
    const weeks = monthWeeks(ddMonth).map(weekInfo);
    const daily = getDaily();
    let mNp = 0, mQty = 0;
    Object.keys(daily).forEach(k => { if (k.slice(0, 7) === ddMonth) { mNp += daily[k].np || 0; mQty += daily[k].qty || 0; } });
    let approx = false;
    weeks.forEach(w => { if (w.gapNp > 0 && w.key.slice(0, 7) === ddMonth) { mNp += w.gapNp; mQty += w.gapQty; approx = true; } });
    const opts = months.map(m => '<option value="' + m + '"' + (m === ddMonth ? ' selected' : '') + '>' + MONTHS_LONG[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) + '</option>').join('');
    const max = Math.max(1, ...weeks.map(w => w.np));
    const cols = weeks.map(w => {
      const up = w.np > 0;
      const h = up ? Math.max(18, Math.round((w.np / max) * 92)) : 14;
      const color = up ? '#16a34a' : '#dc2626';
      return '<div title="' + (up ? formatCompact(w.np) + ' NP · ' + w.qty + ' sold' : 'No sales') + '" style="flex:1 0 56px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:128px;">' +
        '<div style="font-size:8px;color:#94a3b8;margin-bottom:3px;white-space:nowrap;">' + (up ? formatCompact(w.np) : '0') + '</div>' +
        '<div style="width:16px;height:' + h + 'px;background:' + color + ';border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.35);"></div>' +
        '<div style="width:1px;height:8px;background:' + color + ';"></div>' +
        '<div style="font-size:8px;color:#cbd5e1;margin-top:4px;white-space:nowrap;">' + weekLabel(w.key) + '</div></div>';
    }).join('');
    const weekRows = weeks.slice().reverse().map(w =>
      '<details class="darthy-ts-week" data-week="' + w.key + '"' + (ddOpenWeeks.has(w.key) ? ' open' : '') + ' style="margin:6px 0;border:1px solid #1e293b;border-radius:8px;background:#0b1220;">' +
      '<summary style="padding:6px 8px;cursor:pointer;font-size:11px;color:#e2e8f0;">' +
      '<b>' + weekRangeLabel(w.key) + '</b> <span style="color:#4ade80;">' + formatCompact(w.np) + ' NP</span> <span style="color:#7dd3fc;">· ' + w.qty + ' sold</span>' +
      (w.gapNp > 0 && w.gapNp === w.np ? ' <span style="color:#64748b;font-size:9px;">· weekly total only</span>' : '') + '</summary>' +
      '<div style="padding:0 8px 8px;">' + renderDayBars(w) + '</div></details>'
    ).join('');
    return '<details id="darthy-ts-deepdive"' + (ddOpen ? ' open' : '') + ' style="margin:10px 0 4px;border:1px solid #334155;border-radius:8px;background:#020617;">' +
      '<summary style="padding:7px 10px;cursor:pointer;font-weight:bold;color:#fbbf24;font-size:12px;">Month Deep Dive</summary>' +
      '<div style="padding:4px 10px 10px;">' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">' +
      '<select id="darthy-ts-month" style="font:11px Verdana;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 4px;">' + opts + '</select>' +
      '<span style="font-size:11px;color:#94a3b8;">' + (approx ? '≈ ' : '') + '<span style="color:#4ade80;">' + formatCompact(mNp) + ' NP</span> · ' + mQty + ' sold this month</span></div>' +
      '<div style="font-size:10px;color:#94a3b8;margin:2px 0 6px;">Weeks in ' + MONTHS_LONG[+ddMonth.slice(5, 7) - 1] + ' (Mon–Sun, full-week totals) · open a week for its day-by-day bars</div>' +
      (weeks.length ? '<div style="overflow-x:auto;overflow-y:hidden;border:1px solid #1e293b;border-radius:8px;background:#020617;padding:8px 6px 4px;">' +
        '<div style="display:flex;align-items:flex-end;gap:6px;min-width:max-content;">' + cols + '</div></div>' + weekRows
        : '<div style="color:#64748b;font-size:11px;padding:8px;">No weeks yet.</div>') +
      (approx ? '<div style="font-size:9px;color:#64748b;margin-top:4px;">≈ includes weekly totals from before daily tracking (1.8.44) for weeks starting this month.</div>' : '') +
      '</div></details>';
  }
  function bindDeepDive(body) {
    if (!body || body.dataset.darthyDeepDive) return;
    body.dataset.darthyDeepDive = '1';
    body.addEventListener('change', e => {
      if (e.target && e.target.id === 'darthy-ts-month') { ddMonth = e.target.value; ddOpenWeeks.clear(); renderTopSellers(); }
    });
    body.addEventListener('toggle', e => {
      const t = e.target;
      if (!t || !t.tagName || t.tagName.toLowerCase() !== 'details') return;
      if (t.id === 'darthy-ts-deepdive') ddOpen = t.open;
      else if (t.dataset && t.dataset.week) { if (t.open) ddOpenWeeks.add(t.dataset.week); else ddOpenWeeks.delete(t.dataset.week); }
    }, true);
  }
  function topSellers(limit) {
    return Object.values(getItemSales())
      .filter(e => e && e.name)
      .sort((a, b) => (b.np || 0) - (a.np || 0) || (b.qty || 0) - (a.qty || 0))
      .slice(0, limit || 25);
  }
  function renderTopSellers() {
    const body = document.getElementById('darthy-top-sellers-body');
    if (!body) return;
    const rows = topSellers(25);
    const all = Object.keys(getItemSales()).length;
    // 1.8.44: this week's day-to-day candles on top, the week-to-week chart under it, then the Month Deep Dive
    const chart = renderThisWeek() + renderWeekChart() + renderDeepDive();
    bindDeepDive(body);
    if (!rows.length) {
      body.innerHTML = chart + '<div style="color:#64748b;font-size:11px;padding:8px;">No sales recorded yet. Process Shop History to add them.</div>';
      return;
    }
    const head = '<div style="display:grid;grid-template-columns:28px 1fr 70px 110px;gap:6px;font-size:10px;color:#94a3b8;padding:4px 2px;border-bottom:1px solid #334155;"><span>#</span><span>Item</span><span style="text-align:right;">Qty</span><span style="text-align:right;">Total NP</span></div>';
    const lines = rows.map((e, i) =>
      '<div style="display:grid;grid-template-columns:28px 1fr 70px 110px;gap:6px;font-size:11px;padding:5px 2px;border-bottom:1px solid #1e293b;">' +
      '<span style="color:#64748b;">' + (i + 1) + '</span>' +
      '<span style="word-break:break-word;">' + escapeHtml(e.name) + '</span>' +
      '<span style="text-align:right;color:#7dd3fc;">' + (e.qty || 0).toLocaleString() + '</span>' +
      '<span style="text-align:right;color:#4ade80;">' + (e.np || 0).toLocaleString() + '</span></div>'
    ).join('');
    body.innerHTML = chart + '<div style="font-size:10px;color:#94a3b8;margin:8px 0 6px;">Top 25 by NP made. Tracking ' + all + ' item' + (all === 1 ? '' : 's') + '.</div>' + head + lines;
  }
  function mountTopSellers() {
    if (document.getElementById('darthy-top-sellers')) {
      renderTopSellers();
      return;
    }
    const nav = document.querySelector('nav.mkt-subnav');
    if (!nav || !nav.parentNode) return;
    const box = document.createElement('div');
    box.id = 'darthy-top-sellers';
    box.style.cssText = 'margin:10px auto 6px;max-width:720px;background:#0f172a;color:#e2e8f0;border:2px solid #fbbf24;border-radius:10px;font-family:Verdana,Arial,sans-serif;box-sizing:border-box;';
    box.innerHTML = '<button type="button" id="darthy-top-sellers-toggle" style="width:100%;text-align:left;background:transparent;color:#fbbf24;border:none;padding:10px 12px;font-weight:bold;cursor:pointer;font-size:13px;">Top sellers ▸</button><div id="darthy-top-sellers-body" style="display:none;max-height:520px;overflow:auto;padding:0 12px 10px;"></div>';
    nav.parentNode.insertBefore(box, nav.nextSibling);
    const toggle = box.querySelector('#darthy-top-sellers-toggle');
    const body = box.querySelector('#darthy-top-sellers-body');
    toggle.onclick = () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      toggle.textContent = open ? 'Top sellers ▸' : 'Top sellers ▾';
    };
    renderTopSellers();
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
    return Object.values(counts).filter(e => (e.sold || 0) >= (e.target || 1) || (e.pendingRestock || 0) > 0);
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
      const soldOut = (e.sold || 0) >= (e.target || 1);
      const extra = (e.pendingRestock || 0) > 0;
      if (soldOut || extra) {
        if (soldOut) e.sold = 0;
        e.pendingRestock = 0;
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

    const anchor = document.getElementById('shop-profit-anchor') || document.getElementById('stat-days');
    if (!anchor) return;

    let row = document.getElementById('shop-profit-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'shop-profit-row';
      row.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid #4a4a6a;';
      if (anchor.id === 'shop-profit-anchor') anchor.appendChild(row);
      else anchor.parentNode.insertBefore(row, anchor.nextSibling);
    }

    const shopName = getShopName();
    const title = shopName || 'Shop Profit';
    row.innerHTML = `
      <div id="darthy-drop-fin-h" style="font-weight:bold;color:#fbbf24;margin-bottom:4px;font-size:12px;cursor:pointer;user-select:none;">${escapeHtml(title)} <span class="darthy-caret">▾</span></div>
      <div id="darthy-drop-fin-b">
        <div style="font-size:12px;">Profit: <span id="shop-profit-value" style="color:#4ade80;font-weight:bold;">${formatNP(getProfit())}</span></div>
        <div style="font-size:12px;margin-top:3px;">Spending: <span id="shop-spend-value" style="color:#f87171;font-weight:bold;">${formatNP(getSpend())}</span></div>
      </div>
    `;
    const h = row.querySelector('#darthy-drop-fin-h');
    const b = row.querySelector('#darthy-drop-fin-b');
    const apply = (open) => {
      if (b) b.style.display = open ? 'block' : 'none';
      const c = h && h.querySelector('.darthy-caret');
      if (c) c.textContent = open ? '▾' : '▸';
    };
    let open = true;
    try { if (localStorage.getItem('dp_drop_fin') === '0') open = false; } catch (_) {}
    apply(open);
    if (h && !h.dataset.bound) {
      h.dataset.bound = '1';
      h.addEventListener('click', e => {
        e.preventDefault();
        const next = b.style.display === 'none';
        apply(next);
        try { localStorage.setItem('dp_drop_fin', next ? '1' : '0'); } catch (_) {}
      });
    }
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
        soldOutEl.innerHTML = soldOut.map(e => {
          const qty = e.pendingRestock || e.target || 1;
          return `<div style="padding:4px 0;border-bottom:1px solid #7f1d1d;font-size:11px;color:#fca5a5;">
            ${escapeHtml(e.name)} <span style="color:#f87171;">×${qty}</span>
          </div>`;
        }).join('');
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
      <div style="font-size:12px;color:#38bdf8;font-weight:bold;margin-bottom:6px;">📦 Shop Stock</div>
      <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;line-height:1.35;">
        One per line. <b>Negg x 4</b> = keep 4. Raising a qty adds the extra to Needs Restock.
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
      <div id="darthy-track-soldout" style="background:#1c0a0a;border:1px solid #7f1d1d;border-radius:6px;padding:6px 8px;max-height:220px;overflow-y:auto;min-height:80px;"></div>
      <button id="darthy-track-stocked" style="margin-top:10px;width:100%;background:#16a34a;color:white;border:none;padding:8px;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;">Stocked</button>
      <div style="font-size:10px;color:#64748b;margin-top:6px;text-align:center;">Resets sold counters, then pulls those items from SDB into your shop.</div>
      <button id="darthy-nostock-toggle" style="margin-top:10px;width:100%;background:#334155;color:#e2e8f0;border:none;padding:6px;border-radius:6px;font-size:11px;cursor:pointer;">No Stock in SDB ▸</button>
      <div id="darthy-nostock-wrap" style="display:none;margin-top:6px;">
        <div style="font-size:10px;color:#94a3b8;margin-bottom:4px;line-height:1.35;">Items not found in SDB (with qty). Backspace a line and Save to remove. Retry pulls this list from SDB again.</div>
        <textarea id="darthy-nostock-textarea" spellcheck="false"
          style="width:100%;height:90px;resize:vertical;overflow:auto;box-sizing:border-box;background:#0f172a;color:#fca5a5;border:1px solid #7f1d1d;border-radius:6px;padding:6px;font-size:11px;font-family:Verdana,monospace;line-height:1.35;"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button id="darthy-nostock-save" style="flex:1;background:#b45309;color:white;border:none;padding:6px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">Save No Stock list</button>
          <button id="darthy-nostock-retry" style="flex:1;background:#2563eb;color:white;border:none;padding:6px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">Retry</button>
        </div>
        <div id="darthy-nostock-status" style="font-size:10px;color:#4ade80;min-height:14px;margin-top:3px;text-align:center;"></div>
      </div>
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
      if (!confirm(`Mark ${soldOut.length} sold-out item(s) as restocked, then pull them from SDB into your shop?`)) return;
      const textQty = {};
      String(getTrackText() || '').split(/\r?\n/).forEach(line => {
        const p = parseTrackLine(line);
        if (!p) return;
        textQty[normalizeItemName(p.name)] = p.target;
      });
      const snapshot = soldOut.map(e => {
        const key = normalizeItemName(e.name);
        const qty = e.pendingRestock || (textQty[key] != null ? textQty[key] : 1);
        return { name: e.name, target: qty, qty: qty };
      });
      const n = restockSoldOut();
      renderTrackPanels();
      const st = document.getElementById('darthy-track-save-status');
      if (st) {
        st.textContent = `Restocked ${n} item(s) ✓ — opening SDB…`;
        setTimeout(() => { st.textContent = ''; }, 2500);
      }
      if (window.DarthyPrimeRestock && typeof window.DarthyPrimeRestock.start === 'function') {
        window.DarthyPrimeRestock.start(snapshot);
      } else {
        alert('Restock helper not loaded. Reloaded the extension and try again.');
      }
    };

    const nsToggle = right.querySelector('#darthy-nostock-toggle');
    const nsWrap = right.querySelector('#darthy-nostock-wrap');
    const nsTa = right.querySelector('#darthy-nostock-textarea');
    if (nsTa && window.DarthyPrimeRestock) {
      nsTa.value = (window.DarthyPrimeRestock.getNoStock() || []).join('\n');
    }
    if (nsToggle && nsWrap) {
      nsToggle.onclick = () => {
        const open = nsWrap.style.display !== 'none';
        nsWrap.style.display = open ? 'none' : 'block';
        nsToggle.textContent = open ? 'No Stock in SDB ▸' : 'No Stock in SDB ▾';
      };
    }
    const nsSave = right.querySelector('#darthy-nostock-save');
    if (nsSave) {
      nsSave.onclick = () => {
        const raw = (document.getElementById('darthy-nostock-textarea') || {}).value || '';
        const names = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (window.DarthyPrimeRestock) window.DarthyPrimeRestock.setNoStock(names);
        const st = document.getElementById('darthy-nostock-status');
        if (st) {
          st.textContent = 'Saved ✓';
          setTimeout(() => { st.textContent = ''; }, 1600);
        }
      };
    }
    const nsRetry = right.querySelector('#darthy-nostock-retry');
    if (nsRetry) {
      nsRetry.onclick = () => {
        const ta = document.getElementById('darthy-nostock-textarea');
        if (ta && window.DarthyPrimeRestock) {
          const names = String(ta.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          window.DarthyPrimeRestock.setNoStock(names);
        }
        const list = window.DarthyPrimeRestock ? window.DarthyPrimeRestock.getNoStock() : [];
        if (!list || !list.length) {
          alert('No Stock list is empty.');
          return;
        }
        if (!confirm('Retry SDB restock for ' + list.length + ' item(s) on the No Stock list?')) return;
        if (window.DarthyPrimeRestock && typeof window.DarthyPrimeRestock.startFromNoStock === 'function') {
          window.DarthyPrimeRestock.startFromNoStock();
        }
      };
    }

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
    recordItemSales(sales);
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

    mountTopSellers();
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


  const BANK_KEY = 'darthy_bank_interest_day';
  function nstDate() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (_) { return new Date().toISOString().slice(0, 10); }
  }
  function bankInterestAmount() {
    const btn = document.querySelector('#frmCollectInterest input[type="submit"], input.bank-interest-btn, input[value*="Collect Interest"]');
    const chunks = [];
    if (btn) {
      chunks.push(btn.value || '');
      const form = btn.closest('form') || btn.parentElement;
      if (form) chunks.push(form.innerText || form.textContent || '');
    }
    chunks.push(document.body.innerText || '');
    const blob = chunks.join('\n');
    const patterns = [
      /collect(?:ed)?\s+interest[^\d]{0,40}([\d,]+)\s*NP/i,
      /interest[^\d]{0,40}([\d,]+)\s*NP/i,
      /collected\s+([\d,]+)\s*NP\s+in\s+interest/i,
      /([\d,]+)\s*NP\s+in\s+interest/i,
      /Collect Interest\s*\(?\s*([\d,]+)\s*NP/i
    ];
    for (const re of patterns) {
      const m = blob.match(re);
      if (m) {
        const n = parseInt(String(m[1]).replace(/,/g, ''), 10);
        if (n > 0 && n < 50000000) return n;
      }
    }
    return 0;
  }
  function addBankInterest(amount, why) {
    if (!amount || amount <= 0) return false;
    const day = nstDate();
    const done = GM_getValue(BANK_KEY, '');
    if (done === day) return false;
    GM_setValue(BANK_KEY, day);
    addProfit(amount);
    console.log('%c[DarthyPrime] Bank interest +' + amount.toLocaleString() + ' NP', 'color:#4ade80;font-weight:bold');
    return true;
  }
  function startBankInterestWatcher() {
    if (!/bank\.phtml/i.test(location.href)) return;
    const btn = document.querySelector('#frmCollectInterest input[type="submit"], input.bank-interest-btn');
    if (btn && !btn.getAttribute('data-darthy-bank')) {
      btn.setAttribute('data-darthy-bank', '1');
      btn.addEventListener('click', () => {
        const amount = bankInterestAmount();
        setTimeout(() => addBankInterest(amount || bankInterestAmount(), 'click'), 1800);
      }, true);
    }
    const obs = new MutationObserver(() => {
      const t = document.body.innerText || '';
      if (/collected[^\n]{0,40}[\d,]+\s*NP[^\n]{0,40}interest|interest[^\n]{0,40}collected/i.test(t)) {
        addBankInterest(bankInterestAmount(), 'result');
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
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
      window.addEventListener('darthy-storage-changed', (ev) => {
        const ch = ev && ev.detail;
        if (!ch) return;
        if (ch[PROFIT_KEY] || ch[SPEND_KEY] || ch[SHOP_NAME_KEY]) updateFinanceUI();
      });
      setInterval(() => {
        if (typeof DarthyPrimeStorage === 'undefined' || !DarthyPrimeStorage.reload) return;
        DarthyPrimeStorage.reload().then(updateFinanceUI).catch(() => {});
      }, 4000);

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
      startBankInterestWatcher();
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
