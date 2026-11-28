/**
 * Random Events Tracker
 * Detects "Something has happened!" / "Something is happening..." banners.
 * 1.6.2 / Plus 1.8.79 (t168u): classifies the event against the JellyNeo-based catalogue
 * (scripts/re-catalog.js) and writes a short Tracker line, e.g. "RE: +1,234 NP",
 * "RE: -350 NP (ghost)", "RE: Red Codestone". Flavour-only events are not logged.
 * NP gained still counts as profit; NP lost as spending; stat changes still go
 * to the stats tracker. Unknown events that mention an item or NP are logged
 * from a generic extractor; unknown text-only events are skipped.
 */
(function () {
  'use strict';

  const SEEN_KEY = 'darthy_re_seen';
  const processed = new Set();
  const Cat = () => window.DarthyPrimeRECatalog;

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
    if (str == null || str === '') return 0;
    if (typeof str === 'number' && isFinite(str)) return str;
    const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };
    const s = String(str).toLowerCase().trim();
    if (map[s]) return map[s];
    return parseInt(s.replace(/,/g, ''), 10) || 0;
  }
  function fmtAmt(n) {
    n = parseAmount(n);
    try { return n.toLocaleString('en-US'); } catch (_) { return String(n); }
  }

  function normalizeStat(s) {
    s = String(s || '').toLowerCase();
    if (/level/.test(s)) return 'level';
    if (/strength|attack/.test(s)) return 'strength';
    if (/defence|defense/.test(s)) return 'defence';
    if (/hit|health|endurance|hp/.test(s)) return 'hp';
    if (/intelligence/.test(s)) return 'intelligence';
    if (/agility|movement|speed/.test(s)) return 'agility';
    return null;
  }

  function fingerprint(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
  }

  function tidyName(name) {
    let n = String(name || '').replace(/\s+/g, ' ').trim();
    n = n.replace(/^[\s"'“”‘’]+|[\s"'“”‘’.,;:]+$/g, '');
    n = n.replace(/^(an?|the)\s+/i, '').trim();
    return n;
  }

  function identityNames() {
    const names = [];
    try {
      if (window.DarthyPrimeStats && window.DarthyPrimeStats.getPetName) names.push(window.DarthyPrimeStats.getPetName());
      if (window.DarthyPrimeStats && window.DarthyPrimeStats.getUserName) names.push(window.DarthyPrimeStats.getUserName());
    } catch (_) {}
    try {
      if (typeof GM_getValue === 'function') {
        names.push(GM_getValue('darthy_pet_name', ''));
        names.push(GM_getValue('darthy_username', ''));
      }
    } catch (_) {}
    return names.map(n => String(n || '').trim().toLowerCase()).filter(Boolean);
  }

  // words that used to leak into "You received …" (t168u: "You received follow")
  const NOT_ITEM = /^(follow|following|followers?|her|him|his|she|you|your|invitation|numbers?|spaces?|luck|gift|a gift|the gift|item|an item|the item|five|more|np|nc|ok|close|enjoy|this|that|something|happened|happening|please|should|past|found|received|collect|prize|today|tomorrow|here|there|from|with|and|the|for)$/i;

  function looksLikeItemName(name) {
    const n = tidyName(name);
    if (!n || n.length < 3 || n.length > 70) return false;
    if (identityNames().indexOf(n.toLowerCase()) !== -1) return false;
    if (/^\d+$/.test(n) || /^[\d,]+$/.test(n)) return false;
    if (NOT_ITEM.test(n)) return false;
    if (/something has happened|something is happening|take this|fashion is for|unquestioning loyalty|neggery|darling|following numbers/i.test(n)) return false;
    if (/\b(np|nc|neopoints?)\b/i.test(n)) return false;
    if (/confirm purchase|wish to buy|keep shopping|cancel buy/i.test(n)) return false;
    // a whole sentence is not an item
    if (/[.!?]/.test(n) || n.split(' ').length > 8) return false;
    return true;
  }

  function logLine(line) {
    if (!line || !window.DarthyPrimeStats || !window.DarthyPrimeStats.addToLog) return;
    const s = String(line).replace(/\s+/g, ' ').trim();
    if (!s) return;
    window.DarthyPrimeStats.addToLog(s.length > 160 ? s.slice(0, 157) + '…' : s);
  }

  function applyEconomy(type, amount) {
    const n = parseAmount(amount);
    if (!(n > 0 && n < 50000000)) return;
    try {
      if (type === 'np_gain' && window.DarthyPrimeShop && window.DarthyPrimeShop.addProfit) {
        window.DarthyPrimeShop.addProfit(n);
        window.DarthyPrimeShop.refreshUI && window.DarthyPrimeShop.refreshUI();
      }
      if (type === 'np_loss' && window.DarthyPrimeShop && window.DarthyPrimeShop.addSpend) {
        window.DarthyPrimeShop.addSpend(n);
        window.DarthyPrimeShop.refreshUI && window.DarthyPrimeShop.refreshUI();
      }
    } catch (_) {}
  }

  function applyStat(stat, signed) {
    if (!stat || !signed) return;
    try {
      if (window.DarthyPrimeStats && window.DarthyPrimeStats.addStat) {
        window.DarthyPrimeStats.addStat(stat, signed, 're');
      }
    } catch (_) {}
  }

  function extraBits(extra) {
    const bits = [];
    (extra || []).forEach(x => {
      const s = String(x || '');
      if (/^avatar:/i.test(s)) bits.push('avatar ' + s.slice(7).trim());
      else if (/^unlock:/i.test(s)) bits.push('unlocked ' + s.slice(7).trim());
    });
    return bits;
  }

  function formatLine(r) {
    if (!r || r.skip || r.type === 'flavour') return '';
    const bits = extraBits(r.extra);
    let line = '';
    const tag = r.tag ? ' (' + r.tag + ')' : '';
    switch (r.type) {
      case 'np_gain':
        if (!parseAmount(r.n)) return '';
        line = 'RE: +' + fmtAmt(r.n) + ' NP' + tag;
        break;
      case 'np_loss':
        if (!parseAmount(r.n)) return '';
        line = 'RE: -' + fmtAmt(r.n) + ' NP' + tag;
        break;
      case 'nc':
        if (!parseAmount(r.n)) return '';
        line = 'RE: +' + fmtAmt(r.n) + ' NC';
        break;
      case 'item':
        if (!r.item) return '';
        line = 'RE: ' + r.item;
        break;
      case 'neodeck':
        line = 'RE: ' + (r.item ? r.item + ' (Neodeck)' : 'card added to Neodeck');
        break;
      case 'stat': {
        const amt = parseAmount(r.n) || 1;
        const sign = (r.sign || 1) < 0 ? '-' : '+';
        const st = r.stat || 'stat';
        const label = st === 'hp' ? 'HP' : st;
        line = 'RE: ' + sign + amt + ' ' + label + (r.pet ? ' (' + r.pet + ')' : '');
        break;
      }
      case 'heal':
        line = 'RE: all pets full HP';
        break;
      case 'shop':
        line = 'RE: shop +' + (parseAmount(r.n) || 1) + ' size';
        break;
      case 'gallery':
        line = 'RE: gallery +' + (parseAmount(r.n) || 5) + ' spaces';
        break;
      case 'lottery':
        line = 'RE: lottery ticket';
        break;
      case 'avatar':
        line = 'RE: avatar' + (r.tag ? ' ' + r.tag : '');
        break;
      case 'disease':
        line = 'RE: ' + (r.pet ? r.pet + ' got ' : '') + (r.disease || r.tag || 'a disease');
        break;
      case 'mood':
        line = 'RE: ' + (r.pet ? r.pet + ' ' : 'pet ') + (r.tag || r.disease || 'mood change');
        break;
      case 'unlock':
        line = 'RE: unlocked ' + (r.tag || 'challenger');
        break;
      default:
        return '';
    }
    if (bits.length) {
      const joined = line + ', ' + bits.join(', ');
      if (joined.length <= 160) line = joined;
    }
    return line.replace(/\s+/g, ' ').trim();
  }

  // unknown events: pull NP / items / stats out of the wording when we can
  function genericResult(text, boldItems) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (/just a (?:loading|moment)|something is happening\.*$/i.test(t) && t.length < 80) return null;

    const ncM = t.match(/\b([\d,]+)\s*NC\b/i);
    if (ncM && /gift|gives?|given|hands you|receive/i.test(t)) {
      const n = parseAmount(ncM[1]);
      if (n > 0) return { type: 'nc', n: n };
    }

    const gainNP = t.match(/(?:find|found|receive[ds]?|gain[s]?|given|awarded|won|collect(?:ed)?|gift of|added)\s+(?:an?\s+)?([\d,]+)\s*(?:NP|neopoints?)\b/i) ||
                   t.match(/([\d,]+)\s*(?:NP|neopoints?)\s+(?:has been|was|is|are)\s+(?:added|credited|deposited)/i) ||
                   t.match(/(?:gives? you|hands you|pays? you|tosses? you|throws you|with an additional)\s+([\d,]+)\s*(?:NP|neopoints?)\b/i) ||
                   t.match(/you just found\s+([\d,]+)\s*neopoints?/i) ||
                   t.match(/\b([\d,]+)\s*(?:NP|neopoints?)\b/i) && /\b(found|find|receive|gain|give|gave|hand|pay|toss|throw|win|won|awarded|collect|added)\w*\b/i.test(t) && !/\b(stolen|stole|takes?|took|lost|lose|drop|deduct|fine)\b/i.test(t)
                     ? t.match(/\b([\d,]+)\s*(?:NP|neopoints?)\b/i) : null;
    if (gainNP) {
      const n = parseAmount(gainNP[1]);
      if (n > 0 && n < 50000000) return { type: 'np_gain', n: n };
    }

    const loseNP = t.match(/(?:steal[s]?|stole|rob[s]?|takes?|took|loses?|lost|fines?|deducts?|drop(?:s|ped)?)\s+(?:an?\s+)?([\d,]+)\s*(?:NP|neopoints?)\b/i) ||
                   t.match(/([\d,]+)\s*(?:NP|neopoints?)\s+(?:has been|was|is|are)\s+(?:stolen|taken|removed|deducted)/i);
    if (loseNP) {
      const n = parseAmount(loseNP[1]);
      if (n > 0 && n < 50000000) {
        const tag = /ghost/i.test(t) ? 'ghost' : (/fungus/i.test(t) ? 'fungus' : '');
        return { type: 'np_loss', n: n, tag: tag };
      }
    }

    if (/shop has suddenly increased in size|shop increases by/i.test(t)) return { type: 'shop', n: 1 };
    if (/gallery has \w+ more spaces|gallery size increases/i.test(t)) return { type: 'gallery', n: 5 };
    if (/lottery ticket/i.test(t)) return { type: 'lottery' };
    if (/all your neopets are now at full health/i.test(t)) return { type: 'heal' };

    const statRe = /(?:your|the)?\s*(?:pet\s+)?([A-Za-z][A-Za-z0-9_]+)?\s*(?:gains?|loses?|gained|lost|has become better at|becomes better at|gotten stronger|gained a level|loses a level)\s+(\d+|one|two|three|four|five|six)?\s*(strength|defence|defense|hit\s*points?|health|endurance|levels?|attack|agility|intelligence)?/gi;
    let sm, last = null;
    while ((sm = statRe.exec(t)) !== null) {
      const action = /lose|lost/i.test(sm[0]) ? -1 : 1;
      const amount = parseAmount(sm[2]) || 1;
      const stat = normalizeStat(sm[3] || (/level/i.test(sm[0]) ? 'level' : /stronger/i.test(sm[0]) ? 'strength' : ''));
      if (stat && amount) last = { type: 'stat', n: amount, sign: action, stat: stat, pet: looksLikeItemName(sm[1] || '') ? sm[1] : '' };
    }
    if (last) return last;

    let items = Array.isArray(boldItems) ? boldItems.map(tidyName).filter(looksLikeItemName) : [];
    if (!items.length) {
      const inv = t.match(/([A-Z][^!?.]{2,60}?)\s+(?:has been|have been|is|are)\s+added to your inventory/i) ||
        t.match(/(?:take this|give you|gives? you|here to give you|hands you(?: a copy of)?|a copy of|free copy of|offers you(?: an?)?)\s+([A-Z][^!?.]{1,60}?)(?:[.!?"']|$| out\b)/i) ||
        t.match(/(?:you(?:'ve| have)? found|you find)\s+(?:a tasty\s+)?(?:an?\s+)?([A-Z][^!?.]{2,60}?)(?:\s+in the\s|\s+lying\s|\s+on the\s|[.!?"']|$)/i);
      if (inv) {
        const name = tidyName(inv[1]);
        if (looksLikeItemName(name)) items = [name];
      }
    }
    if (items.length) return { type: 'item', item: items[0] };
    return null;
  }

  function handleEventText(text, boldItems) {
    if (!text || text.length < 12) return null;
    const fp = fingerprint(text);
    const seen = loadSeen();
    if (seen.has(fp) || processed.has(fp)) return null;
    processed.add(fp);
    seen.add(fp);
    saveSeen(seen);

    if (/start reading that straight away|get me more books|vanishes in a puff|read to pet/i.test(text)) return null;
    const isRE = /something has happened|something is happening/i.test(text);
    if (!isRE && !(Cat() && Cat().classify(text))) return null;

    let result = Cat() ? Cat().classify(text) : null;
    if (result && result.item) result.item = tidyName(result.item);
    if (result && result.type === 'item' && result.item && !looksLikeItemName(result.item)) result.item = '';
    if (result && result.type === 'item' && !result.item) {
      const items = (boldItems || []).map(tidyName).filter(looksLikeItemName);
      if (items.length) result.item = items[0];
    }
    if (!result || result.skip || result.type === 'flavour') {
      if (result && (result.skip || result.type === 'flavour')) return result; // known flavour: never generic
      result = genericResult(text, boldItems);
    }
    if (!result) return null;

    // numbers / items from the live wording win over empty catalogue fields
    if ((result.type === 'np_gain' || result.type === 'np_loss' || result.type === 'nc') && !parseAmount(result.n)) {
      const g = genericResult(text, boldItems);
      if (g && g.n) result.n = g.n;
    }

    const line = formatLine(result);
    if (!line) return result;

    if (result.type === 'np_gain' || result.type === 'np_loss') applyEconomy(result.type, result.n);
    if (result.type === 'stat') applyStat(result.stat, (result.sign || 1) * (parseAmount(result.n) || 1));

    logLine(line);
    try { console.log('%c[DarthyPrime RE] ' + line + ' — ' + String(text).slice(0, 80), 'color:#a78bfa'); } catch (_) {}
    result.line = line;
    return result;
  }

  function boldItemsFrom(el) {
    if (!el || !el.querySelectorAll) return [];
    const names = [];
    const seen = {};
    el.querySelectorAll('b, strong').forEach((b) => {
      const name = tidyName(b.textContent || '');
      if (!looksLikeItemName(name)) return;
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
      const copy = el.querySelector && el.querySelector('.copy');
      const box = copy || el;
      const t = (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim();
      const head = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/something has happened|something is happening/i.test(head) &&
          !/something has happened|something is happening/i.test(t)) return;
      if (/up for auction|start price \(np\)|minimum increment/i.test(t)) return;
      if (/confirm purchase|are you sure you wish to buy|keep shopping/i.test(t)) return;
      if (/hold on!?|leave the beta|less mobile-friendly|don'?t show me this again/i.test(t)) return;
      if (el.closest && el.closest('#invResult, .invResult, #petCareResult, #sdb__popup, .sdb-popup')) return;
      // "Something is happening..." placeholder: wait for the real event
      if (/^something is happening\.{0,3}$/i.test(t) || /^something is happening\.{0,3}$/i.test(head)) return;
      const snippet = t.slice(0, 360);
      chunks.push({
        text: /something has happened|something is happening/i.test(snippet)
          ? snippet
          : ('Something has happened! ' + snippet).slice(0, 360),
        items: boldItemsFrom(box)
      });
    }

    document.querySelectorAll('.randomEvent, #randomEvent, .something-happened, [class*="random-event"], [class*="RandomEvent"]').forEach(pushEl);

    document.querySelectorAll('img[alt*="Something has happened"], img[alt*="Something is happening"], [class*="happened"]').forEach((el) => {
      pushEl(el.closest('div, td, table, section, article') || el.parentElement);
    });

    document.querySelectorAll('div, td, section, article').forEach((el) => {
      const own = Array.from(el.childNodes).some((n) => {
        if (n.nodeType !== 1 && n.nodeType !== 3) return false;
        const tx = (n.textContent || '').replace(/\s+/g, ' ').trim();
        return tx.length > 8 && tx.length < 60 && /something has happened|something is happening/i.test(tx);
      });
      if (!own) return;
      if ((el.innerText || '').length > 1200) return;
      pushEl(el);
    });

    chunks.forEach((c) => handleEventText(c.text, c.items));
  }

  window.DarthyPrimeRE = {
    init: function () {
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
    },
    handleEventText: handleEventText,
    formatLine: formatLine,
    classify: function (text, items) { return Cat() ? Cat().classify(text) : genericResult(text, items); },
    looksLikeItemName: looksLikeItemName,
    scan: scan
  };
})();
