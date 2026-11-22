/**
 * Neopets Notification Prime v4.8.3 (ported)
 * Training Helper Plus + Clear Notifications button
 * All original functionality preserved. Uses localStorage for training state
 * so existing data from the userscript continues to work.
 */
(function () {
  'use strict';

  const SCHOOLS = {
    island: { name: 'Mystery Island', processUrl: 'https://www.neopets.com/island/process_training.phtml', hpMult: 3 },
    academy: { name: 'Swashbuckling Academy', processUrl: 'https://www.neopets.com/pirates/process_academy.phtml', hpMult: 2 },
    ninja: { name: 'Secret Ninja', processUrl: 'https://www.neopets.com/island/process_fight_training.phtml', hpMult: 3 }
  };
  const NICE_SCHOOL = { ninja: 'Ninja Training', island: 'Beginner Training', academy: 'Deck Scrubber' };
  const BATTLE_STAT_CAP = 850;

  const LOCAL_ACTIVE = 'neoActiveTrainings';
  const LOCAL_COMPLETED = 'neoCompletedTrainings';
  const LOCAL_PENDING_WITHDRAW = 'neoPendingSDBWithdraw';
  const LOCAL_PAY_URL = 'neoAutoPayUrl';
  const LOCAL_SEEN_ALERTS = 'neoSeenNativeAlerts';

  const loadActive = () => JSON.parse(localStorage.getItem(LOCAL_ACTIVE)) || {};
  const saveActive = d => localStorage.setItem(LOCAL_ACTIVE, JSON.stringify(d));
  const loadCompleted = () => {
    const arr = JSON.parse(localStorage.getItem(LOCAL_COMPLETED)) || [];
    return arr.filter(n => Date.now() - n.timestamp < 30 * 86400000);
  };
  const saveCompleted = arr => localStorage.setItem(LOCAL_COMPLETED, JSON.stringify(arr));
  const loadSeenAlerts = () => new Set(JSON.parse(localStorage.getItem(LOCAL_SEEN_ALERTS)) || []);
  const saveSeenAlerts = set => localStorage.setItem(LOCAL_SEEN_ALERTS, JSON.stringify([...set]));

  function detectSchool() {
    const t = document.body.innerText;
    const u = location.href;
    if (t.includes('Secret Ninja') || u.includes('fight_training')) return 'ninja';
    if (t.includes('Swashbuckling Academy') || u.includes('academy')) return 'academy';
    return 'island';
  }

  function getSchoolInfo() { return SCHOOLS[detectSchool()]; }

  function getPetStats(container) {
    const text = (container.textContent || '').replace(/\s+/g, ' ');
    let level = 0;
    const levelMatch = text.match(/Lvl\s*:\s*(\d+)/i) || text.match(/Level\s*:\s*(\d+)/i) || text.match(/\(Level\s*(\d+)\)/i);
    if (levelMatch) level = parseInt(levelMatch[1]);
    const strMatch = text.match(/Str(?:ength)?\s*:\s*(\d+)/i);
    const str = strMatch ? parseInt(strMatch[1]) : 0;
    const defMatch = text.match(/Def(?:ence)?\s*:\s*(\d+)/i);
    const def = defMatch ? parseInt(defMatch[1]) : 0;
    let maxHp = 0;
    let hpMatch = text.match(/(?:Hp|HP|Health|Hit\s*Points?|Endurance)\s*:\s*(\d+)\s*\/\s*(\d+)/i);
    if (hpMatch) maxHp = parseInt(hpMatch[2]);
    else {
      hpMatch = text.match(/(?:Hp|HP|Health|Hit\s*Points?|Endurance)\s*:\s*(\d+)/i);
      if (hpMatch) maxHp = parseInt(hpMatch[1]);
    }
    return { level, str, def, maxHp };
  }

  function timeToEnd(h, min, s) {
    return Date.now() + (parseInt(h, 10) || 0) * 3600000 + (parseInt(min, 10) || 0) * 60000 + (parseInt(s, 10) || 0) * 1000;
  }

  function parseTimeMatch(str) {
    if (!str) return null;
    const m = String(str).match(/(\d+)\s*hrs?,\s*(\d+)\s*minutes?(?:,\s*(\d+)\s*seconds?)?/i);
    if (!m) return null;
    return timeToEnd(m[1], m[2], m[3] || 0);
  }

  function isStruckTimeEl(el) {
    if (!el) return false;
    if (el.closest && el.closest('s, strike, del, .strikethrough')) return true;
    try {
      const st = window.getComputedStyle(el);
      if (st && String(st.textDecorationLine || st.textDecoration || '').indexOf('line-through') !== -1) return true;
    } catch (_) {}
    return false;
  }

  // Training Fortune Cookie strikes through the original time and shows the
  // discounted remaining time. Always use the shortest remaining time.
  function parseTrainingTime(blockText, element) {
    const found = [];
    const root = element || null;
    if (root) {
      const nodes = [root].concat(Array.from(root.querySelectorAll('b, span, font, td, div')));
      nodes.forEach((el) => {
        if (isStruckTimeEl(el)) return;
        const t = parseTimeMatch(el.textContent || '');
        if (t) found.push(t);
      });
      const struck = Array.from(root.querySelectorAll('s, strike, del, .strikethrough')).concat(
        nodes.filter(isStruckTimeEl)
      );
      if (struck.length) {
        const live = [];
        nodes.forEach((el) => {
          if (isStruckTimeEl(el)) return;
          const t = parseTimeMatch(el.textContent || '');
          if (t) live.push(t);
        });
        if (live.length) return Math.min.apply(null, live);
      }
    }

    const re = /(\d+)\s*hrs?,\s*(\d+)\s*minutes?(?:,\s*(\d+)\s*seconds?)?/gi;
    const all = [];
    let m;
    while ((m = re.exec(blockText || '')) !== null) all.push(timeToEnd(m[1], m[2], m[3] || 0));
    if (found.length) return Math.min.apply(null, found);
    if (!all.length) return null;
    return Math.min.apply(null, all);
  }

  function classifyAlertIcon(imgSrc, typeText, messageText, extraContext) {
    const blob = ((imgSrc || '') + ' ' + (typeText || '') + ' ' + (messageText || '') + ' ' + (extraContext || '')).toLowerCase();

    // ----- Gifting (eventcode-4000) -----
    // Green border for gifts received; red border if item was returned
    if (blob.includes('eventcode-4000') || blob.includes('transfer_list') || /has given you|gifted you|sent you a gift/i.test(blob)) {
      const returned = /returned|was returned|item was returned/i.test(blob);
      return {
        kind: returned ? 'gift-return' : 'gift',
        icon: 'https://images.neopets.com/t/events/item.gif',
        border: returned ? '#e74c3c' : '#27ae60'
      };
    }
    if (/returned by|was returned by|item was returned/i.test(blob)) {
      return {
        kind: 'gift-return',
        icon: 'https://images.neopets.com/t/events/item.gif',
        border: '#e74c3c'
      };
    }

    // ----- NeoFriend request (eventcode-5000) -----
    if (blob.includes('eventcode-5000') || blob.includes('neofriend_requests') || /requesting to become your neofriend|neo\s*friend request/i.test(blob)) {
      return {
        kind: 'neofriend',
        icon: 'https://images.neopets.com/t/events/friend_request.gif',
        border: '#60a5fa'
      };
    }

    // ----- Neomail -----
    // TNT (theneopetsteam) → red border; other users → shiny gold border
    if (
      blob.includes('ul_neomail') ||
      blob.includes('neomail') ||
      blob.includes('eventcode-1000') ||
      blob.includes('neomessages') ||
      /new neomail|neomail from|message from:|you have.*neomail/i.test(blob)
    ) {
      const isTnt = /theneopetsteam|message from:\s*theneopetsteam/i.test(blob);
      return {
        kind: isTnt ? 'neomail-tnt' : 'neomail',
        icon: 'https://images.neopets.com/icons/ul/ul_neomail.gif',
        border: isTnt ? '#e74c3c' : '#f5c542' // red TNT / gold others
      };
    }

    // ----- Instant trade sold (eventcode-6009) -----
    if (
      blob.includes('eventcode-6009') ||
      blob.includes('viewlotsold') ||
      /has purchased lot\s+\d+\s+for/i.test(blob)
    ) {
      return {
        kind: 'instant-sold',
        icon: 'https://images.neopets.com/t/events/trade_accept.gif',
        border: '#27ae60'
      };
    }

    // ----- Trade lot expiring soon -----
    if (
      blob.includes('lotexpiredsoon') ||
      blob.includes('expiring soon') ||
      blob.includes('eventcode-6006') ||
      /lot\s+\d+\s+is\s+expiring\s+soon/i.test(blob)
    ) {
      return {
        kind: 'expiring',
        icon: 'https://images.neopets.com/t/events/trade_withdraw.gif',
        border: 'half-rg'
      };
    }

    // ----- Trades (icon match first) -----
    if (blob.includes('trade_withdraw')) {
      return { kind: 'withdraw', icon: 'https://images.neopets.com/t/events/trade_withdraw.gif', border: '#e74c3c' };
    }
    if (blob.includes('trade_offer')) {
      return { kind: 'offer', icon: 'https://images.neopets.com/t/events/trade_offer.gif', border: '#f5c542' };
    }
    if (blob.includes('trade_accept')) {
      return { kind: 'accept', icon: 'https://images.neopets.com/t/events/trade_accept.gif', border: '#27ae60' };
    }

    // Text heuristics
    if (/withdraw|cancelled|canceled|removed offer|offer was withdrawn/i.test(blob)) {
      return { kind: 'withdraw', icon: 'https://images.neopets.com/t/events/trade_withdraw.gif', border: '#e74c3c' };
    }
    if (/new offer|made an offer|offer on your|someone offered/i.test(blob)) {
      return { kind: 'offer', icon: 'https://images.neopets.com/t/events/trade_offer.gif', border: '#f5c542' };
    }
    if (/accepted|accept(ed)? your trade|trade was accepted|successfully purchased|you bought|trade complete|completed trade/i.test(blob)) {
      return { kind: 'accept', icon: 'https://images.neopets.com/t/events/trade_accept.gif', border: '#27ae60' };
    }

    return null;
  }

  function scanNativeAlerts() {
    const alertsContainer = document.getElementById('alerts');
    if (!alertsContainer) return { current: [], newOnes: [] };

    const seen = loadSeenAlerts();
    const current = [];
    const newOnes = [];

    alertsContainer.querySelectorAll('li').forEach(li => {
      const delDiv = li.querySelector('.alert-x');
      const delId = delDiv ? delDiv.dataset.delid : null;
      if (!delId) return;

      const linkEl = li.querySelector('a');
      const h4 = li.querySelector('h4');
      const p = li.querySelector('p');
      const h5 = li.querySelector('h5');
      const imgEl = li.querySelector('img');

      const type = h4 ? h4.textContent.trim() : 'Alert';
      const message = p ? p.textContent.trim() : '';
      const imgSrc = imgEl ? (imgEl.getAttribute('src') || '') : '';

      const linkHref = linkEl ? (linkEl.getAttribute('href') || linkEl.href || '') : '';
      // CSS class on the icon div (e.g. alerts-tab-eventcode-6006) is useful for classification
      const iconDiv = li.querySelector('.alerts-tab-item-icon__2020, [class*="alerts-tab-eventcode"]');
      const iconClass = iconDiv ? (iconDiv.className || '') : '';
      const classified = classifyAlertIcon(imgSrc, type, message, linkHref + ' ' + iconClass);

      const alertData = {
        id: delId,
        type,
        message,
        time: h5 ? h5.textContent.trim() : '',
        url: linkEl ? linkEl.href : '#',
        imgSrc,
        alertKind: classified ? classified.kind : null,
        alertIcon: classified ? classified.icon : null,
        alertBorder: classified ? classified.border : null
      };

      current.push(alertData);
      if (!seen.has(delId)) {
        newOnes.push(alertData);
        seen.add(delId);
      }
    });

    saveSeenAlerts(seen);
    return { current, newOnes };
  }


  // ---------- Instant Trade profit (eventcode-6009) ----------
  // "user has purchased lot 123 for 4,000,000 NP!"
  // Blacklist lot ID for 6h; at 5h auto-delete the alert so it can't double-count.
  const INSTANT_TRADE_KEY = 'darthy_instant_trade_lots';
  const SIX_H = 6 * 60 * 60 * 1000;
  const FIVE_H = 5 * 60 * 60 * 1000;

  function loadInstantLots() {
    try {
      const raw = localStorage.getItem(INSTANT_TRADE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }
  function saveInstantLots(obj) {
    try { localStorage.setItem(INSTANT_TRADE_KEY, JSON.stringify(obj)); } catch (_) {}
  }

  function parseInstantTradeMessage(msg) {
    // thrashtilldeth has purchased lot 447850291 for 4,000,000 NP!
    const m = String(msg || '').match(/purchased\s+lot\s+(\d+)\s+for\s+([\d,]+)\s*NP/i);
    if (!m) return null;
    const lotId = m[1];
    const amount = parseInt(String(m[2]).replace(/,/g, ''), 10);
    if (!lotId || !amount || amount <= 0) return null;
    return { lotId, amount };
  }

  function addTradeProfit(amount) {
    if (!amount || amount <= 0) return;
    if (window.DarthyPrimeShop && typeof window.DarthyPrimeShop.addProfit === 'function') {
      window.DarthyPrimeShop.addProfit(amount);
    } else {
      try {
        const key = 'darthy_shop_profit_total';
        if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
          const g = GM_getValue(key, 0) || 0;
          GM_setValue(key, g + amount);
        }
      } catch (_) {}
    }
    if (window.DarthyPrimeShop && typeof window.DarthyPrimeShop.refreshUI === 'function') {
      window.DarthyPrimeShop.refreshUI();
    }
  }
  function openAlertsForClear() {
    const box = document.getElementById('alerts');
    if (box && box.offsetParent !== null) return true;
    const bell = document.querySelector('#navAlerts__2020, .nav-alerts-icon__2020, [id*="alerts"][class*="nav"], .nav-link-alerts__2020');
    if (bell) {
      try { bell.click(); } catch (_) {}
    }
    return !!(document.getElementById('alerts'));
  }
  function clearAlertById(delId) {
    if (!delId) return false;
    openAlertsForClear();
    const el = document.querySelector('.alert-x[data-delid="' + delId + '"]') ||
      document.querySelector('.alert-x[data-delid="' + String(delId) + '"]');
    if (!el) return false;
    try { el.click(); } catch (_) { return false; }
    return true;
  }
  function processInstantTradeProfits(alerts) {
    if (!alerts || !alerts.length) return;
    const lots = loadInstantLots();
    const now = Date.now();
    Object.keys(lots).forEach(id => {
      if (now - (lots[id].ts || 0) > SIX_H && lots[id].added) delete lots[id];
    });

    alerts.forEach(a => {
      const isInstant =
        a.alertKind === 'instant-sold' ||
        /purchased\s+lot\s+\d+\s+for/i.test(a.message || '') ||
        /viewlotsold/i.test(a.url || '');
      if (!isInstant) return;
      const parsed = parseInstantTradeMessage(a.message);
      if (!parsed) return;
      const existing = lots[parsed.lotId];
      if (existing) {
        if (!existing.delId && a.id) existing.delId = a.id;
        return;
      }
      lots[parsed.lotId] = {
        amount: parsed.amount,
        ts: now,
        delId: a.id,
        message: a.message,
        added: false,
        cleared: false
      };
      console.log('%c[DarthyPrime] Instant trade seen, lot ' + parsed.lotId + ' — profit in 5h', 'color:#fbbf24');
    });
    saveInstantLots(lots);
  }
  function checkInstantTradeDeletePrompts(alerts) {
    const lots = loadInstantLots();
    const now = Date.now();
    const due = [];
    Object.keys(lots).forEach(lotId => {
      const e = lots[lotId];
      if (!e) return;
      const age = now - (e.ts || 0);
      if (age < FIVE_H) return;
      const stillThere = (alerts || []).some(a => a.id === e.delId || (a.message || '').includes('lot ' + lotId));
      if (!stillThere && e.added) {
        e.cleared = true;
        return;
      }
      if (e.cleared && e.added) return;
      due.push({ lotId, stillThere, ...e });
    });
    if (!due.length) {
      saveInstantLots(lots);
      return;
    }
    if (window.__darthyInstantAutoClear) return;
    window.__darthyInstantAutoClear = true;
    due.forEach(d => {
      const e = lots[d.lotId];
      if (!e) return;
      if (!e.added) {
        addTradeProfit(e.amount);
        e.added = true;
        console.log('%c[DarthyPrime] Instant trade profit +' + e.amount.toLocaleString() + ' NP (lot ' + d.lotId + ')', 'color:#4ade80;font-weight:bold');
      }
      if (!e.cleared) {
        const clicked = clearAlertById(e.delId);
        if (clicked || !d.stillThere) e.cleared = true;
      }
    });
    saveInstantLots(lots);
    setTimeout(() => { window.__darthyInstantAutoClear = false; }, 2500);
  }

  // Hook: when native alerts are scanned for the panel / badge
  const _origScanNativeAlerts = scanNativeAlerts;
  scanNativeAlerts = function () {
    const result = _origScanNativeAlerts();
    try {
      // Process both current + new so a first load after install still counts once via blacklist
      processInstantTradeProfits(result.current || []);
      checkInstantTradeDeletePrompts(result.current || []);
    } catch (e) {
      console.warn('[DarthyPrime] instant trade hook', e);
    }
    return result;
  };

  // When Clear Notifications is used, mark all pending lots as prompted
  document.addEventListener('click', function (e) {
    const t = e.target;
    if (t && (t.id === 'clear-notifications-btn' || (t.closest && t.closest('#clear-notifications-btn')))) {
      const lots = loadInstantLots();
      Object.keys(lots).forEach(id => { lots[id].prompted = true; });
      saveInstantLots(lots);
    }
  }, true);

  function parseVisibleStatusPage() {
    const schoolKey = detectSchool();
    const schoolName = getSchoolInfo().name;
    let active = loadActive();

    document.querySelectorAll('td[bgcolor="#efefef"], td[bgcolor="#000000"]').forEach(header => {
      const txt = header.textContent || '';
      if (!txt.includes('is currently studying')) return;

      const petMatch = txt.match(/([A-Za-z][A-Za-z0-9_]+)\s*\(Level\s*\d+\)/);
      if (!petMatch) return;
      const pet = petMatch[1];
      const row = header.closest('tr');
      const statsTd = row?.nextElementSibling?.querySelector('td[bgcolor="white"]');
      if (!statsTd) return;

      const timeTd = row?.nextElementSibling?.querySelector('td[width="250"]:last-child') || row?.nextElementSibling;
      const blockText = (statsTd?.textContent || '') + ' ' + (timeTd?.textContent || '');

      let endTime = null;
      if (blockText.includes('Course Finished!')) {
        delete active[pet];
        return;
      }
      endTime = parseTrainingTime(blockText, timeTd || statsTd || row?.nextElementSibling);
      if (!endTime) return;

      const skillMatch = txt.match(/studying\s+(.+?)(?:\s|$)/i);
      active[pet] = {
        school: schoolKey,
        skill: skillMatch ? skillMatch[1].trim() : 'Level',
        endTime,
        statusUrl: location.href,
        schoolName
      };
    });
    saveActive(active);

    // Drop stale "training completed" rows / alerts once that pet is studying again
    try {
      const completed = loadCompleted().filter(c => {
        const a = active[c.petName];
        return !(a && a.endTime && a.endTime > Date.now() + 8000);
      });
      saveCompleted(completed);
      const studying = {};
      Object.keys(active).forEach(p => {
        if (active[p] && active[p].endTime && active[p].endTime > Date.now() + 8000) studying[p.toLowerCase()] = true;
      });
      const box = document.getElementById('alerts');
      if (box) {
        box.querySelectorAll('li').forEach(li => {
          const blob = ((li.textContent || '') + ' ' + ((li.querySelector('a') && li.querySelector('a').href) || '')).toLowerCase();
          if (!/training|academy|fight_training/i.test(blob)) return;
          if (!/finish|complete|has finished/i.test(blob)) return;
          const m = (li.textContent || '').match(/([A-Za-z][A-Za-z0-9_]{2,})/);
          const x = li.querySelector('.alert-x');
          if (m && studying[m[1].toLowerCase()] && x) {
            try { x.click(); } catch (_) {}
          }
        });
      }
    } catch (_) {}
  }

  function addSmartQuickButtons() {
    return; // Plus: Training Auto starts courses itself
    const activePets = Object.keys(loadActive());
    const school = getSchoolInfo();

    document.querySelectorAll('.darthy-train-courses').forEach(el => el.remove());
    document.querySelectorAll('.darthy-train-elsewhere').forEach(el => el.remove());
    let trainJobPet = '';
    try {
      const j = typeof GM_getValue === 'function' ? GM_getValue('darthy_train_job', null) : null;
      if (j && j.active && j.pets && j.pets[j.petIndex]) trainJobPet = String(j.pets[j.petIndex].name || '');
    } catch (_) {}
    const cells = document.querySelectorAll('td[bgcolor="white"], td[bgcolor="#ffffff"]');
    const extra = cells.length ? [] : Array.from(document.querySelectorAll('td')).filter(td =>
      /Lvl\s*:/i.test(td.textContent || '') && !td.querySelector('td'));
    const seenPets = new Set();
    Array.from(cells).concat(extra).forEach(cell => {
      if (cell.querySelector('td')) return;
      const text = cell.textContent || '';
      if (!/Lvl\s*:/i.test(text) && !/\(Level\s*\d+\)/i.test(text)) return;
      if (!/Lvl\s*:/i.test(text) && !/Hp\s*:/i.test(text) && !/Str\s*:/i.test(text)) return;

      const stats = getPetStats(cell);
      let header = cell.closest('tr')?.previousElementSibling?.querySelector('td[bgcolor="#efefef"], td[bgcolor="#000000"]');
      let pet = null;
      if (header) {
        const headerTxt = header.textContent || '';
        const petMatch = headerTxt.match(/([A-Za-z][A-Za-z0-9_]+)\s*\(Level\s*\d+\)/);
        if (petMatch) pet = petMatch[1];
      }
      if (!pet) {
        const oldPetMatch = text.match(/([A-Za-z][A-Za-z0-9_]{2,})\s*(?:\(Level|:)/);
        if (oldPetMatch) pet = oldPetMatch[1];
      }
      if (!pet) return;
      const petKey = pet.toLowerCase();
      if (seenPets.has(petKey)) return;
      seenPets.add(petKey);

      const stillTraining = activePets.includes(pet) && loadActive()[pet] &&
        (loadActive()[pet].endTime || 0) > Date.now() + 2000;
      const thisIsJobPet = trainJobPet && trainJobPet.toLowerCase() === pet.toLowerCase();
      if (stillTraining && !thisIsJobPet) {
        const note = document.createElement('span');
        note.className = 'darthy-train-elsewhere';
        note.style = 'margin-left:8px;color:#e74c3c;font-weight:bold;';
        note.textContent = '[Training Elsewhere]';
        cell.appendChild(note);
        return;
      }

      const { level, str, def, maxHp } = stats;
      const hpCap = level * school.hpMult + (detectSchool() !== 'academy' ? 3 : 0);

      let recommended = null;
      if (level < 30) recommended = 'Level';
      else if (str < BATTLE_STAT_CAP) recommended = 'Strength';
      else if (def < BATTLE_STAT_CAP) recommended = 'Defence';
      else if (maxHp < hpCap) recommended = 'Endurance';
      else recommended = 'Level';

      const container = document.createElement('div');
      container.className = 'darthy-train-courses';
      container.style.cssText = 'margin-top:6px;';

      const makeBtn = (course, letter) => {
        const isRec = course === recommended;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Start recommended [+ ' + letter + ']';
        btn.className = 'darthy-course-btn' + (isRec ? ' darthy-course-rec' : '');
        btn.setAttribute('data-darthy-course', course);
        btn.setAttribute('data-darthy-pet', pet);
        if (isRec) btn.setAttribute('data-darthy-rec', '1');
        btn.style.cssText = 'color:' + (isRec ? '#e74c3c' : '#27ae60') +
          ';font-weight:' + (isRec ? 'bold' : 'normal') +
          ';cursor:pointer;margin:0 4px;padding:1px 4px;background:none;border:none;' +
          'text-decoration:underline;font-family:Verdana,Arial,sans-serif;font-size:12px;';
        btn.addEventListener('click', function (ev) {
          try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
          if (typeof window.quickStart === 'function') window.quickStart(pet, course);
        });
        container.appendChild(btn);
      };

      const letter = recommended === 'Strength' ? 'S' :
        recommended === 'Defence' ? 'D' :
        recommended === 'Endurance' ? 'E' : 'L';
      makeBtn(recommended, letter);

      if (str >= BATTLE_STAT_CAP && def >= BATTLE_STAT_CAP && maxHp >= hpCap) {
        const maxed = document.createElement('span');
        maxed.style = 'color:#e74c3c;font-size:12px;margin-left:6px;';
        maxed.textContent = '(maxed ✓)';
        container.appendChild(maxed);
      }
      cell.appendChild(container);
    });
  }

  function paintUnpaidRow(pet, htmlText) {
    let stones = [];
    try {
      const doc = new DOMParser().parseFromString(htmlText || '', 'text/html');
      stones = parseRequiredTrainingItems(doc.body || doc);
      if (!stones.length) {
        const re = /\b([A-Za-z][A-Za-z-]+\s+Codestone)\b/gi;
        const blob = (doc.body && doc.body.innerText) || htmlText || '';
        const seen = {};
        let m;
        while ((m = re.exec(blob))) {
          const n = m[1].replace(/\s+/g, ' ').trim();
          if (!seen[n]) { seen[n] = 1; stones.push({ name: n, qty: 1 }); }
        }
      }
    } catch (_) {}
    let payHost = null;
    const form = Array.from(document.querySelectorAll('form')).find(f => {
      const t = f.querySelector('input[name="type"][value="complete"]');
      const w = f.querySelector('input[name="pet_name"]');
      return t && w && w.value.toLowerCase() === String(pet).toLowerCase();
    });
    if (form) payHost = form.closest('td') || form.parentElement;
    if (!payHost) {
      document.querySelectorAll('td[bgcolor="#efefef"], td[bgcolor="#000000"]').forEach(header => {
        const m = (header.textContent || '').match(/([A-Za-z][A-Za-z0-9_]+)\s*\(Level\s*\d+\)/);
        if (!m || m[1].toLowerCase() !== String(pet).toLowerCase()) return;
        const row = header.closest('tr') && header.closest('tr').nextElementSibling;
        if (!row) return;
        const tds = row.querySelectorAll('td');
        payHost = tds[1] || tds[tds.length - 1] || null;
      });
    }
    if (!payHost) return stones;
    const action = (getSchoolInfo() && getSchoolInfo().processUrl) || 'process_training.phtml';
    const names = stones.map(x => '<b>' + x.name + '</b>').join('<br>');
    payHost.innerHTML = 'This course has not been paid for yet <br><br>' +
      (names || '') + '<br><br>' +
      '<form action="' + action.replace(/^https:\/\/www\.neopets\.com\//, '') + '" method="post">' +
      '<input type="hidden" name="pet_name" value="' + pet + '">' +
      '<input type="hidden" name="type" value="pay">' +
      '<input type="submit" value="Pay"></form>';
    try { addItemGrabberButton(); } catch (_) {}
    return stones;
  }

  window.quickStart = function(pet, course) {
    const school = getSchoolInfo();
    const banner = document.createElement('div');
    banner.style = 'position:fixed;top:20%;left:50%;transform:translate(-50%,-50%);background:#28a745;color:white;padding:20px 40px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.4);z-index:999999;font-size:18px;text-align:center;';
    banner.innerHTML = '✅ <b>Training started!</b><br>' + pet + ' → ' + course;
    document.body.appendChild(banner);
    const body = new URLSearchParams({ type: 'start', course_type: course, pet_name: pet });
    fetch(school.processUrl, { method: 'POST', body: body, credentials: 'include', redirect: 'follow' })
      .then(r => r.text())
      .then(html => {
        paintUnpaidRow(pet, html);
        setTimeout(() => banner.remove(), 800);
      })
      .catch(() => {
        setTimeout(() => banner.remove(), 800);
      });
  };
  window.darthyStartCourseNow = function(pet, course) {
    const school = getSchoolInfo();
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = school.processUrl;
    form.innerHTML =
      '<input type="hidden" name="type" value="start">' +
      '<input type="hidden" name="course_type" value="' + course + '">' +
      '<input type="hidden" name="pet_name" value="' + pet + '">';
    document.body.appendChild(form);
    form.submit();
  };

  const recStartQueued = {};
  function petNameFromComplete(form, button, container) {
    try {
      const inp = form && form.querySelector('input[name="pet_name"], input[name="pet_name"]');
      if (inp && inp.value) return inp.value.trim();
    } catch (_) {}
    const root = (button && button.closest('tr')) || (form && form.closest('tr')) || (container && container.closest('tr'));
    const header = root && root.previousElementSibling
      ? root.previousElementSibling.querySelector('td[bgcolor="#efefef"], td[bgcolor="#000000"]')
      : null;
    const m = ((header && header.textContent) || '').match(/([A-Za-z][A-Za-z0-9_]+)\s*\(Level\s*\d+\)/);
    return m ? m[1] : '';
  }
  function queueRecommendedStart(pet) {
    const who = String(pet || '').trim();
    if (!who) {
      const rec = document.querySelector('[data-darthy-rec="1"]');
      if (rec) return queueRecommendedStart(rec.getAttribute('data-darthy-pet'));
      return;
    }
    const k = who.toLowerCase();
    if (recStartQueued[k]) return;
    recStartQueued[k] = true;
    setTimeout(function () {
      try { addSmartQuickButtons(); } catch (_) {}
      const rec = document.querySelector('[data-darthy-rec="1"][data-darthy-pet="' + who + '"]') ||
        document.querySelector('button.darthy-course-rec[data-darthy-pet="' + who + '"]') ||
        document.querySelector('[data-darthy-rec="1"]');
      const course = (rec && rec.getAttribute('data-darthy-course')) || 'Level';
      const name = (rec && rec.getAttribute('data-darthy-pet')) || who;
      if (typeof window.quickStart === 'function') window.quickStart(name, course);
      else if (typeof window.darthyStartCourseNow === 'function') window.darthyStartCourseNow(name, course);
    }, 1000);
  }
  window.darthyQueueRecommendedStart = queueRecommendedStart;

  function handleCompleteCourseButtons() {
    document.querySelectorAll('input[type="submit"][value="Complete Course!"]').forEach(button => {
      const form = button.closest('form');
      if (!form || button.dataset.enhanced) return;
      button.dataset.enhanced = 'true';
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        await completeSingleCourse(form, button);
      });
    });
  }

  async function completeSingleCourse(form, button) {
    if (button) {
      button.value = 'Completing...';
      button.disabled = true;
    }
    try {
      const formData = new FormData(form);
      const response = await fetch(form.action, { method: 'POST', body: formData, credentials: 'include' });
      const responseHtml = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(responseHtml, 'text/html');

      let gainMessage = 'Course completed!';
      let bonusMessage = '';

      const paragraphs = doc.querySelectorAll('p, b, font');
      for (let el of paragraphs) {
        const text = el.textContent.trim();
        if (text.includes('now has increased') || text.includes('Congratulations')) {
          gainMessage = text;
        }
        if (
          text.toLowerCase().includes('bonus') ||
          text.toLowerCase().includes('extra') ||
          text.toLowerCase().includes('great student') ||
          text.toLowerCase().includes('natural talent') ||
          text.toLowerCase().includes('gained an additional') ||
          text.match(/\+\s*[2-6]/) ||
          text.match(/increased by [2-6]/i)
        ) {
          bonusMessage = text;
        }
      }

      const bodyText = doc.body ? doc.body.innerText : '';
      if (!bonusMessage) {
        const bonusMatch = bodyText.match(/(Wow!.*?|Your pet.*?|.*bonus.*?|.*extra.*?|.*gained an additional.*?)/i);
        if (bonusMatch) bonusMessage = bonusMatch[1].trim();
      }

      const resultBox = document.createElement('div');
      resultBox.style.cssText = 'margin-top:8px;padding:10px 14px;background:#e8f5e9;border:1px solid #4caf50;border-radius:6px;color:#2e7d32;font-size:13px;';

      let resultHtml = `✅ <strong>${gainMessage}</strong>`;
      if (bonusMessage && bonusMessage !== gainMessage) {
        resultHtml += `<br><span style="color:#1565c0;font-weight:bold;">⭐ Bonus: ${bonusMessage}</span>`;
      }
      resultBox.innerHTML = resultHtml;

      const container = form.closest('td') || form.parentElement;
      if (container) {
        form.style.display = 'none';
        container.appendChild(resultBox);
      }
      updateBellBadge();
      try {
        if (!(window.DarthyPrimeTrainAuto && window.DarthyPrimeTrainAuto.isActive && window.DarthyPrimeTrainAuto.isActive())) {
          queueRecommendedStart(petNameFromComplete(form, button, container));
        }
      } catch (_) {}
    } catch (err) {
      console.error('[DarthyPrime Training] Failed to complete course:', err);
      if (button) {
        button.value = 'Error';
        button.disabled = false;
      }
    }
  }

  async function autoCompleteAllCourses() {
    const buttons = Array.from(document.querySelectorAll('input[type="submit"][value="Complete Course!"]'));
    if (buttons.length === 0) return;

    const petsBeingCompleted = [];
    buttons.forEach(btn => {
      const header = btn.closest('tr')?.previousElementSibling?.querySelector('td[bgcolor="#efefef"], td[bgcolor="#000000"]');
      if (header) {
        const match = header.textContent.match(/([A-Za-z][A-Za-z0-9_]+)\s*\(Level\s*\d+\)/);
        if (match) petsBeingCompleted.push(match[1]);
      }
    });

    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:15%;left:50%;transform:translate(-50%,-50%);background:#1565c0;color:white;padding:14px 24px;border-radius:8px;z-index:999999;font-size:15px;';
    banner.innerHTML = `Completing ${buttons.length} course(s)...`;
    document.body.appendChild(banner);

    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const form = button.closest('form');
      if (!form) continue;
      banner.innerHTML = `Completing course ${i + 1} of ${buttons.length}...`;
      await completeSingleCourse(form, button);
      await new Promise(resolve => setTimeout(resolve, 850));
    }

    if (petsBeingCompleted.length > 0) {
      const active = loadActive();
      petsBeingCompleted.forEach(pet => delete active[pet]);
      saveActive(active);
    }

    petsBeingCompleted.forEach(function (pet) { queueRecommendedStart(pet); });
    banner.innerHTML = `✅ All courses completed!`;
    setTimeout(() => {
      banner.remove();
      updateBellBadge();
      if (panel && panel.style.display === 'block') showNotificationPanel();
    }, 1600);
  }

  function stoneNameOnly(raw) {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    const m = t.match(/\b([A-Za-z][A-Za-z-]+\s+Codestone)\b/i) ||
      t.match(/\b([A-Za-z][A-Za-z-]+\s+Dubloon Coin)\b/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }

  function parseRequiredTrainingItems(scope) {
    const items = [];
    const tds = scope ? [scope] : Array.from(document.querySelectorAll('td[width="250"]'));
    tds.forEach(td => {
      if (!td || !/not been paid for yet/i.test(td.textContent || '')) return;
      td.querySelectorAll('b').forEach(b => {
        const n = stoneNameOnly(b.textContent);
        if (n) items.push({ name: n, qty: 1 });
      });
    });
    const merged = {};
    items.forEach(item => {
      if (merged[item.name]) merged[item.name].qty += item.qty;
      else merged[item.name] = { name: item.name, qty: item.qty };
    });
    return Object.values(merged);
  }

  function payFormIn(td) {
    if (!td) return null;
    const hid = td.querySelector('input[name="type"][value="pay"]');
    if (hid) return hid.form || hid.closest('form');
    return td.querySelector('form[action*="process_training"], form[action*="process_fight"], form[action*="process_academy"]');
  }

  function statusUrlForCurrentSchool() {
    const u = location.href.toLowerCase();
    if (u.includes('fight_training')) return 'https://www.neopets.com/island/fight_training.phtml?type=status';
    if (u.includes('academy')) return 'https://www.neopets.com/pirates/academy.phtml?type=status';
    return 'https://www.neopets.com/island/training.phtml?type=status';
  }

  function addItemGrabberButton() {
    return; // Plus: Training Auto withdraws stones itself
    document.querySelectorAll('td[width="250"]').forEach(td => {
      if (!/not been paid for yet/i.test(td.textContent || '') && !td.querySelector('input[value="Pay"]')) return;
      if (td.querySelector('.item-grabber-btn')) return;
      const requiredItems = parseRequiredTrainingItems(td);
      if (!requiredItems.length) return;

      const payForm = payFormIn(td);
      const petInp = payForm && payForm.querySelector('input[name="pet_name"]');
      const pet = (petInp && petInp.value) || '';
      const payMeta = {
        pet: pet,
        action: (payForm && (payForm.getAttribute('action') || payForm.action)) || '',
        statusUrl: statusUrlForCurrentSchool()
      };

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'margin: 8px 0; text-align:center;';

      const btn = document.createElement('button');
      btn.className = 'item-grabber-btn';
      btn.style.cssText = 'background:#222;color:white;border:none;padding:6px 14px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12px;';
      btn.textContent = 'Item Grabber';

      btn.onclick = () => {
        localStorage.setItem(LOCAL_PAY_URL, JSON.stringify(payMeta));
        localStorage.setItem(LOCAL_PENDING_WITHDRAW, JSON.stringify(requiredItems));
        localStorage.setItem(LOCAL_PENDING_WITHDRAW + 'At', String(Date.now()));
        btn.textContent = 'Grabbing...';
        btn.disabled = true;
        setTimeout(() => window.location.href = '/safetydeposit.phtml', 300);
      };

      btnContainer.appendChild(btn);

      const firstP = td.querySelector('p');
      if (firstP) firstP.parentNode.insertBefore(btnContainer, firstP);
      else td.appendChild(btnContainer);
    });
  }

  function launchGrabberForPet(petName) {
    const want = String(petName || '').toLowerCase();
    let td = null;
    document.querySelectorAll('td[width="250"]').forEach(cell => {
      if (!/not been paid for yet/i.test(cell.textContent || '')) return;
      const form = cell.querySelector('form input[name="pet_name"]');
      const who = form && form.value;
      const rowTxt = ((cell.closest('tr') && cell.closest('tr').textContent) || '') +
        ((cell.closest('tr') && cell.closest('tr').previousElementSibling && cell.closest('tr').previousElementSibling.textContent) || '');
      if ((who && who.toLowerCase() === want) || (want && new RegExp(petName, 'i').test(rowTxt))) td = cell;
    });
    if (!td) {
      const btn = document.querySelector('.item-grabber-btn');
      if (btn) td = btn.closest('td');
    }
    if (!td) return false;
    try { addItemGrabberButton(); } catch (_) {}
    const items = parseRequiredTrainingItems(td);
    const payForm = payFormIn(td);
    const petInp = payForm && payForm.querySelector('input[name="pet_name"]');
    const pet = (petInp && petInp.value) || petName;
    const payMeta = {
      pet: pet,
      action: (payForm && (payForm.getAttribute('action') || payForm.action)) || '',
      statusUrl: statusUrlForCurrentSchool()
    };
    localStorage.setItem(LOCAL_PAY_URL, JSON.stringify(payMeta));
    localStorage.setItem(LOCAL_PENDING_WITHDRAW, JSON.stringify(items && items.length ? items : []));
    localStorage.setItem(LOCAL_PENDING_WITHDRAW + 'At', String(Date.now()));
    setTimeout(() => { window.location.href = '/safetydeposit.phtml'; }, 250);
    return true;
  }
  window.darthyClickItemGrabber = launchGrabberForPet;

  function autoPayAfterWithdraw() {
    const raw = localStorage.getItem(LOCAL_PAY_URL);
    if (!raw) return;
    let meta = null;
    try { meta = JSON.parse(raw); } catch (_) { meta = null; }
    if (typeof raw === 'string' && raw.indexOf('http') === 0 && !meta) {
      localStorage.removeItem(LOCAL_PAY_URL);
      setTimeout(() => { window.location.href = raw; }, 1400);
      return;
    }
    if (!meta || typeof meta !== 'object') return;
    const pet = String(meta.pet || '');
    let form = null;
    document.querySelectorAll('form').forEach(f => {
      const type = f.querySelector('input[name="type"]');
      const who = f.querySelector('input[name="pet_name"]');
      if (type && type.value === 'pay' && (!pet || (who && who.value.toLowerCase() === pet.toLowerCase()))) {
        form = form || f;
      }
    });
    const payBtn = form && form.querySelector('input[type="submit"][value="Pay"]');
    if (!payBtn && !form) return;
    localStorage.removeItem(LOCAL_PAY_URL);
    const banner = document.createElement('div');
    banner.style = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);background:#27ae60;color:white;padding:16px 28px;border-radius:10px;z-index:999999;font-size:16px;text-align:center;';
    banner.innerHTML = '✅ Items moved!<br>Paying for ' + (pet || 'course') + '...';
    document.body.appendChild(banner);
    setTimeout(() => {
      if (payBtn) payBtn.click();
      else if (form) form.submit();
    }, 1200);
  }

  function trainHandedOff() {
    try { return !!(window.DarthyPrimeTrainAuto && window.DarthyPrimeTrainAuto.isActive && window.DarthyPrimeTrainAuto.isActive()); }
    catch (_) { return false; }
  }
  function handleAutoSDBWithdraw() {
    if (!location.pathname.includes('safetydeposit.phtml')) return;
    // 1.8.45: withdraw only for a Training job or an Item Grabber click from the last 15 minutes —
    // a leftover list no longer makes the SDB act when you open it yourself.
    {
      const at = parseInt(localStorage.getItem(LOCAL_PENDING_WITHDRAW + 'At') || '0', 10) || 0;
      if (!trainHandedOff() && !(at && Date.now() - at < 15 * 60 * 1000)) return;
    }
    try { if (window.DarthyPrimeSdbAH && window.DarthyPrimeSdbAH.isRunning && window.DarthyPrimeSdbAH.isRunning()) return; } catch (_) {}
    if (window.__darthySdbBusy) return;
    let pending = [];
    try { pending = JSON.parse(localStorage.getItem(LOCAL_PENDING_WITHDRAW) || '[]') || []; } catch (_) { pending = []; }
    if (!pending.length) return;
    window.__darthySdbBusy = true;

    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#2c5aa0;color:white;padding:12px 24px;border-radius:8px;z-index:999999;font-size:15px;';
    document.body.appendChild(statusDiv);

    const req = pending[0] || {};
    const want = stoneNameOnly(req.name) || String(req.name || '').replace(/\s+/g, ' ').trim();
    const needQty = Math.max(1, parseInt(req.qty, 10) || 1);
    statusDiv.textContent = 'SDB ' + pending.length + ' left — search ' + want;

    function savePending(list) {
      pending = list;
      localStorage.setItem(LOCAL_PENDING_WITHDRAW, JSON.stringify(list));
    }

    function exactRow() {
      if (!want) return null;
      const rows = document.querySelectorAll('.sdb-table tbody tr, table.sdb-table tr, .sdb-item-row');
      for (const row of rows) {
        const nameEl = row.querySelector('.sdb-item-name, .sdb-col-name');
        const have = (nameEl ? nameEl.textContent : '').replace(/\s+/g, ' ').trim();
        if (have && have.toLowerCase() === want.toLowerCase()) return row;
      }
      return null;
    }

    function sdbEmpty() {
      const empty = document.querySelector('.sdb-empty');
      const t = ((empty && empty.textContent) || document.body.innerText || '');
      return /couldn.?t find any items matching|could not find any items matching|no items matching/i.test(t);
    }
    function setVueValue(el, value) {
      if (!el) return;
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function confirmReady() {
      const btn = document.querySelector('.sdb-drawer .sdb-drawer-confirm-btn, .sdb-drawer-confirm-btn');
      if (!btn || btn.disabled || btn.classList.contains('np-button-disabled')) return null;
      return btn;
    }
    function ensureEntireSdb() {
      const btn = Array.from(document.querySelectorAll('.sdb-scope-toggle [role="radio"], .sdb-scope-toggle button'))
        .find(b => /entire sdb/i.test(b.textContent || '') || /whole safety deposit/i.test(b.title || ''));
      if (!btn) return;
      if (btn.getAttribute('aria-checked') === 'true' || btn.classList.contains('is-active')) return;
      try { btn.click(); } catch (_) {}
    }

    function finishReturn() {
      localStorage.removeItem(LOCAL_PENDING_WITHDRAW);
      statusDiv.textContent = 'Done! Returning...';
      let returnUrl = '/island/training.phtml?type=status';
      let pet = localStorage.getItem('darthy_train_sdb_pet') || '';
      try {
        const meta = JSON.parse(localStorage.getItem(LOCAL_PAY_URL) || 'null');
        if (meta && meta.statusUrl) returnUrl = meta.statusUrl;
        if (meta && meta.pet) pet = meta.pet;
      } catch (_) {}
      if (pet) localStorage.setItem('darthy_train_sdb_done', pet);
      setTimeout(() => { window.location.href = returnUrl; }, 1400);
    }

    function nextOrDone() {
      if (pending.length) {
        statusDiv.textContent = 'Next stone (' + pending.length + ' left)';
        setTimeout(() => { window.location.href = '/safetydeposit.phtml'; }, 1600);
      } else {
        finishReturn();
      }
    }

    function withdrawRow(row) {
      const input = row.querySelector('.np-stepper-input, input[type="number"], input.sdb-qty');
      const max = parseInt(input && (input.max || input.getAttribute('max')), 10) || needQty;
      const qty = Math.min(needQty, max);
      if (input) {
        input.value = String(qty);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const checkbox = row.querySelector('.sdb-item-checkbox, input[type="checkbox"]');
      if (checkbox && !checkbox.checked) {
        try { checkbox.click(); } catch (_) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      setTimeout(() => {
        const actionSelect = document.querySelector('.sdb-drawer select.sdb-action-select, .sdb-drawer select.sdb-as-native');
        if (actionSelect) setVueValue(actionSelect, 'inventory');
        setTimeout(() => {
          const firstConfirm = confirmReady();
          if (firstConfirm) firstConfirm.click();
          setTimeout(() => {
            const popupConfirm = document.querySelector('#sdb__popup .popup-footer__2020 button.np-button.button-green__2020, #sdb__popup button.button-green__2020');
            if (popupConfirm) popupConfirm.click();
            savePending(pending.slice(1));
            setTimeout(nextOrDone, 1800);
          }, 1100);
        }, 800);
      }, 600);
    }

    function waitForSearchUi(tries) {
      const box = document.querySelector('.sdb-search-input');
      const btn = document.querySelector('.sdb-search-btn');
      if (box || tries > 20) return Promise.resolve({ box, btn });
      return new Promise(r => setTimeout(() => r(waitForSearchUi(tries + 1)), 400));
    }

    function searchThenGrab() {
      if (!want) {
        savePending(pending.slice(1));
        setTimeout(nextOrDone, 800);
        return;
      }
      waitForSearchUi(0).then(({ box, btn }) => {
        if (!box) {
          statusDiv.textContent = 'SDB search box missing — retry';
          setTimeout(() => { window.location.href = '/safetydeposit.phtml'; }, 1600);
          return;
        }
        ensureEntireSdb();
        box.focus();
        setVueValue(box, '');
        setVueValue(box, want);
        let clicked = false;
        if (btn) { try { btn.click(); clicked = true; } catch (_) {} }
        if (!clicked) {
          try { box.form && box.form.requestSubmit ? box.form.requestSubmit() : box.form && box.form.submit(); } catch (_) {}
          box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        }
        statusDiv.textContent = 'Searching ' + want;
        let n = 0;
        const iv = setInterval(() => {
          n++;
          if (n < 4) return;
          const row = exactRow();
          if (row) {
            clearInterval(iv);
            statusDiv.textContent = 'Withdrawing ' + want + ' x' + needQty;
            withdrawRow(row);
            return;
          }
          if (n >= 6 && sdbEmpty()) {
            clearInterval(iv);
            statusDiv.textContent = want + ' not in SDB — will retry after pay';
            let missed = [];
            try { missed = JSON.parse(localStorage.getItem('darthy_train_sdb_missed') || '[]') || []; } catch (_) {}
            missed.push({ name: want, qty: needQty });
            localStorage.setItem('darthy_train_sdb_missed', JSON.stringify(missed));
            savePending(pending.slice(1));
            setTimeout(nextOrDone, 1400);
            return;
          }
          if (n > 36) {
            clearInterval(iv);
            statusDiv.textContent = want + ' search slow — retry same stone';
            setTimeout(() => { window.location.href = '/safetydeposit.phtml'; }, 1400);
          }
        }, 450);
      });
    }

    setTimeout(searchThenGrab, 1200);
  }

  // ========== Notification System ==========
  let panel = null, bell = null, bellBadge = null;

  function createBellAndPanel() {
    if (document.getElementById('neo-bell') && panel) return;

    const cookieBanner = document.getElementById('fc-bd-header');
    let top = 110;
    if (cookieBanner) {
      top = cookieBanner.getBoundingClientRect().bottom + window.scrollY + 10;
    } else {
      const header = document.querySelector('#header, header, .header, table[bgcolor="#000080"]');
      if (header) top = header.getBoundingClientRect().bottom + window.scrollY + 8;
    }

    if (!document.getElementById('neo-bell')) {
      bell = document.createElement('div');
      bell.id = 'neo-bell';
      bell.style.cssText = `position:fixed;top:${top}px;right:20px;width:54px;height:54px;background:#4a90e2;color:white;border-radius:50%;font-size:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:99999;box-shadow:0 4px 15px rgba(0,0,0,0.3);`;
      bell.innerHTML = '🛎️';
      bellBadge = document.createElement('span');
      bellBadge.id = 'neo-bell-badge';
      bellBadge.style.cssText = `position:absolute;top:-2px;right:-2px;background:#e74c3c;color:white;font-size:11px;font-weight:bold;padding:1px 6px;border-radius:10px;min-width:16px;text-align:center;display:none;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
      bell.appendChild(bellBadge);
      document.body.appendChild(bell);
      bell.onclick = () => (panel && panel.style.display === 'block') ? panel.style.display = 'none' : showNotificationPanel();
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.style.cssText = `display:none;position:fixed;top:${top + 70}px;right:20px;width:340px;max-height:75vh;overflow:auto;background:#fff;border:3px solid #4a90e2;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:100000;padding:12px;font-family:Verdana,sans-serif;`;
      document.body.appendChild(panel);
    }
  }

  function updateBellBadge() {
    if (!bellBadge) return;
    const completed = loadCompleted();
    const native = scanNativeAlerts();
    const rem = getVisibleReminders();
    const total = completed.length + native.current.length + rem.length + guildNoticesLoad().length;
    if (total > 0) {
      bellBadge.textContent = total > 9 ? '9+' : total;
      bellBadge.style.display = 'inline-block';
    } else {
      bellBadge.style.display = 'none';
    }
  }

  // ---------- 1.8.50: Guild Stats notices (frozen pets) ----------
  // Written by guild-stats.js when a pet lookup says the pet is frozen. Stays until you clear it.
  //  Confirm = clear the notice, the pet stays blacklisted (Guild Stats keeps skipping it).
  //  Close   = clear the notice and take the pet off the blacklist (it was a mistake / accidental),
  //            so Guild Stats looks it up again on a later run.
  const GUILD_NOTICE_KEY = 'darthy_guild_notices';
  const GUILD_BLACKLIST_KEY = 'darthy_guild_blacklist';
  function gnGet(k) {
    try {
      const g = (typeof GM_getValue === 'function') ? GM_getValue(k, undefined) : undefined;
      if (Array.isArray(g)) return g;
    } catch (_) {}
    try { const raw = localStorage.getItem('dp_' + k); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  function gnSet(k, v) {
    try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (_) {}
    try { localStorage.setItem('dp_' + k, JSON.stringify(v)); } catch (_) {}
  }
  function guildNoticesLoad() {
    return gnGet(GUILD_NOTICE_KEY).filter(n => n && n.id && n.name);
  }
  function gnEsc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function guildNoticeClear(id, unblacklist) {
    const all = guildNoticesLoad();
    const n = all.find(x => x.id === id);
    gnSet(GUILD_NOTICE_KEY, all.filter(x => x.id !== id));
    if (n && unblacklist) {
      const k = String(n.name).toLowerCase();
      gnSet(GUILD_BLACKLIST_KEY, gnGet(GUILD_BLACKLIST_KEY).filter(b => !(b && String(b.name).toLowerCase() === k)));
    }
  }
  function guildNoticeRowsHtml() {
    const list = guildNoticesLoad();
    if (!list.length) return '';
    let h = `<div style="font-weight:bold;color:#2b7bb9;margin:4px 0 6px;font-size:13px;">🧊 Guild Stats</div>`;
    list.forEach(n => {
      const when = n.at ? new Date(n.at).toLocaleString() : '';
      h += `
        <div class="darthy-gn-row" data-gn-row="${gnEsc(n.id)}" style="padding:10px;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:flex-start;">
          <img src="https://pets.neopets.com/cpn/${encodeURIComponent(n.name)}/1/4.png" width="40" height="40" alt="" style="width:40px;height:40px;border-radius:6px;flex-shrink:0;border:2.5px solid #5dade2;box-sizing:border-box;background:#fff;">
          <div style="flex:1;font-size:13px;">
            <div style="font-weight:bold;color:#333;">${gnEsc(n.name)} is frozen</div>
            <div style="color:#555;margin:2px 0;">Its pet page says it is frozen, so Guild Stats skipped it and won't look it up again. Confirm to keep it skipped, or Close if this was a mistake.</div>
            <div style="color:#999;font-size:11px;">${gnEsc(when)}</div>
            <div style="margin-top:6px;display:flex;gap:6px;">
              <button data-gn-confirm="${gnEsc(n.id)}" style="flex:1;background:#27ae60;color:#fff;border:none;padding:5px 0;border-radius:5px;font-size:12px;cursor:pointer;">Confirm</button>
              <button data-gn-close="${gnEsc(n.id)}" style="flex:1;background:#95a5a6;color:#fff;border:none;padding:5px 0;border-radius:5px;font-size:12px;cursor:pointer;">Close</button>
            </div>
          </div>
        </div>`;
    });
    return `<div style="margin-bottom:10px;">${h}</div>`;
  }
  window.darthyRefreshNotices = function () {
    try { updateBellBadge(); } catch (_) {}
    try { if (panel && panel.style.display === 'block') showNotificationPanel(); } catch (_) {}
  };

  // ---------- Reminders (NST) ----------
  const REM_KEY = 'darthy_reminders';
  const REM_DISMISS_KEY = 'darthy_reminder_dismissed';
  const REM_ICON = 'https://images.neopets.com/items/boo_spellingbeginners.gif';
  const REM_SCROLL = 'https://images.neopets.com/neoboards/smilies/scroll.gif';
  const remOpenedDue = {};

  function remLoad() {
    try {
      const g = (typeof GM_getValue === 'function') ? GM_getValue(REM_KEY, null) : null;
      if (Array.isArray(g)) return g;
      const raw = localStorage.getItem('dp_' + REM_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }
  function remSave(list) {
    try { if (typeof GM_setValue === 'function') GM_setValue(REM_KEY, list); } catch (_) {}
    try { localStorage.setItem('dp_' + REM_KEY, JSON.stringify(list)); } catch (_) {}
  }
  function remDismissed() {
    try { return JSON.parse(localStorage.getItem(REM_DISMISS_KEY) || '{}'); } catch (_) { return {}; }
  }
  function remSetDismissed(map) {
    try { localStorage.setItem(REM_DISMISS_KEY, JSON.stringify(map)); } catch (_) {}
  }
  function nstNow() {
    // 1.8.27: real NST wall clock via Intl (handles PDT, UTC-7, Mar–Nov); old fixed UTC-8 kept as fallback.
    try {
      const o = {};
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
        .formatToParts(new Date()).forEach(p => { o[p.type] = p.value; });
      const d = new Date(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
      if (!isNaN(d.getTime())) return d;
    } catch (_) {}
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc - 8 * 60 * 60 * 1000);
  }
  function nstDateStr(d) {
    d = d || nstNow();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtNst(h, m) { return pad2(h) + ':' + pad2(m) + ' NST'; }

  function getVisibleReminders() {
    const list = remLoad();
    const now = nstNow();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = nstDateStr(now);
    const dismissed = remDismissed();
    const out = [];
    list.forEach(r => {
      if (!r || !r.title) return;
      const tMin = (parseInt(r.hour, 10) || 0) * 60 + (parseInt(r.minute, 10) || 0);
      const slot = today + '|' + r.id;
      if (dismissed[slot]) return;
      let delta = nowMin - tMin; // minutes after target (negative = before)
      // wrap-aware distance to target
      let until = tMin - nowMin;
      if (until > 12 * 60) until -= 24 * 60;
      if (until < -12 * 60) until += 24 * 60;
      if (until > 0 && until <= 60) {
        out.push({ ...r, kind: 'soon', untilMin: until, untilSec: until * 60 - now.getSeconds() });
      } else if (until <= 0 && until > -60) {
        out.push({ ...r, kind: 'due', lateMin: -until });
      }
    });
    return out;
  }

  function dismissVisibleReminders() {
    const vis = getVisibleReminders();
    const today = nstDateStr();
    const dismissed = remDismissed();
    const list = remLoad();
    vis.forEach(v => {
      dismissed[today + '|' + v.id] = 1;
      if (v.kind === 'due' && !v.permanent) {
        const rec = list.find(x => x.id === v.id);
        if (rec) {
          rec.times = Math.max(0, (parseInt(rec.times, 10) || 1) - 1);
          rec.lastFired = today;
        }
      }
    });
    remSave(list.filter(r => r.permanent || (parseInt(r.times, 10) || 0) > 0));
    remSetDismissed(dismissed);
  }

  function reminderRowsHtml() {
    const vis = getVisibleReminders();
    if (!vis.length) return '';
    let html = '';
    vis.forEach(r => {
      const border = r.kind === 'due' ? '#e74c3c' : '#27ae60';
      const label = r.kind === 'due' ? 'Reminder' : 'Upcoming reminder';
      let extra;
      if (r.kind === 'soon') {
        const mins = Math.max(0, r.untilMin);
        extra = `<div class="darthy-rem-cd" data-target="${(parseInt(r.hour,10)||0)*60+(parseInt(r.minute,10)||0)}" style="color:#27ae60;font-weight:bold;font-size:12px;">${mins} min until ${fmtNst(r.hour, r.minute)}</div>`;
      } else {
        extra = `<div style="color:#e74c3c;font-size:11px;">Due at ${fmtNst(r.hour, r.minute)}</div>`;
      }
      html += `
        <div style="padding:10px;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:flex-start;">
          <img src="${REM_ICON}" width="40" height="40" alt="" style="width:40px;height:40px;border-radius:6px;flex-shrink:0;object-fit:contain;background:#fff;border:2.5px solid ${border};box-sizing:border-box;">
          <div style="flex:1;font-size:13px;">
            <div style="font-weight:bold;color:#333;">${label}</div>
            <div style="color:#555;margin:2px 0;">${escapeRem(r.title)}</div>
            ${extra}
          </div>
        </div>`;
    });
    return html;
  }

  function escapeRem(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function tickReminderCountdowns() {
    if (!panel || panel.style.display !== 'block') return;
    const now = nstNow();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    panel.querySelectorAll('.darthy-rem-cd').forEach(el => {
      const tMin = parseInt(el.getAttribute('data-target'), 10) || 0;
      let until = tMin - nowMin;
      if (until < 0) until += 24 * 60;
      const h = Math.floor(until / 60);
      const m = until % 60;
      el.textContent = (h > 0 ? h + 'h ' : '') + m + ' min until ' + pad2(Math.floor(tMin / 60)) + ':' + pad2(tMin % 60) + ' NST';
    });
  }

  function checkReminders() {
    const vis = getVisibleReminders();
    const today = nstDateStr();
    const newDue = vis.filter(v => v.kind === 'due' && !remOpenedDue[v.id + '|' + today]);
    if (newDue.length) {
      newDue.forEach(v => { remOpenedDue[v.id + '|' + today] = true; });
      showNotificationPanel(true);
    } else {
      updateBellBadge();
      tickReminderCountdowns();
    }
  }

  function openReminderSettings() {
    let modal = document.getElementById('darthy-rem-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'darthy-rem-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100050;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:70px 12px 20px;';
    modal.innerHTML = reminderSettingsHtml();
    document.body.appendChild(modal);
    bindReminderSettings(modal);
  }

  function reminderSettingsHtml(editId) {
    const list = remLoad();
    const edit = editId ? list.find(r => r.id === editId) : null;
    const rows = list.map(r => {
      const when = fmtNst(r.hour, r.minute);
      const times = r.permanent ? 'Permanent' : ((parseInt(r.times, 10) || 1) + '×');
      return `<div style="display:flex;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid #eee;font-size:12px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:bold;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeRem(r.title)}</div>
          <div style="color:#888;font-size:11px;">${when} · ${times}</div>
        </div>
        <button data-edit="${r.id}" style="background:#16a34a;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer;font-weight:bold;">Edit</button>
        <button data-del="${r.id}" style="background:#dc2626;color:#fff;border:none;border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer;font-weight:bold;">Delete</button>
      </div>`;
    }).join('') || '<div style="color:#888;font-size:12px;padding:8px 0;">No reminders yet.</div>';
    return `<div style="width:340px;max-width:100%;background:#fff;border:3px solid #4a90e2;border-radius:12px;padding:14px;font-family:Verdana,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);max-height:80vh;overflow:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-weight:bold;color:#4a90e2;font-size:15px;">Reminders</div>
        <button id="darthy-rem-x" style="border:none;background:none;font-size:18px;cursor:pointer;color:#888;">✕</button>
      </div>
      <div style="font-size:11px;color:#666;margin-bottom:8px;">Times use Neopets Standard Time (NST).</div>
      <input id="rem-title" placeholder="Title" value="${edit ? escapeRem(edit.title) : ''}" style="width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #ccc;border-radius:6px;margin-bottom:8px;font-size:13px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:13px;">
        <span>Time NST</span>
        <input id="rem-hour" type="number" min="0" max="23" value="${edit ? edit.hour : 12}" style="width:56px;padding:6px;border:1px solid #ccc;border-radius:6px;">
        <span>:</span>
        <input id="rem-min" type="number" min="0" max="59" value="${edit ? edit.minute : 0}" style="width:56px;padding:6px;border:1px solid #ccc;border-radius:6px;">
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:13px;">
        <span>Times</span>
        <input id="rem-times" type="number" min="1" max="999" value="${edit && !edit.permanent ? (edit.times || 1) : 1}" style="width:64px;padding:6px;border:1px solid #ccc;border-radius:6px;">
      </div>
      <label style="display:flex;gap:6px;align-items:center;font-size:12px;margin-bottom:10px;cursor:pointer;">
        <input id="rem-perm" type="checkbox" ${edit && edit.permanent ? 'checked' : ''}> Permanent reminder
      </label>
      <input type="hidden" id="rem-edit-id" value="${edit ? edit.id : ''}">
      <button id="rem-save" style="width:100%;background:#4a90e2;color:#fff;border:none;padding:8px;border-radius:6px;font-weight:bold;cursor:pointer;margin-bottom:10px;">${edit ? 'Save reminder' : 'Add reminder'}</button>
      <div style="font-weight:bold;color:#4a90e2;font-size:13px;margin:6px 0;">All reminders</div>
      <div id="rem-list" style="max-height:220px;overflow:auto;">${rows}</div>
    </div>`;
  }

  function bindReminderSettings(modal) {
    const close = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#darthy-rem-x').onclick = close;
    modal.querySelector('#rem-save').onclick = () => {
      const title = (modal.querySelector('#rem-title').value || '').trim();
      if (!title) return alert('Enter a title.');
      let hour = Math.max(0, Math.min(23, parseInt(modal.querySelector('#rem-hour').value, 10) || 0));
      let minute = Math.max(0, Math.min(59, parseInt(modal.querySelector('#rem-min').value, 10) || 0));
      const permanent = !!modal.querySelector('#rem-perm').checked;
      const times = permanent ? 0 : Math.max(1, parseInt(modal.querySelector('#rem-times').value, 10) || 1);
      const editId = modal.querySelector('#rem-edit-id').value;
      const list = remLoad();
      if (editId) {
        const rec = list.find(r => r.id === editId);
        if (rec) Object.assign(rec, { title, hour, minute, times, permanent });
      } else {
        list.push({ id: 'r' + Date.now().toString(36), title, hour, minute, times, permanent });
      }
      remSave(list);
      modal.innerHTML = reminderSettingsHtml();
      bindReminderSettings(modal);
      updateBellBadge();
    };
    modal.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => {
        modal.innerHTML = reminderSettingsHtml(btn.getAttribute('data-edit'));
        bindReminderSettings(modal);
      };
    });
    modal.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => {
        remSave(remLoad().filter(r => r.id !== btn.getAttribute('data-del')));
        modal.innerHTML = reminderSettingsHtml();
        bindReminderSettings(modal);
        updateBellBadge();
      };
    });
  }

  window.showNotificationPanel = function (autoOpen = false) {
    createBellAndPanel();
    if (!panel) return;

    const active = loadActive();
    const completed = loadCompleted();
    const native = scanNativeAlerts();

    const remHtml = reminderRowsHtml();
    const gnHtml = guildNoticeRowsHtml();   // 1.8.50

    let html = `<h3 style="margin:0 0 12px;color:#4a90e2;font-size:15px;border-bottom:1px solid #eee;padding-bottom:8px;display:flex;align-items:center;gap:8px;">
      <span style="flex:1;">Notification Prime</span>
      <img id="darthy-rem-btn" src="${REM_SCROLL}" width="22" height="22" title="Reminders" alt="Reminders" style="width:22px;height:22px;cursor:pointer;flex-shrink:0;">
      <button id="neo-panel-close" style="font-size:18px;border:none;background:none;cursor:pointer;color:#888;">✕</button>
    </h3>`;
    if (remHtml) html += remHtml;
    if (gnHtml) html += gnHtml;

    if (native.current.length > 0) {
      html += `<div style="margin-bottom:10px;">`;
      native.current.forEach(alert => {
        let iconHtml;
        if (alert.alertIcon) {
          if (alert.alertBorder === 'half-rg') {
            // Half red / half green border via gradient frame
            iconHtml = `<div style="width:40px;height:40px;flex-shrink:0;border-radius:6px;padding:2.5px;background:linear-gradient(to right, #e74c3c 50%, #27ae60 50%);box-sizing:border-box;">
              <img src="${alert.alertIcon}" width="35" height="35" alt="" style="width:100%;height:100%;border-radius:4px;object-fit:contain;background:#fff;display:block;">
            </div>`;
          } else {
            const borderCss = alert.alertBorder
              ? `border:2.5px solid ${alert.alertBorder};`
              : 'border:2.5px solid transparent;';
            iconHtml = `<img src="${alert.alertIcon}" width="40" height="40" alt="" style="width:40px;height:40px;border-radius:6px;flex-shrink:0;object-fit:contain;background:#fff;${borderCss}box-sizing:border-box;">`;
          }
        } else if (alert.imgSrc) {
          const src = alert.imgSrc.startsWith('//') ? 'https:' + alert.imgSrc : alert.imgSrc;
          iconHtml = `<img src="${src}" width="40" height="40" alt="" style="width:40px;height:40px;border-radius:6px;flex-shrink:0;object-fit:contain;background:#f0f0f0;">`;
        } else {
          iconHtml = `<div style="width:40px;height:40px;background:#f0f0f0;border-radius:6px;flex-shrink:0;"></div>`;
        }

        html += `
        <div onclick="window.location='${alert.url}'" style="cursor:pointer;padding:10px;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:flex-start;">
          ${iconHtml}
          <div style="flex:1;font-size:13px;">
            <div style="font-weight:bold;color:#333;">${alert.type}</div>
            <div style="color:#555;margin:2px 0;">${alert.message}</div>
            <div style="color:#999;font-size:11px;">${alert.time}</div>
          </div>
        </div>`;
      });
      html += `</div>`;
    }

    if (completed.length) {
      html += `<div style="font-weight:bold;color:#e74c3c;margin:8px 0 6px;font-size:13px;">✅ Training Completed</div>`;
      completed.forEach(c => {
        html += `
        <div onclick="window.location='${c.statusUrl}'" style="cursor:pointer;padding:10px;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:center;">
          <img src="https://pets.neopets.com/cpn/${c.petName}/1/4.png" width="40" height="40" style="border-radius:6px;flex-shrink:0;border:2.5px solid #e74c3c;box-sizing:border-box;background:#fff;">
          <div style="flex:1;font-size:13px;">
            <div style="font-weight:bold;color:#333;">${c.petName}</div>
            <div style="color:#555;">${c.skill} • ${NICE_SCHOOL[c.school] || c.schoolName}</div>
            <div style="color:#999;font-size:11px;">Just now</div>
          </div>
        </div>`;
      });
    }

    if (Object.keys(active).length) {
      html += `<div style="font-weight:bold;color:#27ae60;margin:10px 0 6px;font-size:13px;">⏳ Currently Training</div>`;
      Object.keys(active).forEach(p => {
        const t = active[p];
        const minLeft = Math.max(0, Math.floor((t.endTime - Date.now()) / 60000));
        html += `
        <div style="padding:10px;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:center;">
          <img src="https://pets.neopets.com/cpn/${p}/1/4.png" width="40" height="40" style="border-radius:6px;flex-shrink:0;border:2.5px solid #27ae60;box-sizing:border-box;background:#fff;">
          <div style="flex:1;font-size:13px;">
            <div style="font-weight:bold;color:#333;">${p}</div>
            <div style="color:#555;">${t.skill} • ${NICE_SCHOOL[t.school] || t.schoolName}</div>
            <div style="color:#27ae60;font-weight:bold;font-size:12px;">${minLeft} min left</div>
          </div>
        </div>`;
      });
    }

    if (!completed.length && Object.keys(active).length === 0 && native.current.length === 0 && !remHtml && !gnHtml) {
      html += `<p style="text-align:center;color:#888;padding:20px 0;font-size:13px;">No notifications right now.</p>`;
    }

    html += `<button id="clear-notifications-btn" style="margin-top:12px;width:100%;background:#e74c3c;color:white;border:none;padding:9px 0;border-radius:6px;font-size:13px;cursor:pointer;">Clear Notifications</button>`;

    panel.innerHTML = html;
    panel.style.display = 'block';
    updateBellBadge();

    const closeBtn = panel.querySelector('#neo-panel-close');
    if (closeBtn) {
      closeBtn.onclick = () => { panel.style.display = 'none'; };
    }
    const remBtn = panel.querySelector('#darthy-rem-btn');
    if (remBtn) remBtn.onclick = (e) => { e.stopPropagation(); openReminderSettings(); };

    // 1.8.50: Guild Stats frozen-pet notices
    panel.querySelectorAll('[data-gn-confirm]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); guildNoticeClear(btn.getAttribute('data-gn-confirm'), false); showNotificationPanel(); updateBellBadge(); };
    });
    panel.querySelectorAll('[data-gn-close]').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); guildNoticeClear(btn.getAttribute('data-gn-close'), true); showNotificationPanel(); updateBellBadge(); };
    });

    const clearBtn = panel.querySelector('#clear-notifications-btn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        guildNoticesLoad().forEach(n => guildNoticeClear(n.id, false));   // 1.8.50: same as Confirm
        localStorage.removeItem(LOCAL_COMPLETED);
        localStorage.removeItem(LOCAL_SEEN_ALERTS);
        dismissVisibleReminders();
        document.querySelectorAll('.alert-x').forEach((el, i) => setTimeout(() => el.click?.(), i * 80));
        setTimeout(() => {
          showNotificationPanel();
          updateBellBadge();
        }, 800);
      };
    }
  };

  function checkExpiredTrainings() {
    const active = loadActive();
    let completed = loadCompleted();
    let changed = false;

    Object.keys(active).forEach(pet => {
      if (Date.now() >= active[pet].endTime) {
        let muted = false;
        try {
          const mute = typeof GM_getValue === 'function' ? GM_getValue('darthy_train_mute', {}) : {};
          muted = !!(mute && mute[String(pet).toLowerCase()]);
        } catch (_) {}
        try {
          if (window.DarthyPrimeTrainAuto && window.DarthyPrimeTrainAuto.isActive && window.DarthyPrimeTrainAuto.isActive()) {
            muted = true;
          }
        } catch (_) {}
        if (!muted) {
          completed.unshift({
            petName: pet,
            skill: active[pet].skill || 'Course',
            school: active[pet].school,
            schoolName: active[pet].schoolName,
            statusUrl: active[pet].statusUrl,
            timestamp: Date.now()
          });
        }
        delete active[pet];
        changed = true;
      }
    });

    if (changed) {
      saveActive(active);
      saveCompleted(completed);
      updateBellBadge();
      let trainBusy = false;
      try {
        trainBusy = !!(window.DarthyPrimeTrainAuto && window.DarthyPrimeTrainAuto.isActive && window.DarthyPrimeTrainAuto.isActive());
      } catch (_) {}
      if (!trainBusy) showNotificationPanel(true);
    }
  }

  function startNativeAlertWatcher() {
    setInterval(() => {
      const result = scanNativeAlerts();
      if (result.newOnes.length > 0) updateBellBadge();
    }, 45000);
  }

  function handleStatusPage() {
    const cookieBanner = document.getElementById('fc-bd-header');
    const ui = document.createElement('div');
    ui.id = 'darthy-train-banner-host';
    ui.style.cssText = 'margin:8px 0;';
    ui.innerHTML = '';

    const target = document.querySelector('.content, #content') || document.body;
    if (cookieBanner && cookieBanner.nextElementSibling) {
      cookieBanner.parentNode.insertBefore(ui, cookieBanner.nextElementSibling);
    } else {
      target.prepend(ui);
    }

    waitForStatsThenRun(() => {
      parseVisibleStatusPage();
      if (!window.DarthyPrimeTrainAuto) {
        addSmartQuickButtons();
        addItemGrabberButton();
        handleCompleteCourseButtons();
        mountCompleteAllButton(ui);
        autoPayAfterWithdraw();
      }
      updateBellBadge();
    });
  }

  function mountCompleteAllButton(ui) {
    const finishedCount = document.querySelectorAll('input[type="submit"][value="Complete Course!"]').length;
    const existing = document.getElementById('darthy-complete-all-courses');
    if (finishedCount <= 0) {
      if (existing) existing.remove();
      return;
    }
    let completeAllBtn = existing;
    if (!completeAllBtn) {
      completeAllBtn = document.createElement('button');
      completeAllBtn.id = 'darthy-complete-all-courses';
      completeAllBtn.type = 'button';
      completeAllBtn.style.cssText = 'display:block;width:100%;box-sizing:border-box;background:#1565c0;color:white;border:none;padding:10px 16px;border-radius:8px;font-weight:bold;cursor:pointer;margin:0;';
      completeAllBtn.onclick = async () => {
        completeAllBtn.disabled = true;
        completeAllBtn.textContent = 'Completing...';
        await autoCompleteAllCourses();
        completeAllBtn.remove();
      };
    }
    completeAllBtn.textContent = 'Complete All Finished Courses (' + finishedCount + ')';
    let host = document.getElementById('darthy-train-topbar');
    if (!host) {
      host = document.createElement('div');
      host.id = 'darthy-train-topbar';
      const bell = document.getElementById('neo-bell');
      const panel = document.getElementById('neo-notify-panel') || document.getElementById('darthy-notify-panel');
      let top = 168;
      if (bell) top = Math.round(bell.getBoundingClientRect().bottom + window.scrollY + 8);
      else if (panel && panel.style.display === 'block') top = Math.round(panel.getBoundingClientRect().bottom + window.scrollY + 8);
      host.style.cssText = 'position:fixed;top:' + top + 'px;right:20px;width:340px;z-index:99998;';
      document.body.appendChild(host);
    }
    if (completeAllBtn.parentNode !== host) host.appendChild(completeAllBtn);
  }

  function waitForStatsThenRun(fn) {
    let done = false;
    const observer = new MutationObserver(() => {
      if (!done && document.querySelector('td[bgcolor="white"]')) {
        done = true;
        observer.disconnect();
        fn();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      if (!done) {
        observer.disconnect();
        if (document.querySelector('td[bgcolor="white"]')) fn();
      }
    }, 2200);
  }

  // Public init
  window.DarthyPrimeNotify = {
    parseVisibleStatusPage: parseVisibleStatusPage,
    addSmartQuickButtons: addSmartQuickButtons,
    queueRecommendedStart: queueRecommendedStart,
    addItemGrabberButton: addItemGrabberButton,
    launchGrabberForPet: launchGrabberForPet,
    handleCompleteCourseButtons: handleCompleteCourseButtons,
    autoCompleteAllCourses: autoCompleteAllCourses,
    autoPayAfterWithdraw: autoPayAfterWithdraw,
    mountCompleteAllButton: mountCompleteAllButton,
    quickStart: function (pet, course) { return window.quickStart(pet, course); },
    init: function () {
      setTimeout(() => {
        createBellAndPanel();
        updateBellBadge();
        let trainBusy = false;
        try {
          trainBusy = !!(window.DarthyPrimeTrainAuto && window.DarthyPrimeTrainAuto.isActive && window.DarthyPrimeTrainAuto.isActive());
        } catch (_) {}
        if (loadCompleted().length > 0 && !trainBusy) showNotificationPanel(true);
        setInterval(checkExpiredTrainings, 25000);
        checkExpiredTrainings();
        setInterval(checkReminders, 15000);
        checkReminders();
        handleAutoSDBWithdraw();
        startNativeAlertWatcher();

        if (location.search.includes('type=status') || document.body.innerText.includes('Course Status')) {
          handleStatusPage();
        } else if (!location.search && trainHandedOff() && (location.pathname.includes('training.phtml') || location.pathname.includes('academy.phtml') || location.pathname.includes('fight_training.phtml'))) {
          // 1.8.45: only redirect to the status tab while Training has a job from Prime
          location.replace(location.pathname + '?type=status');
        }

        console.log('%c✅ DarthyPrime Notification Prime v4.8.3', 'color:#e74c3c;font-weight:bold');
      }, 800);
    }
  };
})();
