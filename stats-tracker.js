/**
 * Neopets Stats Tracker (Kitchen + Lab + more)
 * Ported from original userscript v1.15 – all logic preserved.
 * PET_NAME is now configurable via chrome.storage (key: darthy_pet_name)
 * Default remains "Darthenvy".
 */
(function () {
  'use strict';

  // Will be set after storage ready
  let PET_NAME = 'Darthenvy';
  let STORAGE_KEY, START_DATE_KEY, LOG_KEY, LOG_DATE_KEY;
  let stats = { level: 0, hp: 0, strength: 0, defence: 0 };
  const processedThisSession = new Set();

  const wordToNumber = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10
  };

  function parseAmount(str) {
    str = String(str).toLowerCase().trim();
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    return wordToNumber[str] || 0;
  }

  function getTodayLocal() {
    const d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function getDaysTracked() {
    let start = GM_getValue(START_DATE_KEY, null);
    if (!start) {
      start = getTodayLocal();
      GM_setValue(START_DATE_KEY, start);
    }
    const startDate = new Date(start + 'T00:00:00');
    const todayDate = new Date(getTodayLocal() + 'T00:00:00');
    return Math.max(1, Math.floor((todayDate - startDate) / 86400000) + 1);
  }

  // ---------- Daily Log ----------
  function getLog() {
    const today = getTodayLocal();
    const storedDate = GM_getValue(LOG_DATE_KEY, '');
    if (storedDate !== today) {
      GM_setValue(LOG_KEY, []);
      GM_setValue(LOG_DATE_KEY, today);
      return [];
    }
    return GM_getValue(LOG_KEY, []);
  }

  function stripLogPrefix(s) {
    return String(s || '')
      .replace(/^(KQ Prize|KQ|Kitchen|lab|Lab Ray|Lab|RE|Wheel|You get 1 Faerie Quest)\s*[:\u2014\-]+\s*/i, '')
      .trim();
  }

  function addToLog(message) {
    if (!message) return;
    const clean = stripLogPrefix(message.trim().replace(/\s+/g, ' '));
    if (!clean) return;

    if (typeof GM_appendLog === 'function') {
      GM_appendLog(LOG_KEY, LOG_DATE_KEY, getTodayLocal(), clean).then(() => updateDropdownStats()).catch(() => {});
      return;
    }
    const log = getLog();
    if (log.length && stripLogPrefix(log[log.length - 1]) === clean) return;
    log.push(clean);
    if (log.length > 120) log.shift();
    GM_setValue(LOG_KEY, log);
    GM_setValue(LOG_DATE_KEY, getTodayLocal());
    updateDropdownStats();
  }

  function saveStats() {
    GM_setValue(STORAGE_KEY, stats);
    updateDropdownStats();
    // Also notify popup / other contexts
    try {
      chrome.runtime.sendMessage({ type: 'stats-updated', pet: PET_NAME, stats }).catch(() => {});
    } catch (_) {}
  }

  function addStat(stat, amount) {
    if (!stats.hasOwnProperty(stat)) return;
    stats[stat] += amount;
    if (typeof GM_addStat === 'function') {
      GM_addStat(STORAGE_KEY, stat, amount).then((s) => {
        if (s && typeof s === 'object') stats = Object.assign({ level: 0, hp: 0, strength: 0, defence: 0 }, s);
        updateDropdownStats();
      }).catch(() => {});
    } else {
      saveStats();
    }
    console.log(`%c[DarthyPrime Stats] ${stat} ${amount > 0 ? '+' : ''}${amount} → now ${stats[stat]}`, 'color: #4ade80; font-weight: bold');
  }

  function normalizeStat(raw) {
    raw = raw.toLowerCase();
    if (raw.includes('hit') || raw.includes('health') || raw.includes('endurance') || raw === 'hp') return 'hp';
    if (raw.includes('strength') || raw.includes('attack')) return 'strength';
    if (raw.includes('defence') || raw.includes('defense')) return 'defence';
    if (raw.includes('level')) return 'level';
    return null; // movement / speed / agility ignored for totals
  }

  // ---------- Main smart scanner ----------
  /**
   * Get page text while completely excluding our own UI so we never
   * re-scan log lines / labels inside #neopets-stats-section or the
   * profile dropdown that contains it.
   */
  function getScannableText() {
    const excludeIds = ['neopets-stats-section', 'navprofiledropdown__2020', 'darthy-shop-profit-panel'];
    const excluded = [];

    // Temporarily hide excluded nodes so their text is not included
    excludeIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        excluded.push({ el, display: el.style.display });
        el.style.display = 'none';
      }
    });

    let text = '';
    try {
      text = document.body.innerText || document.body.textContent || '';
    } finally {
      // Restore
      excluded.forEach(({ el, display }) => {
        el.style.display = display;
      });
    }
    return text;
  }


  function popupIsOpen(el) {
    if (!el) return false;
    try {
      const st = window.getComputedStyle(el);
      if (!st || st.display === 'none' || st.visibility === 'hidden') return false;
      if (parseFloat(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 30 && r.height >= 30;
    } catch (_) {
      return !!(el.offsetWidth || el.offsetHeight);
    }
  }

  function collectUsePopups() {
    const found = new Set();
    const sels = [
      '#invResult',
      '.invResult',
      '.togglePopup__2020.invResult',
      '.togglePopup__2020.movePopup__2020',
      '#sdbResult',
      '.sdb-result',
      '#useResult',
      '.popup-body__2020',
      '.inv-result',
      '[id*="invResult"]'
    ];
    sels.forEach((s) => {
      document.querySelectorAll(s).forEach((el) => {
        const wrap = el.closest('#invResult, .invResult, .togglePopup__2020, .movePopup__2020, #sdbResult') || el;
        found.add(wrap);
      });
    });
    return Array.from(found).filter(popupIsOpen);
  }

  function extractUseGainLine(box, text) {
    const escaped = PET_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const gainRe = new RegExp(
      escaped + '\\s+(gains?|gained|loses?|lost)\\s+.{3,220}?(?:[.!]|$)',
      'i'
    );
    const m = text.match(gainRe);
    if (m) return m[0].replace(/\s+/g, ' ').trim();
    const anyRe = /((?:gains?|gained|loses?|lost)\s+.{3,220}?(?:[.!]|$))/i;
    const nodes = box.querySelectorAll('p, b, h3, .popup-body__2020, .popup-copy, span');
    for (const n of nodes) {
      const tt = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (gainRe.test(tt)) return tt.match(gainRe)[0].replace(/\s+/g, ' ').trim();
      if (anyRe.test(tt) && /hit\s*point|health|endurance|strength|defence|defense|level|movement|agility|speed/i.test(tt)) {
        return (PET_NAME + ' ' + tt.match(anyRe)[1]).replace(/\s+/g, ' ').trim();
      }
    }
    const any = text.match(anyRe);
    if (any && /hit\s*point|health|endurance|strength|defence|defense|level/i.test(any[1])) {
      return (PET_NAME + ' ' + any[1]).replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function processInvUse() {
    const boxes = collectUsePopups();
    if (!boxes.length) {
      [...processedThisSession].forEach((k) => {
        if (String(k).indexOf('invuse|') === 0) processedThisSession.delete(k);
      });
      return;
    }
    boxes.forEach((box) => {
      const text = (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 6) return;
      if (/you bought|you spent|has been added to your inventory/i.test(text) &&
          !/gains?|gained|increased|went up|loses?|lost/i.test(text)) return;
      if (!/gains?|gained|increased|went up|loses?|lost|looks stronger|feel stronger|hit\s*points?|strength|defence|defense/i.test(text)) return;

      let line = extractUseGainLine(box, text);
      if (!line) {
        line = text.replace(/Success!/ig, '').replace(/Close and Refresh/ig, '').trim().slice(0, 220);
      }
      if (!line) return;

      const key = 'invuse|' + line.toLowerCase();
      if (processedThisSession.has(key)) return;
      processedThisSession.add(key);

      addToLog(line);

      const pairRe = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(hit\s*points?|health|endurance|strength|defence|defense|levels?|movement(?:\s+points?)?|agility|speed)/gi;
      let pm;
      let found = false;
      while ((pm = pairRe.exec(line + ' ' + text)) !== null) {
        const amt = parseAmount(pm[1]);
        const stat = normalizeStat(pm[2]);
        if (stat && amt) {
          const lose = /loses?|lost/i.test(line + ' ' + text);
          addStat(stat, lose ? -amt : amt);
          found = true;
        }
      }
      if (!found && /increased|went up|looks stronger|feel stronger/i.test(text)) {
        if (/strength|attack/i.test(text)) addStat('strength', 1);
        if (/defence|defense/i.test(text)) addStat('defence', 1);
        if (/hit\s*point|health|endurance/i.test(text)) addStat('hp', 1);
        if (/\blevel/i.test(text)) addStat('level', 1);
      }
    });
  }


  function processWheelPrize() {
    const box = document.getElementById('popupRewardContent') || document.getElementById('responseDisplaySuccess');
    if (!box) return;
    const style = window.getComputedStyle ? window.getComputedStyle(box) : null;
    if (style && style.display === 'none') return;
    const nameEl = document.getElementById('itemName');
    const msgEl = document.getElementById('spinMessage');
    const name = (nameEl && nameEl.textContent || '').replace(/\s+/g, ' ').trim();
    const msg = (msgEl && msgEl.textContent || '').replace(/\s+/g, ' ').trim();
    const text = (name + ' ' + msg + ' ' + (box.innerText || '')).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return;
    const key = 'wheel|' + text.toLowerCase().slice(0, 180);
    if (processedThisSession.has(key)) return;
    processedThisSession.add(key);

    const npM = text.match(/([\d,]+)\s*NP\b/i);
    if (npM) {
      const amt = parseInt(npM[1].replace(/,/g, ''), 10);
      if (amt > 0 && window.DarthyPrimeShop && typeof window.DarthyPrimeShop.addProfit === 'function') {
        window.DarthyPrimeShop.addProfit(amt);
      }
      addToLog('+' + (amt ? amt.toLocaleString() : npM[1]) + ' NP');
      return;
    }

    const pairRe = /(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(hit\s*points?|health|endurance|strength|defence|defense|levels?|movement(?:\s+points?)?)/gi;
    const bits = [];
    let pm;
    while ((pm = pairRe.exec(text)) !== null) {
      const amt = parseAmount(pm[1]);
      const stat = normalizeStat(pm[2]);
      if (stat && amt) {
        addStat(stat, amt);
        const label = stat === 'hp' ? 'HP' : stat.charAt(0).toUpperCase() + stat.slice(1);
        bits.push('+' + amt + ' ' + label);
      }
    }
    if (bits.length) addToLog('' + bits.join(', '));
    else if (name) addToLog('' + name);
  }

  function scanPageForGains() {
    // Never scan while the user is interacting with our own UI
    const trackerUI = document.getElementById('neopets-stats-section');
    if (trackerUI && trackerUI.contains(document.activeElement)) return;
    processInvUse();
    processWheelPrize();

    const bodyText = getScannableText();
    if (!bodyText.toLowerCase().includes(PET_NAME.toLowerCase())) return;

    // Training school status pages only show live gains when a course just finished.
    // "Currently studying Strength" must NOT count as a strength gain on refresh.
    const onTrainingStatus =
      /training\.phtml|academy\.phtml|fight_training/i.test(location.href);
    if (onTrainingStatus) {
      const looksComplete = /now\s+has\s+increased|course\s+finished|congratulations|super\s+bonus|gained\s+an\s+additional/i.test(bodyText);
      if (!looksComplete) return;
    }

    const lower = bodyText.toLowerCase();

    // ========== Fixed Faerie Quest rewards ==========
    // ONLY on the Faerie Quests page (quests.phtml).
    // Random events elsewhere can mention faeries without granting stats.
    const isFaerieQuestPage =
      /\/quests\.phtml/i.test(location.pathname) ||
      location.href.toLowerCase().includes('quests.phtml');

    if (isFaerieQuestPage) {
      const rewardEl = document.querySelector('.reward_message');
      if (rewardEl) {
        const rtxt = (rewardEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (/for your efforts/i.test(rtxt)) {
          processedThisSession.add('fq-reward|' + rtxt.toLowerCase());
        }
      }

      // Fyora
      if (lower.includes('level, strength, and health have increased') && lower.includes('a lot')) {
        const key = 'fyora-alot';
        if (!processedThisSession.has(key)) {
          processedThisSession.add(key);
          addToLog('+2 Level, +5 HP, +5 Strength');
          addStat('level', 2);
          addStat('hp', 5);
          addStat('strength', 5);
        }
        return;
      }

      // Battle Faerie
      if (lower.includes('battle faerie') || (lower.includes('hit points') && lower.includes('strength') && lower.includes('defence') && lower.includes('increased'))) {
        if (lower.match(/hit points?.*strength.*defence|strength.*defence.*hit points?/i)) {
          const key = 'battle-faerie';
          if (!processedThisSession.has(key)) {
            processedThisSession.add(key);
            addToLog('+3 HP, +3 Strength, +3 Defence');
            addStat('hp', 3);
            addStat('strength', 3);
            addStat('defence', 3);
          }
        }
      }

      // Light Faerie (+2 Levels)
      if (lower.includes('light faerie') && lower.includes('level')) {
        const key = 'light-faerie';
        if (!processedThisSession.has(key) && /gains?|increased|levels?/i.test(lower)) {
          processedThisSession.add(key);
          addToLog('+2 Level');
          addStat('level', 2);
        }
      }

      // Fire Faerie (+3 Strength)
      if (lower.includes('fire faerie') && (lower.includes('strength') || lower.includes('attack'))) {
        const key = 'fire-faerie';
        if (!processedThisSession.has(key)) {
          processedThisSession.add(key);
          addToLog('+3 Strength');
          addStat('strength', 3);
        }
      }

      // Water Faerie (+3 Defence)
      if (lower.includes('water faerie') && (lower.includes('defence') || lower.includes('defense'))) {
        const key = 'water-faerie';
        if (!processedThisSession.has(key)) {
          processedThisSession.add(key);
          addToLog('+3 Defence');
          addStat('defence', 3);
        }
      }

      // Dark Faerie (+3 HP)
      if (lower.includes('dark faerie') && (lower.includes('hit point') || lower.includes('endurance') || lower.includes('health'))) {
        const key = 'dark-faerie';
        if (!processedThisSession.has(key)) {
          processedThisSession.add(key);
          addToLog('+3 HP');
          addStat('hp', 3);
        }
      }

      // Space Faerie (+5 Levels)
      if (lower.includes('space faerie') && lower.includes('level')) {
        const key = 'space-faerie';
        if (!processedThisSession.has(key)) {
          processedThisSession.add(key);
          addToLog('+5 Level');
          addStat('level', 5);
        }
      }
    }

    // ========== Common single-stat increases ==========
    const singleStatPatterns = [
      { regex: new RegExp(PET_NAME + "['’]?s?\\s+(defence|defense)\\s+has\\s+increased", 'i'), stat: 'defence', amount: 1 },
      { regex: new RegExp(PET_NAME + "['’]?s?\\s+strength\\s+has\\s+increased", 'i'), stat: 'strength', amount: 1 },
      { regex: new RegExp(PET_NAME + "['’]?s?\\s+(level)\\s+has\\s+increased", 'i'), stat: 'level', amount: 1 },
      { regex: new RegExp(PET_NAME + "['’]?s?\\s+(health|endurance|hit\\s*points?)\\s+has\\s+increased", 'i'), stat: 'hp', amount: 1 },
      { regex: new RegExp(PET_NAME + "['’]?s?\\s+(speed|movement|agility)\\s+has\\s+increased", 'i'), stat: null, amount: 0 }
    ];

    for (const p of singleStatPatterns) {
      if (p.regex.test(bodyText)) {
        const matchText = bodyText.match(p.regex)[0];
        // Stable key: only the matched phrase (body prefix changes every second with NST clock)
        const key = 'single|' + matchText.toLowerCase();
        if (processedThisSession.has(key)) continue;
        processedThisSession.add(key);

        if (isFaerieQuestPage) {
          if ([...processedThisSession].some(k => /^(fyora|battle|light|fire|water|dark|space)-/.test(String(k)))) continue;
          if (p.stat) addToLog('+' + (p.amount || 1) + ' ' + (p.stat === 'hp' ? 'HP' : p.stat.charAt(0).toUpperCase() + p.stat.slice(1)));
          else continue;
        } else {
          addToLog(matchText);
        }

        if (p.stat) {
          addStat(p.stat, p.amount || 1);
        }
      }
    }

    // ========== Numbered gains ==========
    const numberedRegex = new RegExp(
      PET_NAME + "['’]?s?\\s+gained\\s+(\\d+|one|two|three|four|five|six)\\s+(movement|hit\\s*points?|health|endurance|strength|defence|defense|levels?)(?:\\s+points?)?(?:\\s+and\\s+(\\d+|one|two|three|four|five|six)\\s+(movement|hit\\s*points?|health|endurance|strength|defence|defense|levels?))?",
      'gi'
    );

    let match;
    while ((match = numberedRegex.exec(bodyText)) !== null) {
      const key = match[0];
      if (processedThisSession.has(key)) continue;
      processedThisSession.add(key);

      if (isFaerieQuestPage) {
        if ([...processedThisSession].some(k => /^(fyora|battle|light|fire|water|dark|space)-/.test(String(k)))) continue;
      } else {
        addToLog(match[0]);
      }

      const amount1 = parseAmount(match[1]);
      const stat1 = normalizeStat(match[2]);
      if (stat1 && amount1) addStat(stat1, amount1);

      if (match[3] && match[4]) {
        const amount2 = parseAmount(match[3]);
        const stat2 = normalizeStat(match[4]);
        if (stat2 && amount2) addStat(stat2, amount2);
      }
    }

    // ========== Training School ==========
    // Only count real course completions. Status pages that say
    // "currently studying Strength" must not count as gains on refresh.
    const isTrainingSchoolPage =
      /training\.phtml|academy\.phtml|fight_training/i.test(location.href);

    const hasCourseCompletion =
      /now\s+has\s+increased|course\s+finished|congratulations|super\s+bonus|gained\s+an\s+additional/i.test(bodyText);

    if (!isTrainingSchoolPage || hasCourseCompletion) {
      const trainingRegex = new RegExp(
        PET_NAME + '\\s+now\\s+has\\s+increased\\s+(Level|Endurance|Strength|Defence|Defense|Hit\\s*Points?)[!]*',
        'i'
      );

      if (trainingRegex.test(bodyText)) {
        const m = bodyText.match(trainingRegex);
        // Stable key from the match itself (not body prefix — NST clock changes every second)
        const key = 'training|' + m[0].toLowerCase();
        if (!processedThisSession.has(key)) {
          processedThisSession.add(key);
          addToLog(m[0]);

          const stat = normalizeStat(m[1]);
          if (stat) {
            const bonusMatch = bodyText.match(/SUPER BONUS.*?went up\s+(\d+)\s+points/i);
            const amount = bonusMatch ? parseAmount(bonusMatch[1]) : 1;
            addStat(stat, amount);
          }
        }
      }

      // Classic "gains a level"
      if (new RegExp(PET_NAME + '\\s+gains?\\s+a\\s+level', 'i').test(bodyText)) {
        const key = 'gains-level|' + PET_NAME.toLowerCase();
        if (!processedThisSession.has(key)) {
          processedThisSession.add(key);
          addToLog(PET_NAME + ' gains a level!!');
          addStat('level', 1);
        }
      }
    }
  }

  // ---------- Kitchen ----------
  function isInsideOurUI(el) {
    if (!el) return false;
    return !!(el.closest('#neopets-stats-section') ||
              el.closest('#navprofiledropdown__2020') ||
              el.closest('#darthy-shop-profit-panel') ||
              el.closest('#neo-bell') ||
              el.closest('#darthy-prime-badge'));
  }

  function processKitchen() {
    // Kitchen gains only come from the Cooking Pot / Kitchen Quests pages — never training schools
    if (/training\.phtml|academy\.phtml|fight_training/i.test(location.href)) return;

    const boldTags = document.querySelectorAll('b');
    for (const b of boldTags) {
      if (isInsideOurUI(b)) continue;

      const text = b.textContent.trim();
      if (!text.toLowerCase().includes(PET_NAME.toLowerCase())) continue;
      if (!/(gained a level|hit point|health|endurance|attack|strength|defence|defense|agility|better at)/i.test(text)) continue;

      if (processedThisSession.has(text)) continue;

      addToLog(text);
      const lower = text.toLowerCase();

      if (lower.includes('gained a level')) addStat('level', 1);
      else if (lower.includes('hit point') || lower.includes('health') || lower.includes('endurance')) addStat('hp', 1);
      else if (lower.includes('attack') || lower.includes('strength') || lower.includes('better at attack')) addStat('strength', 1);
      else if (lower.includes('defence') || lower.includes('defense') || lower.includes('better at defence')) addStat('defence', 1);

      processedThisSession.add(text);
    }

    // Also log all Kitchen Quest prizes (items, NP, etc.) — not only stat lines
    if (!/kitchen|cooking/i.test(location.href + location.pathname)) return;

    const prizeSelectors = [
      '.prize', '.quest-prize', '.kitchen-prize',
      'td[bgcolor="#ffffcc"]', 'div.prize-text'
    ];
    // Scan paragraphs / bold near "receives" / "wins" / "you get"
    document.querySelectorAll('b, p, span, div').forEach(el => {
      if (isInsideOurUI(el)) return;
      if (el.children && el.children.length > 4) return; // skip huge containers
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 8 || text.length > 220) return;
      if (!new RegExp(PET_NAME, 'i').test(text) && !/you (?:receive|get|win|found)|kitchen quest|prize/i.test(text)) return;
      if (!/(receive[sd]?|wins?|gets?|found|prize|awarded|gives? you)/i.test(text)) return;
      // Skip pure navigation chrome
      if (/^home|^shop|^games/i.test(text)) return;
      // Skip Chef flavor text (not an actual prize line)
      if (/the chef waves his hands/i.test(text)) return;
      if (/faerie quest/i.test(text)) return;
      if (/you may collect your prize/i.test(text) && !/(receive|gets?|wins?|found|awarded)/i.test(text.replace(/you may collect your prize/i, ''))) return;

      const key = 'kitchen-prize|' + text.toLowerCase();
      if (processedThisSession.has(key)) return;
      processedThisSession.add(key);
      // Strip chef lead-in if it somehow got glued to a prize line
      const cleaned = text.replace(/The Chef waves his hands,? and you may collect your prize\.?\s*/gi, '').trim();
      if (!cleaned) return;
      addToLog(cleaned);
    });
  }

  // ---------- Lab ----------
  function processLab() {
    document.querySelectorAll('p.lab-result-outcome').forEach(outcome => {
      if (isInsideOurUI(outcome)) return;
      const text = outcome.textContent.replace(/\s+/g, ' ').trim();
      if (!text || processedThisSession.has(text)) return;

      const lower = text.toLowerCase();
      if (lower.includes('movement')) {
        addToLog(text);
        processedThisSession.add(text);
        return;
      }

      const match = text.match(/(?:he|she)\s+(gains|loses)\s+(\d+|one|two|three|four|five|six)\s+(?:maximum\s+)?(strength|defence|defense|hit\s*points?|health|endurance|levels?)/i);
      if (!match) {
        addToLog(text);
        processedThisSession.add(text);
        return;
      }

      const action = match[1].toLowerCase();
      const amount = parseAmount(match[2]);
      const stat = normalizeStat(match[3]);

      if (!stat || !amount) {
        processedThisSession.add(text);
        return;
      }

      const delta = action === 'gains' ? amount : -amount;
      addStat(stat, delta);
      addToLog(PET_NAME + ' ' + action + ' ' + amount + ' ' + (stat === 'hp' ? 'hit points' : stat));
      processedThisSession.add(text);
    });
  }

  // ---------- UI ----------
  function injectIntoDropdown() {
    const dropdown = document.getElementById('navprofiledropdown__2020');
    if (!dropdown || document.getElementById('neopets-stats-section')) return false;

    const ul = dropdown.querySelector('ul');
    const signOutLink = ul ? ul.querySelector('a[href="/logout.phtml"]') : null;
    if (!signOutLink) return false;

    const section = document.createElement('div');
    section.id = 'neopets-stats-section';
    section.innerHTML = `
      <div style="border-top:1px solid #4a4a6a;margin:10px 12px 6px;"></div>
      <div class="nav-profile-dropdown-text" style="padding:4px 12px 10px;line-height:1.5;">
        <div id="darthy-drop-stats-h" style="font-weight:bold;color:#7dd3fc;margin-bottom:5px;cursor:pointer;user-select:none;">Stats Tracker · ${PET_NAME} <span class="darthy-caret">▾</span></div>
        <div id="darthy-drop-stats-b">
          <div>Level: <span id="stat-level">0</span></div>
          <div>HP: <span id="stat-hp">0</span></div>
          <div>Strength: <span id="stat-strength">0</span></div>
          <div>Defence: <span id="stat-defence">0</span></div>
          <div style="margin-top:6px;color:#7dd3fc;font-size:12px;" id="stat-days">Tracking for 1 Day</div>
          <div style="margin-top:8px;"><a href="javascript:void(0)" id="reset-stats-btn" style="color:#f87171;font-size:11px;">Reset Totals</a></div>
        </div>
        <div id="shop-profit-anchor"></div>
        <div style="border-top:1px solid #4a4a6a;margin:12px 0 8px;"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
          <div id="darthy-drop-log-h" style="font-weight:bold;color:#7dd3fc;font-size:12px;cursor:pointer;user-select:none;">Today's Log <span class="darthy-caret">▾</span></div>
          <a href="javascript:void(0)" id="copy-log-btn" style="color:#7dd3fc;font-size:11px;white-space:nowrap;">Copy Log</a>
        </div>
        <div id="darthy-drop-log-b">
          <div id="stats-log" style="max-height:80px;overflow-y:auto;font-size:11px;line-height:1.4;color:#d1d5db;white-space:pre-wrap;margin-bottom:2px;background:rgba(0,0,0,0.25);padding:6px 8px;border-radius:4px;"></div>
        </div>
      </div>`;

    signOutLink.parentNode.insertBefore(section, signOutLink.nextSibling);

    document.getElementById('reset-stats-btn').addEventListener('click', e => {
      e.preventDefault();
      if (confirm(`Reset all tracked stats for ${PET_NAME}?\n\nThis will also reset the day counter to 1 Day.`)) {
        stats = { level: 0, hp: 0, strength: 0, defence: 0 };
        GM_setValue(START_DATE_KEY, getTodayLocal());
        processedThisSession.clear();
        saveStats();
      }
    });

    document.getElementById('copy-log-btn').addEventListener('click', e => {
      e.preventDefault();
      const log = getLog();
      if (!log.length) return alert('Log is empty today.');
      navigator.clipboard.writeText(log.map(stripLogPrefix).filter(Boolean).join('\n')).then(() => {
        const btn = document.getElementById('copy-log-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy Log', 1500);
      });
    });

    bindDrop('darthy-drop-stats', 'dp_drop_stats');
    bindDrop('darthy-drop-log', 'dp_drop_log');
    updateDropdownStats();
    return true;
  }

  function dropOpen(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch (_) {}
    return fallback !== false;
  }
  function bindDrop(id, key) {
    const h = document.getElementById(id + '-h');
    const b = document.getElementById(id + '-b');
    if (!h || !b) return;
    const apply = (open) => {
      b.style.display = open ? 'block' : 'none';
      const c = h.querySelector('.darthy-caret');
      if (c) c.textContent = open ? '▾' : '▸';
    };
    apply(dropOpen(key, true));
    h.addEventListener('click', e => {
      e.preventDefault();
      const open = b.style.display === 'none';
      apply(open);
      try { localStorage.setItem(key, open ? '1' : '0'); } catch (_) {}
    });
  }

  function updateDropdownStats() {
    const fmt = n => n > 0 ? '+' + n : String(n);
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = fmt(val);
      el.style.color = val > 0 ? '#4ade80' : val < 0 ? '#f87171' : '#94a3b8';
    };

    set('stat-level', stats.level);
    set('stat-hp', stats.hp);
    set('stat-strength', stats.strength);
    set('stat-defence', stats.defence);

    const daysEl = document.getElementById('stat-days');
    if (daysEl) {
      const d = getDaysTracked();
      daysEl.textContent = `Tracking for ${d} Day${d === 1 ? '' : 's'}`;
    }

    const logEl = document.getElementById('stats-log');
    if (logEl) {
      const log = getLog();
      logEl.textContent = log.length ? log.map(stripLogPrefix).filter(Boolean).join('\n') : 'No gains yet today.';
      logEl.style.color = log.length ? '#d1d5db' : '#6b7280';
    }
  }

  // ---------- Watcher ----------
  function startWatching() {
    const url = location.href.toLowerCase();
    const interesting = url.includes('kitchen') || url.includes('lab') ||
                        url.includes('inventory') || url.includes('safetydeposit') ||
                        url.includes('scratch') || url.includes('training') ||
                        url.includes('academy') || url.includes('faerie') ||
                        url.includes('quests') || url.includes('home') || url.includes('quickref') ||
                        url.includes('petlookup') || url.includes('useobject') || url.includes('/pets') || url.includes('wheel');

    const observer = new MutationObserver(() => {
      processInvUse();
      processWheelPrize();
      if (!interesting) return;
      processKitchen();
      processLab();
      scanPageForGains();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    setInterval(() => {
      processInvUse();
      processWheelPrize();
      if (!interesting) return;
      processKitchen();
      processLab();
      scanPageForGains();
    }, 300);

    processInvUse();
    processWheelPrize();
    processKitchen();
    processLab();
    scanPageForGains();

    window.addEventListener('darthy-storage-changed', (ev) => {
      const ch = ev && ev.detail;
      if (!ch) return;
      if (STORAGE_KEY && ch[STORAGE_KEY] && ch[STORAGE_KEY].newValue && typeof ch[STORAGE_KEY].newValue === 'object') {
        stats = Object.assign({ level: 0, hp: 0, strength: 0, defence: 0 }, ch[STORAGE_KEY].newValue);
      }
      updateDropdownStats();
    });

    setInterval(() => {
      if (!STORAGE_KEY || typeof DarthyPrimeStorage === 'undefined' || !DarthyPrimeStorage.reload) return;
      DarthyPrimeStorage.reload().then(() => {
        const next = GM_getValue(STORAGE_KEY, null);
        if (next && typeof next === 'object') stats = Object.assign({ level: 0, hp: 0, strength: 0, defence: 0 }, next);
        updateDropdownStats();
      }).catch(() => {});
    }, 4000);

    setInterval(() => {
      if (!collectUsePopups().length) {
        [...processedThisSession].forEach((k) => {
          if (String(k).indexOf('invuse|') === 0) processedThisSession.delete(k);
        });
      }
    }, 800);

    console.log('%c[DarthyPrime Stats] Active – scanning for gains', 'color:#7dd3fc;font-weight:bold');
  }

  // Public init called from content-main after storage ready
  window.DarthyPrimeStats = {
    init: async function () {
      // Load configurable pet name
      const storedPet = GM_getValue('darthy_pet_name', null);
      if (storedPet) PET_NAME = storedPet;

      STORAGE_KEY    = `neopets_stats_${PET_NAME.toLowerCase()}`;
      START_DATE_KEY = `neopets_start_date_${PET_NAME.toLowerCase()}`;
      LOG_KEY        = `neopets_log_${PET_NAME.toLowerCase()}`;
      LOG_DATE_KEY   = `neopets_log_date_${PET_NAME.toLowerCase()}`;

      stats = GM_getValue(STORAGE_KEY, {
        level: 0,
        hp: 0,
        strength: 0,
        defence: 0
      });

      let tries = 0;
      const tryInject = () => {
        if (injectIntoDropdown() || tries > 25) return;
        tries++;
        setTimeout(tryInject, 400);
      };
      tryInject();
      startWatching();
    },
    getStats: () => ({ ...stats, pet: PET_NAME }),
    getPetName: () => PET_NAME,
    addStat: function (stat, amount) { addStat(stat, amount); },
    addToLog: function (line) { addToLog(line); }
  };
})();
