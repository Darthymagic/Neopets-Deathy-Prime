/**
 * Account Completion
 * Books, Gourmet Club, secret avatars, and stamp album progress.
 * Caps come from Jellyneo. Pet totals come from Neopets.
 * Avatars are counted, but not included in the account percent.
 */
(function () {
  'use strict';

  const DATA_KEY = 'darthy_account_completion';
  const READ_KEY = 'darthy_read_pet';
  const FOOD_KEY = 'darthy_gourmet_pet';
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  function gmGet(key, fb) {
    try { if (typeof GM_getValue === 'function') return GM_getValue(key, fb); } catch (_) {}
    return fb;
  }
  function gmSet(key, val) {
    try { if (typeof GM_setValue === 'function') GM_setValue(key, val); } catch (_) {}
  }
  function load() {
    return Object.assign({
      books: 0, booksCap: 0,
      gourmet: 0, gourmetCap: 0,
      avatars: 0, avatarNames: [],
      stamps: 0, stampsCap: 0,
      checked: 0
    }, gmGet(DATA_KEY, {}) || {});
  }
  function save(data) { gmSet(DATA_KEY, data); }
  function num(text) { return parseInt(String(text || '').replace(/[^\d]/g, ''), 10) || 0; }
  function pet(key) { return String(gmGet(key, '') || '').trim(); }
  function decode(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  function fetchText(url) {
    return new Promise((resolve, reject) => {
      if (/jellyneo\.net/i.test(url) && typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          onload: (r) => resolve(r.responseText || ''),
          onerror: reject
        });
        return;
      }
      fetch(url, { credentials: 'include' })
        .then((r) => r.text())
        .then(resolve)
        .catch(reject);
    });
  }
  function resultsCount(html) {
    const m = String(html || '').match(/There are\s*<b>\s*([\d,]+)\s*<\/b>\s*results/i);
    return m ? num(m[1]) : 0;
  }
  function boldAfter(html, pattern) {
    const m = String(html || '').match(pattern);
    return m ? num(m[1]) : 0;
  }
  function secretAvatars(html) {
    const text = String(html || '');
    const start = text.search(/<b>\s*Secret Avatars:\s*<\/b>/i);
    if (start < 0) return [];
    const rest = text.slice(start);
    const end = rest.search(/popup-footer__2020|<\/div>\s*<\/div>\s*<div class="popup-footer/i);
    const chunk = end > 0 ? rest.slice(0, end) : rest.slice(0, 300000);
    const names = [];
    const re = /<div[^>]*class="settings-av"[^>]*>[\s\S]*?<img[^>]*alt="([^"]*)"/gi;
    let m;
    while ((m = re.exec(chunk))) {
      const name = decode(m[1]);
      if (name && name.toLowerCase() !== 'default') names.push(name);
    }
    return names;
  }
  function pct(have, cap) {
    if (!cap) return null;
    return Math.max(0, Math.min(100, Math.round((have / cap) * 100)));
  }
  function overall(data) {
    const bits = [
      pct(data.books, data.booksCap),
      pct(data.gourmet, data.gourmetCap),
      pct(data.stamps, data.stampsCap)
    ].filter(v => v !== null);
    if (!bits.length) return 0;
    return Math.round(bits.reduce((a, b) => a + b, 0) / bits.length);
  }
  function row(label, have, cap) {
    const value = cap ? have.toLocaleString() + '/' + cap.toLocaleString() : have.toLocaleString();
    const p = pct(have, cap);
    return '<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid #1e293b;font-size:11px;">' +
      '<span>' + label + '</span><span style="color:#7dd3fc;font-weight:bold;">' + value + (p === null ? '' : ' · ' + p + '%') + '</span></div>';
  }
  function render() {
    const box = document.getElementById('darthy-account-body');
    const title = document.getElementById('darthy-account-title');
    if (!box) return;
    const data = load();
    if (title) title.textContent = 'Account Completion ' + overall(data) + '%';
    const reader = pet(READ_KEY);
    const eater = pet(FOOD_KEY);
    const note = (!reader || !eater)
      ? '<div style="font-size:10px;color:#fbbf24;margin-top:6px;">Set the reading pet and Gourmet Club pet in Settings.</div>'
      : '';
    box.innerHTML =
      row('Books', data.books || 0, data.booksCap || 0) +
      row('Gourmet', data.gourmet || 0, data.gourmetCap || 0) +
      row('Stamps', data.stamps || 0, data.stampsCap || 0) +
      row('Avatars', data.avatars || 0, 0) +
      '<div style="font-size:10px;color:#64748b;margin-top:6px;">Checked ' + (data.checked ? new Date(data.checked).toLocaleDateString() : 'never') + '. Caps refresh weekly. Avatars are not in the %.</div>' +
      note;
  }
  function setBtn(text) {
    const btn = document.getElementById('darthy-account-update');
    if (btn) btn.textContent = text;
  }
  async function updateNow() {
    if (window.__darthyAccountBusy) return;
    window.__darthyAccountBusy = true;
    setBtn('Updating');
    const data = load();
    const reader = pet(READ_KEY);
    const eater = pet(FOOD_KEY);
    try {
      const booksCapHtml = await fetchText('https://items.jellyneo.net/search/?scat[]=254&limit=75').catch(() => '');
      const booksCap = resultsCount(booksCapHtml);
      if (booksCap) data.booksCap = booksCap;
      if (reader) {
        const a = await fetchText('https://www.neopets.com/books_read.phtml?pet_name=' + encodeURIComponent(reader)).catch(() => '');
        const b = await fetchText('https://www.neopets.com/moon/books_read.phtml?pet_name=' + encodeURIComponent(reader)).catch(() => '');
        data.books = boldAfter(a, /has read\s*<b>\s*([\d,]+)\s*<\/b>\s*book/i) +
          boldAfter(b, /has read\s*<b>\s*([\d,]+)\s*<\/b>\s*book/i);
      }

      const foodCapHtml = await fetchText('https://items.jellyneo.net/search/?scat[]=175&limit=75').catch(() => '');
      const foodCap = resultsCount(foodCapHtml);
      if (foodCap) data.gourmetCap = foodCap;
      if (eater) {
        const food = await fetchText('https://www.neopets.com/gourmet_club.phtml?pet_name=' + encodeURIComponent(eater)).catch(() => '');
        const scored = boldAfter(food, /has scored\s*<b>\s*([\d,]+)\s*<\/b>\s*Gourmet Club points/i);
        if (scored || /Gourmet Club points/i.test(food)) data.gourmet = scored;
      }

      const stampCapHtml = await fetchText('https://items.jellyneo.net/search/?scat[]=304').catch(() => '');
      const stampCap = resultsCount(stampCapHtml);
      if (stampCap) data.stampsCap = stampCap;
      const stamps = await fetchText('https://www.neopets.com/stamps.phtml?type=progress').catch(() => '');
      const stampCount = boldAfter(stamps, /total of\s*<b>\s*([\d,]+)\s*<\/b>\s*stamps/i);
      if (stampCount) data.stamps = stampCount;

      const avatars = await fetchText('https://www.neopets.com/settings/neoboards/').catch(() => '');
      const found = secretAvatars(avatars);
      if (found.length) {
        const known = new Set(data.avatarNames || []);
        found.forEach(name => known.add(name));
        data.avatarNames = Array.from(known);
        data.avatars = data.avatarNames.length;
      }

      data.checked = Date.now();
      save(data);
      render();
      setBtn('Updated');
      setTimeout(() => setBtn('Update'), 2500);
    } catch (err) {
      console.warn('[Account] update failed', err);
      setBtn('Update');
    } finally {
      window.__darthyAccountBusy = false;
    }
  }
  function mount() {
    if (document.getElementById('darthy-account')) return true;
    const anchor = document.getElementById('darthy-drop-src-b');
    if (!anchor || !anchor.parentNode) return false;
    const wrap = document.createElement('div');
    wrap.id = 'darthy-account';
    wrap.style.cssText = 'margin:10px 0 4px;';
    wrap.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
      '<div id="darthy-account-h" style="font-weight:bold;color:#7dd3fc;cursor:pointer;user-select:none;"><span id="darthy-account-title">Account Completion 0%</span> <span class="darthy-caret">▸</span></div>' +
      '<a href="javascript:void(0)" id="darthy-account-update" style="color:#7dd3fc;font-size:11px;">Update</a></div>' +
      '<div id="darthy-account-body" style="display:none;margin-top:4px;"></div>';
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    const body = wrap.querySelector('#darthy-account-body');
    wrap.querySelector('#darthy-account-h').onclick = () => {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      wrap.querySelector('.darthy-caret').textContent = open ? '▸' : '▾';
    };
    wrap.querySelector('#darthy-account-update').onclick = (e) => {
      e.preventDefault();
      updateNow();
    };
    render();
    return true;
  }

  window.DarthyPrimeAccount = {
    init: function () {
      let tries = 0;
      const tick = () => {
        if (mount() || tries > 40) {
          const data = load();
          if (!data.checked || Date.now() - data.checked > WEEK) updateNow();
          return;
        }
        tries++;
        setTimeout(tick, 500);
      };
      tick();
    }
  };
})();
