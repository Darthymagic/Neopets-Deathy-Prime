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

  function handleEventText(text, boldItems) {
    if (!text || text.length < 12) return;
    const fp = fingerprint(text);
    const seen = loadSeen();
    if (seen.has(fp) || processed.has(fp)) return;
    processed.add(fp);
    seen.add(fp);
    saveSeen(seen);

    const lower = text.toLowerCase();

    const isRE = /something has happened|something is happening/i.test(text);
    if (!isRE) return;

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

    // Item received — bold names only from a confirmed RE box
    const giveTalk = /given|gives? you|you (?:find|found|receive|get|got)|free copy of/i.test(text);
    const items = giveTalk && Array.isArray(boldItems) ? boldItems : [];
    if (items.length) {
      items.forEach((name) => {
        if (window.DarthyPrimeStats && window.DarthyPrimeStats.addToLog) {
          window.DarthyPrimeStats.addToLog("You've been given " + name);
        }
      });
      handled = true;
    } else if (giveTalk) {
      const itemM = text.match(/(?:you (?:find|found|receive[ds]?|get|got|are given)|given a free copy of|gives? you)\s+(?:an?\s+)?([A-Z][^.!?\n]{2,60}?)(?:[.!?]|$)/);
      if (itemM && !/NP/i.test(itemM[1])) {
        const name = itemM[1].replace(/^free copy of\s+/i, '').trim();
        if (name && window.DarthyPrimeStats && window.DarthyPrimeStats.addToLog) {
          window.DarthyPrimeStats.addToLog("You've been given " + name);
        }
        handled = true;
      }
    }

    if (handled) {
      console.log('%c[DarthyPrime RE] ' + text.slice(0, 120), 'color:#a78bfa');
    }
  }

  function boldItemsFrom(el) {
    if (!el || !el.querySelectorAll) return [];
    const names = [];
    const seen = {};
    el.querySelectorAll('b, strong').forEach((b) => {
      const name = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length < 2 || name.length > 80) return;
      if (/something has happened|something is happening|enjoy!?|np\b|close/i.test(name)) return;
      const key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      names.push(name);
    });
    return names;
  }

  function scan() {
    const chunks = [];
    const seenEl = new Set();

    function pushEl(el) {
      if (!el || seenEl.has(el)) return;
      seenEl.add(el);
      const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/something has happened|something is happening/i.test(t)) return;
      const copy = el.querySelector && el.querySelector('.copy');
      const box = copy || el;
      chunks.push({
        text: t.slice(0, 800),
        items: boldItemsFrom(box)
      });
    }

    document.querySelectorAll('.randomEvent, #randomEvent, .something-happened, [class*="random-event"], [class*="RandomEvent"]').forEach(pushEl);

    document.querySelectorAll('img[alt*="Something has happened"], img[alt*="Something is happening"], [class*="happened"]').forEach((el) => {
      pushEl(el.closest('div, td, table, section, article') || el.parentElement);
    });

    const all = document.querySelectorAll('div, td, section, article, table');
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const kids = el.childNodes;
      let hit = false;
      for (let j = 0; j < kids.length && j < 12; j++) {
        const n = kids[j];
        const t = (n.textContent || '').trim();
        if (t && /something has happened|something is happening/i.test(t) && t.length < 80) {
          hit = true;
          break;
        }
      }
      if (hit) pushEl(el);
    }

    chunks.forEach((c) => handleEventText(c.text, c.items));
  }

  window.DarthyPrimeRE = {
    init: function () {
      // Events usually appear almost immediately — short watch window
      scan();
      let n = 0;
      const iv = setInterval(() => {
        n++;
        scan();
        if (n >= 20) clearInterval(iv);
      }, 400);

      const obs = new MutationObserver(() => scan());
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 20000);
    }
  };
})();
