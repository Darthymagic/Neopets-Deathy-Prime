/**
 * Random Events Tracker
 * Detects "Something has happened!" / "Something is happening..." banners
 * - NP gained → profit
 * - NP lost/stolen → spending
 * - Stat gains/losses → stats tracker log
 * - Item awards → today's log
 */
(function () {
  'use strict';

  const SEEN_KEY = 'darthy_re_seen';
  const processed = new Set();

  function loadSeen() {
    try {
      const raw = sessionStorage.getItem(SEEN_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (_) { return new Set(); }
  }
  function saveSeen(set) {
    try {
      const arr = Array.from(set).slice(-80);
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function parseAmount(str) {
    if (!str) return 0;
    const map = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
    const s = String(str).toLowerCase().trim();
    if (map[s]) return map[s];
    return parseInt(s.replace(/,/g, ''), 10) || 0;
  }

  function normalizeStat(s) {
    s = String(s || '').toLowerCase();
    if (/level/.test(s)) return 'level';
    if (/strength|attack/.test(s)) return 'strength';
    if (/defence|defense/.test(s)) return 'defence';
    if (/hit|health|endurance|hp/.test(s)) return 'hp';
    return null;
  }

  function fingerprint(text) {
    return text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
  }

  function handleEventText(text) {
    if (!text || text.length < 12) return;
    const fp = fingerprint(text);
    const seen = loadSeen();
    if (seen.has(fp) || processed.has(fp)) return;
    processed.add(fp);
    seen.add(fp);
    saveSeen(seen);

    const lower = text.toLowerCase();

    // Must look like a random event
    const isRE =
      /something has happened|something is happening|random event/i.test(text) ||
      /a faerie|the laboratory|you have been|suddenly|a dark mage|a grarrl|someone has|you found|you receive|you lose|stolen|robbed/i.test(text);
    // Also allow if we're inside an RE container
    if (!isRE && !document.querySelector('.randomEvent, #randomEvent, .something-happened, .re-event')) {
      // still process if strong NP/stat patterns
      if (!/\d[\d,]*\s*np|gains?\s+\d|loses?\s+\d/i.test(text)) return;
    }

    let handled = false;

    // NP gained
    const gainNP = text.match(/(?:find|found|receive[ds]?|gain[s]?|given|awarded|won|collect(?:ed)?)\s+(?:an?\s+)?([\d,]+)\s*NP/i) ||
                   text.match(/([\d,]+)\s*NP\s+(?:has been|was|is)\s+(?:added|credited|deposited)/i) ||
                   text.match(/(?:gives? you|hands you|pays? you)\s+([\d,]+)\s*NP/i);
    if (gainNP) {
      const amount = parseAmount(gainNP[1]);
      if (amount > 0 && amount < 50000000) {
        if (window.DarthyPrimeShop && window.DarthyPrimeShop.addProfit) {
          window.DarthyPrimeShop.addProfit(amount);
          window.DarthyPrimeShop.refreshUI && window.DarthyPrimeShop.refreshUI();
        }
        if (window.DarthyPrimeStats && window.DarthyPrimeStats.addToLog) {
          window.DarthyPrimeStats.addToLog('+' + amount.toLocaleString() + ' NP');
        }
        handled = true;
      }
    }

    // NP lost / stolen
    const loseNP = text.match(/(?:steal[s]?|stole|rob[s]?|takes?|took|loses?|lost|fines?|deducts?)\s+(?:an?\s+)?([\d,]+)\s*NP/i) ||
                   text.match(/([\d,]+)\s*NP\s+(?:has been|was|is)\s+(?:stolen|taken|removed|deducted)/i);
    if (loseNP) {
      const amount = parseAmount(loseNP[1]);
      if (amount > 0 && amount < 50000000) {
        if (window.DarthyPrimeShop && window.DarthyPrimeShop.addSpend) {
          window.DarthyPrimeShop.addSpend(amount);
          window.DarthyPrimeShop.refreshUI && window.DarthyPrimeShop.refreshUI();
        }
        if (window.DarthyPrimeStats && window.DarthyPrimeStats.addToLog) {
          window.DarthyPrimeStats.addToLog('−' + amount.toLocaleString() + ' NP');
        }
        handled = true;
      }
    }

    // Stat changes
    const statRe = /(?:your|the)?\s*(?:pet\s+)?([A-Za-z][A-Za-z0-9_]+)?\s*(?:gains?|loses?|gained|lost)\s+(\d+|one|two|three|four|five|six)\s+(strength|defence|defense|hit\s*points?|health|endurance|levels?)/gi;
    let sm;
    while ((sm = statRe.exec(text)) !== null) {
      const action = /lose|lost/i.test(sm[0]) ? -1 : 1;
      const amount = parseAmount(sm[2]);
      const stat = normalizeStat(sm[3]);
      if (stat && amount) {
        if (window.DarthyPrimeStats && window.DarthyPrimeStats.addStat) {
          window.DarthyPrimeStats.addStat(stat, action * amount);
        }
        if (window.DarthyPrimeStats && window.DarthyPrimeStats.addToLog) {
          window.DarthyPrimeStats.addToLog((action > 0 ? '+' : '−') + amount + ' ' + stat);
        }
        handled = true;
      }
    }

    // Item received
    const itemM = text.match(/(?:you (?:find|found|receive[ds]?|get|got|are given)|gives? you)\s+(?:an?\s+)?([A-Z][^.!?\n]{2,60}?)(?:[.!?]|$)/);
    if (itemM && !/NP/i.test(itemM[1])) {
      if (window.DarthyPrimeStats && window.DarthyPrimeStats.addToLog) {
        window.DarthyPrimeStats.addToLog(itemM[1].trim());
      }
      handled = true;
    }

    if (handled) {
      console.log('%c[DarthyPrime RE] ' + text.slice(0, 120), 'color:#a78bfa');
    }
  }

  function scan() {
    // Common RE containers on modern + classic Neopets
    const selectors = [
      '.randomEvent',
      '#randomEvent',
      '.something-happened',
      '[class*="random-event"]',
      '[class*="RandomEvent"]',
      'div.event',
      // Classic tables / headers
    ];
    const chunks = [];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const t = (el.innerText || el.textContent || '').trim();
        if (t) chunks.push(t);
      });
    });

    // Header text scan
    document.querySelectorAll('h1, h2, h3, b, strong, p').forEach(el => {
      const t = (el.textContent || '').trim();
      if (/something has happened|something is happening/i.test(t)) {
        // Grab parent block text
        const parent = el.closest('div, td, table, section') || el.parentElement;
        const block = (parent && (parent.innerText || parent.textContent) || t).trim();
        if (block) chunks.push(block.slice(0, 800));
      }
    });

    // Also scan full body once lightly for RE phrases if banner present
    if (/something has happened|something is happening/i.test(document.body ? document.body.innerText : '')) {
      const body = document.body.innerText || '';
      const idx = body.search(/something has happened|something is happening/i);
      if (idx >= 0) chunks.push(body.slice(idx, idx + 600));
    }

    chunks.forEach(handleEventText);
  }

  window.DarthyPrimeRE = {
    init: function () {
      // Events usually appear almost immediately — short watch window
      scan();
      let n = 0;
      const iv = setInterval(() => {
        n++;
        scan();
        if (n >= 8) clearInterval(iv); // ~4s
      }, 500);

      const obs = new MutationObserver(() => scan());
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 6000);
    }
  };
})();
