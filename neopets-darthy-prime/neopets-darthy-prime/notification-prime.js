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
    const m = String(str).match(/(\d+)\s*hrs?,\s*(\d+)\s*minutes?,\s*(\d+)\s*seconds?/i);
    if (!m) return null;
    return timeToEnd(m[1], m[2], m[3]);
  }

  // Training Fortune Cookie strikes through the original time and shows the
  // discounted remaining time in a following <b>. Use the reduced time.
  function parseTrainingTime(blockText, element) {
    const html = (element && element.innerHTML) || '';
    const hasCookie = /strikethrough|<s[\s>]|<strike|<del[\s>]/i.test(html) ||
      /strikethrough|<s[\s>]|<strike|<del[\s>]/i.test(blockText || '');

    if (element) {
      const bolds = Array.from(element.querySelectorAll('b'));
      const reduced = bolds.filter(b => {
        const wrap = b.closest('.strikethrough, s, strike, del');
        return !wrap;
      });
      const pick = reduced.length ? reduced[reduced.length - 1] : null;
      const fromEl = parseTimeMatch(pick && pick.textContent);
      if (fromEl) return fromEl;
    }

    const re = /(\d+)\s*hrs?,\s*(\d+)\s*minutes?,\s*(\d+)\s*seconds?/gi;
    const all = [];
    let m;
    while ((m = re.exec(blockText || '')) !== null) all.push(m);
    if (!all.length) return null;
    const use = (hasCookie && all.length > 1) ? all[all.length - 1] : all[0];
    return timeToEnd(use[1], use[2], use[3]);
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
  // Blacklist lot ID for 6h; at 5h prompt to delete the alert so it can't double-count.
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

  function processInstantTradeProfits(alerts) {
    if (!alerts || !alerts.length) return;
    const lots = loadInstantLots();
    const now = Date.now();
    // prune expired
    Object.keys(lots).forEach(id => {
      if (now - (lots[id].ts || 0) > SIX_H) delete lots[id];
    });

    let added = 0;
    alerts.forEach(a => {
      const isInstant =
        a.alertKind === 'instant-sold' ||
        /purchased\s+lot\s+\d+\s+for/i.test(a.message || '') ||
        /viewlotsold/i.test(a.url || '');
      if (!isInstant) return;

      const parsed = parseInstantTradeMessage(a.message);
      if (!parsed) return;

      const existing = lots[parsed.lotId];
      if (existing) return; // blacklisted / already counted

      lots[parsed.lotId] = {
        amount: parsed.amount,
        ts: now,
        delId: a.id,
        message: a.message
      };

      // Add to shop profit via shared API if available
      if (window.DarthyPrimeShop && typeof window.DarthyPrimeShop.addProfit === 'function') {
        window.DarthyPrimeShop.addProfit(parsed.amount);
      } else {
        // Fallback storage key used by shop-profit
        try {
          const key = 'darthy_shop_profit_total';
          const cur = parseInt(localStorage.getItem(key) || '0', 10) || 0;
          // GM storage preferred
          if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
            const g = GM_getValue(key, 0) || 0;
            GM_setValue(key, g + parsed.amount);
          }
        } catch (_) {}
      }
      added += parsed.amount;
      console.log('%c[DarthyPrime] Instant trade profit +' + parsed.amount.toLocaleString() + ' NP (lot ' + parsed.lotId + ')', 'color:#4ade80;font-weight:bold');
    });

    saveInstantLots(lots);
    if (added > 0 && window.DarthyPrimeShop && typeof window.DarthyPrimeShop.refreshUI === 'function') {
      window.DarthyPrimeShop.refreshUI();
    }
    return added;
  }

  function checkInstantTradeDeletePrompts(alerts) {
    const lots = loadInstantLots();
    const now = Date.now();
    const due = [];

    Object.keys(lots).forEach(lotId => {
      const e = lots[lotId];
      if (!e || e.prompted) return;
      const age = now - (e.ts || 0);
      if (age < FIVE_H) return;
      // Still within 6h window and alert may still exist
      const stillThere = (alerts || []).some(a => a.id === e.delId || (a.message || '').includes('lot ' + lotId));
      if (!stillThere) {
        // Already gone – mark prompted so we don't nag
        e.prompted = true;
        return;
      }
      due.push({ lotId, ...e });
    });

    if (!due.length) {
      saveInstantLots(lots);
      return;
    }

    // Only prompt once per session for this set
    if (window.__darthyInstantPromptOpen) return;
    window.__darthyInstantPromptOpen = true;

    const names = due.map(d => 'lot ' + d.lotId + ' (' + (d.amount || 0).toLocaleString() + ' NP)').join('\\n');
    const msg = due.length === 1
      ? 'An instant trade notification is ~5 hours old:\\n' + names + '\\n\\nDelete it now so it cannot be counted twice if the page reloads?\\n\\n(OK = delete this alert)'
      : due.length + ' instant trade notifications are ~5 hours old:\\n' + names + '\\n\\nDelete them now so they cannot be counted twice?\\n\\n(OK = delete these alerts)';

    if (confirm(msg)) {
      due.forEach(d => {
        const el = document.querySelector('.alert-x[data-delid="' + d.delId + '"]');
        if (el) {
          try { el.click(); } catch (_) {}
        }
        if (lots[d.lotId]) lots[d.lotId].prompted = true;
      });
    } else {
      due.forEach(d => {
        if (lots[d.lotId]) lots[d.lotId].prompted = true;
      });
    }
    saveInstantLots(lots);
    setTimeout(() => { window.__darthyInstantPromptOpen = false; }, 2000);
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

  // When Clear Notifications is used, mark all pending lots as prompted (no 5h nag)
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
        endTime = Date.now();
      } else {
        endTime = parseTrainingTime(blockText, timeTd || statsTd || row?.nextElementSibling);
      }
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
  }

  function addSmartQuickButtons() {
    const activePets = Object.keys(loadActive());
    const school = getSchoolInfo();

    document.querySelectorAll('td[bgcolor="white"]').forEach(cell => {
      cell.querySelectorAll('div[style*="margin-top:6px"]').forEach(el => el.remove());
      const text = cell.textContent || '';
      if (!text.match(/Lvl\s*:/i) && !text.match(/\(Level\s*\d+\)/i)) return;

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

      if (activePets.includes(pet)) {
        const note = document.createElement('span');
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
      container.style.cssText = 'margin-top:6px;';

      const makeBtn = (course, letter) => {
        const isRec = course === recommended;
        const btn = document.createElement('a');
        btn.innerHTML = `[+ ${letter}]`;
        btn.style.cssText = `color:${isRec ? '#e74c3c' : '#27ae60'};font-weight:${isRec ? 'bold' : 'normal'};cursor:pointer;margin:0 4px;text-decoration:underline;`;
        btn.onclick = () => window.quickStart(pet, course);
        container.appendChild(btn);
      };

      makeBtn('Level', 'L');
      if (str < BATTLE_STAT_CAP) makeBtn('Strength', 'S');
      if (def < BATTLE_STAT_CAP) makeBtn('Defence', 'D');
      makeBtn('Endurance', 'E');

      if (str >= BATTLE_STAT_CAP && def >= BATTLE_STAT_CAP && maxHp >= hpCap) {
        const maxed = document.createElement('span');
        maxed.style = 'color:#e74c3c;font-size:12px;margin-left:6px;';
        maxed.textContent = '(maxed ✓)';
        container.appendChild(maxed);
      }
      cell.appendChild(container);
    });
  }

  window.quickStart = function(pet, course) {
    const school = getSchoolInfo();
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = school.processUrl;
    form.innerHTML = `
      <input type="hidden" name="type" value="start">
      <input type="hidden" name="course_type" value="${course}">
      <input type="hidden" name="pet_name" value="${pet}">
    `;
    document.body.appendChild(form);

    const banner = document.createElement('div');
    banner.style = 'position:fixed;top:20%;left:50%;transform:translate(-50%,-50%);background:#28a745;color:white;padding:20px 40px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.4);z-index:999999;font-size:18px;text-align:center;';
    banner.innerHTML = `✅ <b>Training started!</b><br>${pet} → ${course}`;
    document.body.appendChild(banner);

    setTimeout(() => form.submit(), 550);
  };

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

    banner.innerHTML = `✅ All courses completed!`;
    setTimeout(() => {
      banner.remove();
      updateBellBadge();
      if (panel && panel.style.display === 'block') showNotificationPanel();
    }, 1600);
  }

  function parseRequiredTrainingItems() {
    const items = [];
    document.querySelectorAll('td[width="250"]').forEach(td => {
      if (!td.textContent.includes('This course has not been paid for yet')) return;
      td.querySelectorAll('b').forEach(b => {
        const name = b.textContent.trim();
        if (!name || name.includes('click here') || name.includes('To cancel') || name.includes('Pay') || name.includes('Cancel')) return;
        if (name.includes('Codestone') || name.includes('Dubloon')) {
          items.push({ name, qty: 1 });
        }
      });
    });
    const merged = {};
    items.forEach(item => {
      if (merged[item.name]) merged[item.name].qty += item.qty;
      else merged[item.name] = { ...item };
    });
    return Object.values(merged);
  }

  function addItemGrabberButton() {
    const requiredItems = parseRequiredTrainingItems();
    if (requiredItems.length === 0) return;

    document.querySelectorAll('td[width="250"]').forEach(td => {
      if (!td.textContent.includes('This course has not been paid for yet') && !td.querySelector('input[value="Pay"]')) return;
      if (td.querySelector('.item-grabber-btn')) return;

      const payLink = td.querySelector('a[href*="type=pay"]') || td.querySelector('form[action*="pay"]');
      const payUrl = payLink ? (payLink.href || payLink.action) : null;

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'margin: 8px 0; text-align:center;';

      const btn = document.createElement('button');
      btn.className = 'item-grabber-btn';
      btn.style.cssText = 'background:#222;color:white;border:none;padding:6px 14px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12px;';
      btn.textContent = 'Item Grabber';

      btn.onclick = () => {
        if (payUrl) localStorage.setItem(LOCAL_PAY_URL, payUrl);
        localStorage.setItem(LOCAL_PENDING_WITHDRAW, JSON.stringify(requiredItems));
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

  function autoPayAfterWithdraw() {
    const payUrl = localStorage.getItem(LOCAL_PAY_URL);
    if (!payUrl) return;
    localStorage.removeItem(LOCAL_PAY_URL);
    const banner = document.createElement('div');
    banner.style = 'position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);background:#27ae60;color:white;padding:16px 28px;border-radius:10px;z-index:999999;font-size:16px;text-align:center;';
    banner.innerHTML = `✅ Items moved!<br>Starting course...`;
    document.body.appendChild(banner);
    setTimeout(() => window.location.href = payUrl, 1400);
  }

  function handleAutoSDBWithdraw() {
    if (!location.pathname.includes('safetydeposit.phtml')) return;
    const pending = JSON.parse(localStorage.getItem(LOCAL_PENDING_WITHDRAW) || '[]');
    if (pending.length === 0) return;

    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#2c5aa0;color:white;padding:12px 24px;border-radius:8px;z-index:999999;font-size:15px;';
    statusDiv.textContent = 'Withdrawing items from SDB...';
    document.body.appendChild(statusDiv);

    setTimeout(() => {
      const categorySelects = document.querySelectorAll('.sdb-select');
      if (categorySelects.length > 0) {
        const isDubloon = pending.some(i => i.name.toLowerCase().includes('dubloon'));
        categorySelects[0].value = isDubloon ? '3' : '2';
        categorySelects[0].dispatchEvent(new Event('change', { bubbles: true }));
      }

      setTimeout(() => {
        pending.forEach((req, index) => {
          setTimeout(() => {
            const rows = document.querySelectorAll('.sdb-table tbody tr');
            for (let row of rows) {
              const nameEl = row.querySelector('.sdb-item-name');
              if (nameEl && nameEl.textContent.trim() === req.name) {
                const input = row.querySelector('.np-stepper-input');
                if (input) {
                  input.value = Math.min(req.qty, parseInt(input.max) || req.qty);
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const checkbox = row.querySelector('.sdb-item-checkbox');
                if (checkbox && !checkbox.checked) {
                  checkbox.checked = true;
                  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
                break;
              }
            }
          }, index * 300);
        });

        setTimeout(() => {
          const actionSelect = document.querySelector('.sdb-drawer .sdb-action-select') || document.querySelector('.sdb-as-native');
          if (actionSelect) {
            actionSelect.value = 'inventory';
            actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }

          setTimeout(() => {
            const firstConfirm = document.querySelector('.sdb-drawer-confirm-btn');
            if (firstConfirm) firstConfirm.click();

            setTimeout(() => {
              const popupConfirm = document.querySelector('#sdb__popup .popup-footer__2020 button.np-button.button-green__2020');
              if (popupConfirm) popupConfirm.click();

              setTimeout(() => {
                localStorage.removeItem(LOCAL_PENDING_WITHDRAW);
                statusDiv.textContent = 'Done! Returning...';
                setTimeout(() => {
                  const returnUrl = localStorage.getItem(LOCAL_PAY_URL) || document.referrer || '/island/fight_training.phtml?type=status';
                  window.location.href = returnUrl;
                }, 1400);
              }, 1200);
            }, 900);
          }, 700);
        }, 1600);
      }, 1400);
    }, 900);
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
    const total = completed.length + native.current.length + rem.length;
    if (total > 0) {
      bellBadge.textContent = total > 9 ? '9+' : total;
      bellBadge.style.display = 'inline-block';
    } else {
      bellBadge.style.display = 'none';
    }
  }

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

    let html = `<h3 style="margin:0 0 12px;color:#4a90e2;font-size:15px;border-bottom:1px solid #eee;padding-bottom:8px;display:flex;align-items:center;gap:8px;">
      <span style="flex:1;">Notification Prime</span>
      <img id="darthy-rem-btn" src="${REM_SCROLL}" width="22" height="22" title="Reminders" alt="Reminders" style="width:22px;height:22px;cursor:pointer;flex-shrink:0;">
      <button id="neo-panel-close" style="font-size:18px;border:none;background:none;cursor:pointer;color:#888;">✕</button>
    </h3>`;
    if (remHtml) html += remHtml;

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

    if (!completed.length && Object.keys(active).length === 0 && native.current.length === 0 && !remHtml) {
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

    const clearBtn = panel.querySelector('#clear-notifications-btn');
    if (clearBtn) {
      clearBtn.onclick = () => {
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
        completed.unshift({
          petName: pet,
          skill: active[pet].skill || 'Course',
          school: active[pet].school,
          schoolName: active[pet].schoolName,
          statusUrl: active[pet].statusUrl,
          timestamp: Date.now()
        });
        delete active[pet];
        changed = true;
      }
    });

    if (changed) {
      saveActive(active);
      saveCompleted(completed);
      updateBellBadge();
      showNotificationPanel(true);
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
    ui.style.cssText = 'margin:8px 0;padding:10px 18px;background:linear-gradient(#e6f0ff,#d0e0ff);border:2px solid #4a90e2;border-radius:8px;text-align:center;color:#2c5aa0;font-weight:bold;font-size:14px;';
    ui.innerHTML = `Notification Prime - By Darthy <span style="font-weight:normal;font-size:11px;opacity:0.8;">(Darthy Prime)</span>`;

    const target = document.querySelector('.content, #content') || document.body;
    if (cookieBanner && cookieBanner.nextElementSibling) {
      cookieBanner.parentNode.insertBefore(ui, cookieBanner.nextElementSibling);
    } else {
      target.prepend(ui);
    }

    waitForStatsThenRun(() => {
      parseVisibleStatusPage();
      addSmartQuickButtons();
      addItemGrabberButton();
      handleCompleteCourseButtons();

      const finishedCount = document.querySelectorAll('input[type="submit"][value="Complete Course!"]').length;
      if (finishedCount > 0) {
        const completeAllBtn = document.createElement('button');
        completeAllBtn.style.cssText = 'margin:10px auto;display:block;background:#1565c0;color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer;';
        completeAllBtn.textContent = `Complete All Finished Courses (${finishedCount})`;
        completeAllBtn.onclick = async () => {
          completeAllBtn.disabled = true;
          completeAllBtn.textContent = 'Completing...';
          await autoCompleteAllCourses();
          completeAllBtn.remove();
        };
        ui.appendChild(completeAllBtn);
      }
      autoPayAfterWithdraw();
      updateBellBadge();
    });
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
    init: function () {
      setTimeout(() => {
        createBellAndPanel();
        updateBellBadge();
        if (loadCompleted().length > 0) showNotificationPanel(true);
        setInterval(checkExpiredTrainings, 25000);
        checkExpiredTrainings();
        setInterval(checkReminders, 15000);
        checkReminders();
        handleAutoSDBWithdraw();
        startNativeAlertWatcher();

        if (location.search.includes('type=status') || document.body.innerText.includes('Course Status')) {
          handleStatusPage();
        } else if (!location.search && (location.pathname.includes('training.phtml') || location.pathname.includes('academy.phtml') || location.pathname.includes('fight_training.phtml'))) {
          location.replace(location.pathname + '?type=status');
        }

        console.log('%c✅ DarthyPrime Notification Prime v4.8.3', 'color:#e74c3c;font-weight:bold');
      }, 800);
    }
  };
})();
