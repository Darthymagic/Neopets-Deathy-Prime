/**
 * Food Club module for Darthy Prime (non-Plus) — 1.6.1
 *  - Place a Bet tab: a NeoFoodClub-style table of up to 10 bets for the chosen style, with the Amount
 *    filled in, Odds / Payoff / Prob. / E.R. / N.E. / Maxbet / arena pirates and a "Place bet!" button
 *    per row (one bet per click, sent in the background; new-tab fallback), plus a Total row.
 *  - Five styles (remembered): Darthy No Bust 0–5% bust, Darthy Bets 45–55% (calibrated max TER, as Plus),
 *    Mimic - nsheng 25–30%, Mimic - jkScrollingDown 35–42%, Mimic - Garret Jaxx (dynamic: ~30% when the
 *    round looks good, otherwise 0–5%). A style can use fewer than 10 bets when that suits the round.
 *  - Current Bets tab: Copy Bets (NeoFoodClub-style text, as Plus).
 *  - FC Wrap Up (Weekly / Monthly / Quarterly, kept forever) and Collect All winnings tracking (as Plus).
 * Nothing runs by itself: no bet is placed and nothing is collected unless you click.
 */
(function () {
  'use strict';
  if (window.__darthyFCNonPlus) return;
  window.__darthyFCNonPlus = true;

  const STYLE_KEY = 'darthy_fc_style';
  const WINS_KEY = 'darthy_fc_wins';              // old (1.6.0) wins list — copied into the history once
  const SNAP_KEY = 'darthy_fc_bets_snap';         // { round, at, arenas[{names,odds}], probs, lines } for Copy Bets
  const PLAN_KEY = 'darthy_fc_plan';              // { round, style, maxBet, lines, src, mode, at } — the table's bets
  const PLACED_KEY = 'darthy_fc_placed';          // { round, bets: { pickStr: { at, stake, how } } }
  const NEWTAB_KEY = 'darthy_fc_newtab';          // true = open each bet in a new tab instead of the background
  const COLLECT_PEND_KEY = 'darthy_fc_collect_pending'; // { at, npBefore, total, rows } after you click Collect All
  const HIST_KEY = 'darthy_fc_history';
  const HIST_CHECK_KEY = 'darthy_fc_hist_check';
  const NFC_CACHE_KEY = 'darthy_fc_nfc_round';
  const FC_URL = 'https://www.neopets.com/pirates/foodclub.phtml';
  const BET_ENDPOINT = '/pirates/process_foodclub.phtml';
  const MAX_WIN = 1000000;

  // Garret Jaxx: "odds look good" = the best ~30%-bust set averages at least this E.R. per bet
  // (calibrated NeoFoodClub probabilities). Picked from 4,782 NeoFoodClub rounds — see README.
  const GARRET_GOOD_ER = 1.85;
  const STYLES = {
    nobust: { name: 'Darthy No Bust', band: [0.00, 0.05], desc: '0–5% bust · bust-proof when possible (Garret-style safe)' },
    darthy: { name: 'Darthy Bets', band: [0.45, 0.55], desc: '45–55% bust · calibrated max TER (the Plus style)' },
    nsheng: { name: 'Mimic - nsheng', band: [0.25, 0.30], desc: '25–30% bust' },
    jk: { name: 'Mimic - jkScrollingDown', band: [0.35, 0.42], desc: '35–42% bust' },
    garret: { name: 'Mimic - Garret Jaxx', band: null, desc: 'Dynamic · ~30% bust when the odds look good, otherwise 0–5%' }
  };
  const GARRET_GOOD_BAND = [0.27, 0.33];
  const STYLE_ORDER = ['nobust', 'darthy', 'nsheng', 'jk', 'garret'];

  function gmGet(k, fb) {
    try { if (typeof GM_getValue === 'function') { const v = GM_getValue(k, undefined); if (v !== undefined) return v; } } catch (_) {}
    try { const v = localStorage.getItem('dp_' + k); if (v) return JSON.parse(v); } catch (_) {}
    return fb;
  }
  function gmSet(k, v) {
    try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (_) {}
    try { localStorage.setItem('dp_' + k, JSON.stringify(v)); } catch (_) {}
  }
  function getStyle() { const s = gmGet(STYLE_KEY, 'darthy'); return STYLES[s] ? s : 'darthy'; }
  function setStyle(id) { if (STYLES[id]) gmSet(STYLE_KEY, id); }
  function getWins() { const w = gmGet(WINS_KEY, []); return Array.isArray(w) ? w : []; }
  function newTabMode() { return !!gmGet(NEWTAB_KEY, false); }

  function addSpend(amount) {
    if (!(amount > 0)) return;
    try { if (window.DarthyPrimeShop && window.DarthyPrimeShop.addSpend) { window.DarthyPrimeShop.addSpend(amount); return; } } catch (_) {}
    try { const cur = Number(gmGet('darthy_spending_total', 0)) || 0; if (typeof GM_setValue === 'function') GM_setValue('darthy_spending_total', cur + amount); } catch (_) {}
  }
  function addProfit(amount) {
    if (!(amount > 0)) return;
    try { if (window.DarthyPrimeShop && window.DarthyPrimeShop.addProfit) { window.DarthyPrimeShop.addProfit(amount); return; } } catch (_) {}
    try { const cur = Number(gmGet('darthy_shop_profit_total', 0)) || 0; if (typeof GM_setValue === 'function') GM_setValue('darthy_shop_profit_total', cur + amount); } catch (_) {}
  }

  function currentTab() {
    const s = (location.search || '') + (location.hash || '');
    const panel = document.querySelector('#fc-tab-body[data-tab-panel], [data-tab-panel]');
    const p = panel ? String(panel.getAttribute('data-tab-panel') || '') : '';
    if (/tab=bet|type=bet/i.test(s) || p === 'bet' || document.getElementById('fc-bet-form')) return 'bet';
    if (/tab=current|type=current/i.test(s) || p === 'current') return 'current';
    if (/tab=collect|type=collect/i.test(s) || p === 'collect') return 'collect';
    return 'main';
  }
  function onFC() { return /\/pirates\/foodclub/i.test(location.pathname); }
  function parseNP(text) { return parseInt(String(text || '').replace(/[^\d]/g, ''), 10) || 0; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }

  // FC "day" = the round, which rolls over at 2:15 PM NST ('r' + NST date of the round's opening)
  function nstDate() {
    const shifted = new Date(Date.now() - (14 * 60 + 15) * 60000);
    try { return 'r' + new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted); }
    catch (_) { return 'r' + new Date(shifted.getTime() - 8 * 3600000).toISOString().slice(0, 10); }
  }
  function ymdNST(ts) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }
    catch (_) { return new Date(ts - 8 * 3600000).toISOString().slice(0, 10); }
  }
  function roundDayOf(ts) { return ymdNST(ts - (14 * 60 + 15) * 60000); }

  // ======================= probabilities (NeoFoodClub "Original" model, calibrated as Plus) =======================
  const ARENA_NAMES = ['Shipwreck', 'Lagoon', 'Treasure', 'Hidden', 'Harpoon'];
  const NFC_NAMES = ['Dan', 'Sproggie', 'Orvinn', 'Lucky', 'Edmund', 'Peg Leg', 'Bonnie', 'Puffo', 'Stuff', 'Squire',
    'Crossblades', 'Stripey', 'Ned', 'Fairfax', 'Gooblah', 'Franchisco', 'Federismo', 'Blackbeard', 'Buck', 'Tailhook'];
  function shortName(n) {
    const t = String(n || '').trim();
    for (const s of NFC_NAMES) if (new RegExp('(^|[^a-z])' + s.replace(' ', '\\s*') + '([^a-z]|$)', 'i').test(t)) return s;
    return t;
  }
  // NeoFoodClub "Original" model, ported 1:1 (std values incl. the rectify loop); odds4 = one arena's 4 odds
  function nfcOriginal(odds4) {
    const min = [0, 0, 0, 0], max = [0, 0, 0, 0], std = [0, 0, 0, 0];
    let minProb = 0, maxProb = 0;
    for (let i = 0; i < 4; i++) {
      const o = odds4[i];
      if (o === 13) { min[i] = 0; max[i] = 1 / 13; }
      else if (o === 2) { min[i] = 1 / 3; max[i] = 1; }
      else { min[i] = 1 / (1 + o); max[i] = 1 / o; }
      minProb += min[i]; maxProb += max[i];
    }
    for (let i = 0; i < 4; i++) {
      const mn = min[i], mx = max[i];
      min[i] = Math.max(mn, 1 + mx - maxProb);
      max[i] = Math.min(mx, 1 + mn - minProb);
      std[i] = odds4[i] === 13 ? 0.05 : (min[i] + max[i]) / 2;
    }
    for (let level = 2; level < 13; level++) {
      let count = 0, total = 0, val = 0, maxVal = 1;
      for (let i = 0; i < 4; i++) {
        total += std[i];
        if (odds4[i] <= level) { count++; val += std[i] - min[i]; maxVal = Math.min(maxVal, max[i] - min[i]); }
      }
      if (total === 1) break;
      if (!(total - val > 1 || count === 0 || maxVal * count < val + 1 - total)) {
        val = (val + 1 - total) / count;
        for (let i = 0; i < 4; i++) if (odds4[i] <= level) std[i] = min[i] + val;
        break;
      }
    }
    return std;
  }
  // How often a pirate at each opening-odds value really won (4,782 NeoFoodClub rounds) ÷ the model's chance (Plus 1.8.42)
  const CAL_RATIO = { 2: 0.5243 / 0.5188, 3: 0.2868 / 0.2928, 4: 0.2244 / 0.2251, 5: 0.1829 / 0.1833, 6: 0.1646 / 0.1548,
    7: 0.1370 / 0.1339, 8: 0.1266 / 0.1181, 9: 0.1124 / 0.1056, 10: 0.1043 / 0.0955, 11: 0.0945 / 0.0871, 12: 0.0776 / 0.0801, 13: 0.0400 / 0.0500 };
  function calibrate(probs, odds) {
    return probs.map((a, k) => {
      const v = a.map((x, i) => x * (CAL_RATIO[odds[k][i]] || 1));
      const t = v.reduce((x, y) => x + y, 0);
      return t > 0 ? v.map(x => x / t) : a.slice();
    });
  }

  // ======================= the bet picker (all five styles) =======================
  // Exact 1,024-outcome distribution (one winner per arena, arenas independent). For a bust band [lo, hi]
  // it looks for up to n distinct bets with the highest TER (sum of win chance × odds) whose bust chance
  // (no bet wins) sits inside the band: several starting sets (top E.R., one built around each likely
  // pirate, and "cover one arena" sets for the low-bust styles) are improved one swap at a time until
  // nothing improves or the time budget runs out (the Plus 1.8.42 search, with the band as a setting).
  // Then bets with an E.R. under 1 are dropped when the bust chance stays inside the band, so a style
  // can use fewer than n bets.
  // penalty per unit of bust outside the band: Darthy Bets keeps Plus's 200; the narrower bands need a
  // much stronger one so the set really lands inside them
  const BAND_PEN = 200, BAND_PEN_STRICT = 5000;
  function betCandidates(probs, odds, maxBet, wide) {
    const all = [];
    for (let code = 1; code < 3125; code++) {
      const picks = [0, 0, 0, 0, 0];
      let c = code;
      for (let k = 0; k < 5; k++) { picks[k] = c % 5; c = Math.floor(c / 5); }
      let P = 1, O = 1, legs = 0;
      for (let k = 0; k < 5; k++) if (picks[k]) { P *= probs[k][picks[k] - 1]; O *= odds[k][picks[k] - 1]; legs++; }
      if (!(O > 0) || !(P > 0)) continue;
      const stake = Math.min(maxBet, Math.max(1, Math.ceil(MAX_WIN / O)));
      const ER = P * O;
      all.push({ picks, P, O, ER, stake, NE: stake * (ER - 1), legs });
    }
    all.sort((x, y) => y.ER - x.ER || y.O - x.O);
    const set = new Set(all.slice(0, 400));
    if (wide) all.forEach(b => { if (b.legs <= 2) set.add(b); });   // low-leg bets, needed to cover outcomes for low bust
    const cands = [...set];
    cands.forEach(b => {
      const cov = [];
      for (let o = 0; o < 1024; o++) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (b.picks[k] && b.picks[k] - 1 !== ((o >> (2 * k)) & 3)) { ok = false; break; }
        if (ok) cov.push(o);
      }
      b.cov = Int16Array.from(cov);
    });
    return { all, cands };
  }
  function outcomeProbs(probs) {
    const op = new Float64Array(1024);
    for (let o = 0; o < 1024; o++) { let p = 1; for (let k = 0; k < 5; k++) p *= probs[k][(o >> (2 * k)) & 3]; op[o] = p; }
    return op;
  }
  function pickSet(probs, odds, maxBet, band, n, budgetMs, pre, pen) {
    const PEN = pen || BAND_PEN_STRICT;
    n = n || 10;
    const t0 = Date.now(), budget = budgetMs || 1200;
    const lo = band[0], hi = band[1];
    const op = pre && pre.op || outcomeProbs(probs);
    const cands = (pre && pre.cands) || betCandidates(probs, odds, maxBet, true).cands;
    const byER = cands.slice().sort((x, y) => y.ER - x.ER || y.O - x.O);
    const units = new Float64Array(1024);
    const add = (b, s) => { const c = b.cov; for (let i = 0; i < c.length; i++) units[c[i]] += s * b.O; };
    const bustNow = () => { let bust = 0; for (let o = 0; o < 1024; o++) if (units[o] === 0) bust += op[o]; return bust; };
    const scoreOf = (ter, bust) => ter - PEN * (bust < lo ? lo - bust : (bust > hi ? bust - hi : 0));
    function improve(set) {
      units.fill(0);
      set.forEach(b => add(b, 1));
      let ter = set.reduce((x, b) => x + b.ER, 0);
      let cur = scoreOf(ter, bustNow());
      let changed = true;
      while (changed && Date.now() - t0 < budget) {
        changed = false;
        for (let i = 0; i < set.length; i++) {
          const out = set[i];
          add(out, -1);
          const baseTer = ter - out.ER;
          let best = null, bestS = cur;
          for (const c of cands) {
            if (set.includes(c)) continue;
            add(c, 1);
            const s = scoreOf(baseTer + c.ER, bustNow());
            add(c, -1);
            if (s > bestS + 1e-9) { bestS = s; best = c; }
          }
          if (best) { set[i] = best; add(best, 1); ter = baseTer + best.ER; cur = bestS; changed = true; }
          else add(out, 1);
          if (Date.now() - t0 >= budget) break;
        }
      }
      return { set, score: cur };
    }
    const starts = [];
    const fill = (base) => { const s = base.slice(); for (const c of byER) { if (s.length >= n) break; if (!s.includes(c)) s.push(c); } return s.slice(0, n); };
    if (lo <= 0.10) {
      // cover one arena with its four single-pirate bets (bust 0), the rest top E.R.
      const covers = [];
      for (let k = 0; k < 5; k++) {
        const singles = cands.filter(c => c.legs === 1 && c.picks[k]);
        if (singles.length === 4) covers.push({ k, er: singles.reduce((x, c) => x + c.ER, 0), singles });
      }
      covers.sort((x, y) => y.er - x.er).slice(0, 3).forEach(cv => starts.push(fill(cv.singles)));
    }
    starts.push(byER.slice(0, n));
    const anchors = [];
    for (let k = 0; k < 5; k++) for (let s = 1; s <= 4; s++) if (probs[k][s - 1] >= 0.3) anchors.push([k, s, probs[k][s - 1]]);
    anchors.sort((x, y) => y[2] - x[2]);
    anchors.slice(0, 6).forEach(([k, s]) => { const set = byER.filter(c => c.picks[k] === s).slice(0, n); if (set.length === n) starts.push(set); });
    let best = null;
    for (const st of starts) {
      if (Date.now() - t0 >= budget && best) break;
      const r = improve(st.slice());
      if (!best || r.score > best.score) best = { set: r.set.slice(), score: r.score };
    }
    // fewer bets: drop E.R. < 1 bets (worst first) while the bust chance stays inside the band
    let set = best.set.slice();
    units.fill(0); set.forEach(b => add(b, 1));
    for (;;) {
      const weak = set.filter(b => b.ER < 1).sort((x, y) => x.ER - y.ER);
      let dropped = false;
      for (const b of weak) {
        if (set.length <= 1) break;
        add(b, -1);
        const bust = bustNow();
        if (bust >= lo - 1e-9 && bust <= hi + 1e-9) { set = set.filter(x => x !== b); dropped = true; break; }
        add(b, 1);
      }
      if (!dropped) break;
    }
    set.sort((x, y) => y.ER - x.ER);
    return set.map(b => ({ picks: b.picks.slice(), P: b.P, O: b.O, ER: b.ER, stake: b.stake, NE: b.NE }));
  }
  function setStats(lines, probs) {
    const n = lines.length;
    let bust = 0, profit = 0, d = 0, t = 0, q = 0, ter = 0;
    lines.forEach(b => { let p = 1; b.picks.forEach((s, k) => { if (s) p *= probs[k][s - 1]; }); ter += p * b.O; });
    for (let o = 0; o < 1024; o++) {
      let p = 1, u = 0;
      for (let k = 0; k < 5; k++) p *= probs[k][(o >> (2 * k)) & 3];
      for (const b of lines) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (b.picks[k] && b.picks[k] - 1 !== ((o >> (2 * k)) & 3)) { ok = false; break; }
        if (ok) u += b.O;
      }
      if (u === 0) bust += p;
      if (u > n) profit += p;
      if (u >= 2 * n) d += p;
      if (u >= 3 * n) t += p;
      if (u >= 4 * n) q += p;
    }
    return { n, bust, profit, d, t, q, ter };
  }
  // the bets for a style; probs = calibrated probabilities, odds = the odds the payouts use
  function styleLines(style, probs, odds, maxBet, maxBets, budgetMs) {
    const n = Math.max(1, Math.min(10, maxBets || 10));
    const op = outcomeProbs(probs);
    if (style === 'darthy') {
      // the Plus 1.8.42 picker: top-400 E.R. candidates, 45–55% band, penalty 200
      const pre0 = { op, cands: betCandidates(probs, odds, maxBet, false).cands };
      return { lines: pickSet(probs, odds, maxBet, STYLES.darthy.band, n, budgetMs, pre0, BAND_PEN), band: STYLES.darthy.band, mode: '' };
    }
    const pre = { op, cands: betCandidates(probs, odds, maxBet, true).cands };
    if (style === 'garret') {
      const good = pickSet(probs, odds, maxBet, GARRET_GOOD_BAND, n, budgetMs, pre);
      const avgER = good.reduce((x, b) => x + b.ER, 0) / Math.max(1, good.length);
      if (avgER >= GARRET_GOOD_ER) return { lines: good, band: GARRET_GOOD_BAND, mode: 'odds look good (avg E.R. ' + avgER.toFixed(2) + ') → ~30% bust', good: true, avgER };
      return { lines: pickSet(probs, odds, maxBet, STYLES.nobust.band, n, budgetMs, pre), band: STYLES.nobust.band, mode: 'odds not good enough (avg E.R. ' + avgER.toFixed(2) + ' < ' + GARRET_GOOD_ER + ') → 0–5% bust', good: false, avgER };
    }
    const band = (STYLES[style] || STYLES.darthy).band;
    return { lines: pickSet(probs, odds, maxBet, band, n, budgetMs, pre), band, mode: '' };
  }

  // ======================= the Place a Bet page =======================
  function parseMaxBetFromPage() {
    const desc = document.querySelector('p.pageDesc');
    if (desc) {
      const m = /place up to\s*<b>([\d,]+)<\/b>\s*NeoPoints/i.exec(desc.innerHTML || '') || /place up to\s*([\d,]+)\s*NeoPoints/i.exec(desc.textContent || '');
      if (m) { const n = parseInt(m[1].replace(/,/g, ''), 10); if (n > 0) return n; }
    }
    const all = (document.body && document.body.textContent || '').replace(/\s+/g, ' ');
    const m2 = /place up to\s*([\d,]+)\s*NeoPoints/i.exec(all);
    if (m2) { const n = parseInt(m2[1].replace(/,/g, ''), 10); if (n > 0) return n; }
    return 0;
  }
  function readBetPage() {
    const form = document.getElementById('fc-bet-form');
    if (!form) return null;
    const pill = document.querySelector('.fc-round-pill');
    const roundM = pill && /\d+/.exec(pill.textContent || '');
    const arenas = [...form.querySelectorAll('.fc-bet-row')].map(row => {
      const radios = [...row.querySelectorAll('.fc-bet-pirate-radio')];
      return {
        match: Number(row.dataset.match),
        pirates: radios.map((radio, i) => {
          const lab = radio.closest('.fc-bet-pirate');
          const name = ((lab && lab.querySelector('.fc-bet-pirate__name')) || {}).textContent || '';
          return { slot: i + 1, id: Number(radio.value) || 0, odds: Number(radio.getAttribute('data-odds')) || 0, name: String(name).trim() };
        })
      };
    });
    const maxBet = parseMaxBetFromPage() || Number(form.dataset.maxBet) || 0;
    return {
      form, round: roundM ? Number(roundM[0]) : 0, maxBet,
      maxBets: Number(form.dataset.maxBets) || 10,
      betsPlaced: Number(form.dataset.betsPlaced) || 0,
      arenas
    };
  }
  function pageOk(page) {
    return !!(page && page.arenas.length === 5 && page.arenas.every(a => a.pirates.length === 4 && a.pirates.every(p => p.odds > 0)));
  }
  function pickStr(picks) { return (picks || []).map(x => Number(x) || 0).join(''); }

  // NeoFoodClub's public round file (cdn.neofood.club — never Neopets); cached per round, 2.5 s limit
  function nfcRoundData(round) {
    const r = Number(round) || 0;
    const c = gmGet(NFC_CACHE_KEY, null);
    if (c && r && Number(c.round) === r && c.openingOdds) return Promise.resolve(c);
    if (!r || typeof fetch !== 'function') return Promise.resolve(null);
    let ctl = null;
    try { ctl = new AbortController(); setTimeout(() => { try { ctl.abort(); } catch (_) {} }, 2500); } catch (_) {}
    return fetch('https://cdn.neofood.club/rounds/' + r + '.json', { credentials: 'omit', cache: 'no-cache', signal: ctl ? ctl.signal : undefined })
      .then(res => res.ok ? res.json() : null)
      .then(j => {
        if (!j || Number(j.round) !== r || !Array.isArray(j.openingOdds) || !Array.isArray(j.pirates)) return null;
        const keep = { round: r, pirates: j.pirates, openingOdds: j.openingOdds, currentOdds: j.currentOdds, at: Date.now() };
        gmSet(NFC_CACHE_KEY, keep);
        return keep;
      })
      .catch(() => null);
  }
  // probabilities: Original model on NeoFoodClub's opening odds when its pirates match the page, else on the
  // page's odds; then calibrated. Payouts always use the page's (current) odds.
  async function pageProbs(page) {
    const odds = page.arenas.map(a => a.pirates.map(p => p.odds));
    let nfc = null;
    try { nfc = await nfcRoundData(page.round); } catch (_) {}
    let raw = null, rawOdds = odds, src = 'current odds';
    try {
      if (nfc && nfc.openingOdds && nfc.pirates && Number(nfc.round) === Number(page.round) &&
          nfc.pirates.every((ids, k) => ids.every((id, i) => NFC_NAMES[id - 1] === shortName(page.arenas[k].pirates[i].name)))) {
        rawOdds = nfc.openingOdds.map(a => a.slice(1, 5));
        raw = rawOdds.map(nfcOriginal);
        src = 'opening odds';
      }
    } catch (_) {}
    if (!raw) raw = odds.map(nfcOriginal);
    return { odds, raw, probs: calibrate(raw, rawOdds), src: 'calibrated NeoFoodClub model, ' + src };
  }

  // ---- placed bets this round (yours, from this table or seen on Current Bets) ----
  function placedLoad(round) {
    const v = gmGet(PLACED_KEY, null);
    return (v && typeof v === 'object' && Number(v.round) === Number(round)) ? v : { round: Number(round) || 0, bets: {} };
  }
  function placedMark(round, picks, info) {
    const v = placedLoad(round);
    v.bets[pickStr(picks)] = Object.assign({ at: Date.now() }, info || {});
    gmSet(PLACED_KEY, v);
  }

  // ---- background bet: the same request Neopets' Food Club bet form sends ----
  function hiddenFields(form) {
    const out = [];
    if (!form) return out;
    form.querySelectorAll('input[type=hidden][name]').forEach(i => out.push([i.name, i.value]));
    return out;
  }
  function betParams(page, line, amount) {
    const p = new URLSearchParams();
    const legs = [];
    for (let k = 0; k < 5; k++) {
      const s = line.picks[k];
      if (!s) continue;
      const pir = page.arenas[k].pirates[s - 1];
      let id = pir && pir.id;
      if (!(id > 0)) id = NFC_NAMES.indexOf(shortName(pir && pir.name)) + 1;
      legs.push([k + 1, id]);
    }
    legs.forEach(([m]) => p.append('matches[]', String(m)));
    legs.forEach(([m, id]) => p.append('winner' + m, String(id)));
    p.append('bet_amount', String(amount));
    p.append('total_odds', String(line.O));
    p.append('winnings', String(Math.min(amount * line.O, MAX_WIN)));
    p.append('type', 'bet');
    // the form's own hidden fields (e.g. its security token), unless already set above
    hiddenFields(page.form).forEach(([k, v]) => { if (!p.has(k)) p.append(k, v); });
    return { params: p, ok: legs.every(l => l[1] > 0) && legs.length > 0 };
  }
  function betEndpoint(form) {
    const a = form && form.getAttribute('action');
    if (a && /process_foodclub/i.test(a)) { try { return new URL(a, location.href).href; } catch (_) {} }
    return new URL(BET_ENDPOINT, location.href).href;
  }
  function newTabUrl(page, line, amount) {
    const b = betParams(page, line, amount);
    return new URL(BET_ENDPOINT, location.href).href + '?' + b.params.toString();
  }
  // what Neopets answered: 'ok', 'fail' (+ message) or 'sent' (no clear answer — check Current Bets)
  function readBetAnswer(html, finalUrl) {
    let text = '', errText = '', okText = '';
    try {
      const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      const err = doc.querySelector('#fc-bet-error, .fc-notice--error, .fc-error, .errorMessage, .errorOuter, .error-message');
      errText = err ? String(err.textContent || '').replace(/\s+/g, ' ').trim() : '';
      const pop = doc.querySelector('#fc-placed-popup, .fc-placed-popup');
      okText = pop ? String(pop.textContent || '') : '';
      const main = doc.querySelector('#content, .content, main') || doc.body;
      text = String((main && main.textContent) || '').replace(/\s+/g, ' ');
    } catch (_) { text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }
    const badRe = /(already placed|not enough neopoints|don'?t have enough|cannot place|can'?t place|could not place|invalid bet|bets? (are|is) closed|betting is closed|only place up to|maximum of 10|too many bets|you must select|error)/i;
    if (errText && badRe.test(errText)) return { kind: 'fail', msg: errText.slice(0, 160) };
    if (/successfully placed|bet has been placed|your bet was placed/i.test(okText + ' ' + text)) return { kind: 'ok' };
    if (/type=current|tab=current|current_bets/i.test(String(finalUrl || ''))) return { kind: 'ok' };
    const bodyBad = /(already placed (this|that|the same|all)|you have already placed|not enough neopoints|don'?t have enough neopoints|cannot place|can'?t place (a|this|that|any)|could not place|invalid bet|bets? (are|is) (now )?closed|betting is closed|maximum of 10 bets|too many bets|you must select)/i;
    const m = bodyBad.exec(text);
    if (m) {
      const i = Math.max(0, m.index - 60);
      return { kind: 'fail', msg: text.slice(i, m.index + 100).trim() };
    }
    return { kind: 'sent' };
  }
  let betBusy = false;
  async function placeInBackground(page, line, amount) {
    const b = betParams(page, line, amount);
    if (!b.ok) return { kind: 'fail', msg: 'pirate ids not found on the page' };
    let res;
    // Firefox: content.fetch sends it as the page itself (same cookies / referrer as the bet form); Chrome's
    // content-script fetch already does
    let send = fetch;
    try { if (typeof content !== 'undefined' && content && typeof content.fetch === 'function') send = content.fetch.bind(content); } catch (_) {}
    try {
      res = await send(betEndpoint(page.form), {
        method: 'POST', credentials: 'same-origin', redirect: 'follow',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        referrer: location.href,
        body: b.params.toString()
      });
    } catch (e) { return { kind: 'neterr', msg: 'could not send in the background' }; }
    if (!res || !res.ok) return { kind: 'neterr', msg: 'Neopets answered ' + (res ? res.status : '?') };
    let html = '';
    try { html = await res.text(); } catch (_) {}
    return readBetAnswer(html, res.url);
  }

  // ======================= the bet table panel =======================
  function pct3(p) { return (p * 100).toFixed(3) + '%'; }
  function pct1(p) { return (p * 100).toFixed(1) + '%'; }
  function planLoad(page) {
    const v = gmGet(PLAN_KEY, null);
    if (v && typeof v === 'object' && Number(v.round) === Number(page.round) && Number(v.maxBet) === Number(page.maxBet) && v.byStyle) return v;
    return { round: page.round, maxBet: page.maxBet, byStyle: {} };
  }
  function planSave(v) { gmSet(PLAN_KEY, v); }
  function saveBetsSnap(page, raw, lines) {
    try {
      gmSet(SNAP_KEY, {
        round: page.round, at: Date.now(),
        arenas: page.arenas.map(ar => ({ names: ar.pirates.map(p => p.name), odds: ar.pirates.map(p => p.odds) })),
        probs: raw,
        lines: (lines || []).map(l => ({ picks: l.picks, O: l.O, P: l.P, stake: l.stake }))
      });
    } catch (_) {}
  }
  let computing = false;
  // work out (or reuse) the chosen style's bets for this round
  async function ensurePlan(page, style, force) {
    const plan = planLoad(page);
    if (!force && plan.byStyle[style] && Array.isArray(plan.byStyle[style].lines) && plan.byStyle[style].lines.length) return plan.byStyle[style];
    const pr = await pageProbs(page);
    await new Promise(r => setTimeout(r, 30));   // let the "working out" text paint first
    const out = styleLines(style, pr.probs, pr.odds, page.maxBet, page.maxBets || 10, 1200);
    const entry = { lines: out.lines, probs: pr.probs, raw: pr.raw, src: pr.src, mode: out.mode, band: out.band, at: Date.now() };
    const p2 = planLoad(page);
    p2.byStyle[style] = entry;
    planSave(p2);
    saveBetsSnap(page, pr.raw, out.lines);
    return entry;
  }

  const CELL = 'padding:4px 6px;border-bottom:1px solid #1e293b;white-space:nowrap;';
  function panelShell() {
    const panel = document.createElement('div');
    panel.id = 'darthy-fc-panel';
    panel.style.cssText = 'margin:12px auto 16px;max-width:1100px;background:#0f172a;border:2px solid #fbbf24;border-radius:10px;padding:12px 14px;font-family:Verdana,Arial,sans-serif;color:#e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,.3);overflow-x:auto;';
    const cur = getStyle();
    panel.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<div style="font-size:15px;font-weight:bold;color:#fbbf24;flex:1 1 auto;">Food Club Bets <span id="darthy-fc-round" style="color:#94a3b8;font-size:12px;"></span></div>' +
        '<label style="font-size:12px;color:#cbd5e1;">Style <select id="darthy-fc-style" style="font:12px Verdana;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 6px;">' +
          STYLE_ORDER.map(id => '<option value="' + id + '"' + (id === cur ? ' selected' : '') + ' title="' + esc(STYLES[id].desc) + '">' + esc(STYLES[id].name) + '</option>').join('') +
        '</select></label>' +
        '<button id="darthy-fc-recalc" style="background:#334155;color:#e2e8f0;border:none;padding:5px 10px;border-radius:5px;font-size:12px;cursor:pointer;">Recalculate</button>' +
        '<button id="darthy-fc-copyplan" style="background:#4a90e2;color:#fff;border:none;padding:5px 10px;border-radius:5px;font-size:12px;font-weight:bold;cursor:pointer;">Copy Bets</button>' +
      '</div>' +
      '<div id="darthy-fc-desc" style="font-size:11px;color:#94a3b8;margin-bottom:4px;"></div>' +
      '<div id="darthy-fc-status" style="font-size:12px;color:#7dd3fc;margin-bottom:6px;"></div>' +
      '<div id="darthy-fc-table"></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:8px;font-size:11px;color:#94a3b8;">' +
        '<span id="darthy-fc-count"></span>' +
        '<label style="cursor:pointer;"><input type="checkbox" id="darthy-fc-newtab"' + (newTabMode() ? ' checked' : '') + '> Open each bet in a new tab instead of placing it in the background</label>' +
      '</div>';
    return panel;
  }
  function mountAtTop(panel) {
    // under the Plus-style block (FC tabs → FC Wrap Up → Copy Bets), above the bet form
    const after = document.getElementById('darthy-fc-copy-btn') || document.getElementById('darthy-fc-wins');
    if (after && after.parentNode) { after.insertAdjacentElement('afterend', panel); return; }
    const tabs = document.getElementById('fc-tabs') || document.querySelector('nav.fc-tabs');
    if (tabs && tabs.parentNode) { tabs.insertAdjacentElement('afterend', panel); return; }
    const form = document.getElementById('fc-bet-form');
    if (form && form.parentNode) { form.parentNode.insertBefore(panel, form); return; }
    const target = document.querySelector('.content') || document.body;
    target.prepend(panel);
  }
  function setPanelStatus(t) { const el = document.getElementById('darthy-fc-status'); if (el) el.textContent = t || ''; }

  function mountBetPanel() {
    if (document.getElementById('darthy-fc-panel')) return;
    const panel = panelShell();
    mountAtTop(panel);
    const sel = panel.querySelector('#darthy-fc-style');
    const desc = panel.querySelector('#darthy-fc-desc');
    const showDesc = () => { desc.textContent = STYLES[sel.value].desc; };
    showDesc();
    sel.onchange = () => { setStyle(sel.value); showDesc(); drawBets(false); };
    panel.querySelector('#darthy-fc-recalc').onclick = () => drawBets(true);
    panel.querySelector('#darthy-fc-newtab').onchange = (e) => gmSet(NEWTAB_KEY, !!e.target.checked);
    panel.querySelector('#darthy-fc-copyplan').onclick = (e) => copyPlan(e.target);
    drawBets(false);
  }

  let drawSeq = 0;
  async function drawBets(force) {
    const seq = ++drawSeq;
    const page = readBetPage();
    const box = document.getElementById('darthy-fc-table');
    if (!box) return;
    if (!pageOk(page)) { setPanelStatus('Waiting for this round\'s odds on the Place a Bet form…'); box.innerHTML = ''; return; }
    if (!(page.maxBet > 0)) { setPanelStatus('Could not read your max bet on the page.'); return; }
    const rEl = document.getElementById('darthy-fc-round');
    if (rEl) rEl.textContent = page.round ? '· Round ' + page.round + ' · max bet ' + fmtInt(page.maxBet) + ' NP' : '';
    const style = getStyle();
    if (computing && !force) return;
    computing = true;
    setPanelStatus('Working out the ' + STYLES[style].name + ' bets…');
    let entry;
    try { entry = await ensurePlan(page, style, force); }
    catch (e) { setPanelStatus('Could not work out the bets: ' + (e && e.message || e)); return; }
    finally { computing = false; }
    if (seq !== drawSeq || !document.getElementById('darthy-fc-table')) return;
    renderTable(page, style, entry);
  }

  function rowCells(page, line, amount) {
    const pay = Math.min(amount * line.O, MAX_WIN);
    return {
      pay, ne: amount * (line.ER - 1), maxbet: Math.ceil(MAX_WIN / line.O)
    };
  }
  function renderTable(page, style, entry) {
    const box = document.getElementById('darthy-fc-table');
    if (!box) return;
    const lines = entry.lines;
    const st = setStats(lines, entry.probs);
    const placed = placedLoad(page.round);
    setPanelStatus(STYLES[style].name + (entry.mode ? ' — ' + entry.mode : '') + ' · ' + lines.length + ' bet' + (lines.length === 1 ? '' : 's') +
      ' · bust ' + pct1(st.bust) + ' · profit ' + pct1(st.profit) + ' · double ' + pct1(st.d) + ' · triple ' + pct1(st.t) + ' · quad ' + pct1(st.q) +
      ' · TER ' + st.ter.toFixed(3));
    const th = (t, tip) => '<th style="' + CELL + 'text-align:left;color:#fbbf24;font-size:11px;"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + t + '</th>';
    let h = '<table id="darthy-fc-bets" style="border-collapse:collapse;font-size:12px;width:100%;">' +
      '<thead><tr>' + th('Bet #') + th('Amount') + th('Odds') + th('Payoff') + th('Prob.', 'Chance this bet wins (calibrated NeoFoodClub model)') +
      th('E.R.', 'Expected return: Prob. × Odds') + th('N.E.', 'Net expected NP: Amount × (E.R. − 1)') + th('Maxbet', 'Amount that reaches the 1,000,000 NP win cap') +
      ARENA_NAMES.map(a => th(a)).join('') + th('Submit') + '</tr></thead><tbody>';
    lines.forEach((l, i) => {
      const sig = pickStr(l.picks);
      const done = placed.bets[sig];
      const amt = Math.min(page.maxBet, l.stake || page.maxBet);
      const c = rowCells(page, l, amt);
      h += '<tr data-i="' + i + '" data-sig="' + sig + '" style="' + (done ? 'background:rgba(34,197,94,.15);' : '') + '">' +
        '<td style="' + CELL + 'font-weight:bold;">' + (i + 1) + '</td>' +
        '<td style="' + CELL + '"><input class="darthy-fc-amt" type="text" inputmode="numeric" value="' + amt + '" style="width:72px;font:12px Verdana;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 4px;"' + (done ? ' disabled' : '') + '></td>' +
        '<td style="' + CELL + '">' + l.O + ':1</td>' +
        '<td style="' + CELL + '" class="darthy-fc-pay">' + fmtInt(c.pay) + '</td>' +
        '<td style="' + CELL + '">' + pct3(l.P) + '</td>' +
        '<td style="' + CELL + '">' + l.ER.toFixed(3) + ':1</td>' +
        '<td style="' + CELL + '" class="darthy-fc-ne">' + c.ne.toFixed(2) + '</td>' +
        '<td style="' + CELL + '">' + fmtInt(c.maxbet) + '</td>' +
        ARENA_NAMES.map((_, k) => '<td style="' + CELL + (l.picks[k] ? 'color:#e2e8f0;' : '') + '">' + (l.picks[k] ? esc(shortName(page.arenas[k].pirates[l.picks[k] - 1].name)) : '') + '</td>').join('') +
        '<td style="' + CELL + '"><button class="darthy-fc-place" style="background:' + (done ? '#166534' : '#22c55e') + ';color:#fff;border:none;padding:4px 10px;border-radius:5px;font-size:12px;font-weight:bold;cursor:pointer;"' + (done ? ' disabled' : '') + '>' + (done ? 'Placed ✓' : 'Place bet!') + '</button>' +
        '<div class="darthy-fc-msg" style="font-size:10px;color:#94a3b8;max-width:220px;white-space:normal;">' + (done ? (done.how === 'current' ? 'on Current Bets' : done.how === 'newtab' ? 'opened in a new tab' : done.how === 'sent' ? 'sent — check Current Bets' : '') : '') + '</div></td>' +
      '</tr>';
    });
    h += '</tbody><tbody><tr style="font-weight:bold;color:#fbbf24;">' +
      '<td style="' + CELL + '">Total:</td><td style="' + CELL + '" id="darthy-fc-tot-amt"></td><td style="' + CELL + '"></td><td style="' + CELL + '"></td><td style="' + CELL + '"></td>' +
      '<td style="' + CELL + '" id="darthy-fc-tot-er">' + st.ter.toFixed(3) + '</td><td style="' + CELL + '" id="darthy-fc-tot-ne"></td>' +
      '<td style="' + CELL + '" colspan="7"></td></tr></tbody></table>';
    box.innerHTML = h;
    const table = box.querySelector('#darthy-fc-bets');
    const totals = () => {
      let amt = 0, ne = 0;
      table.querySelectorAll('tbody tr[data-i]').forEach(tr => {
        const l = lines[+tr.dataset.i];
        const a = parseNP(tr.querySelector('.darthy-fc-amt').value);
        amt += a; ne += a * (l.ER - 1);
      });
      table.querySelector('#darthy-fc-tot-amt').textContent = fmtInt(amt);
      table.querySelector('#darthy-fc-tot-ne').textContent = ne.toFixed(2);
    };
    table.querySelectorAll('tbody tr[data-i]').forEach(tr => {
      const i = +tr.dataset.i, l = lines[i];
      const inp = tr.querySelector('.darthy-fc-amt');
      inp.addEventListener('input', () => {
        let a = parseNP(inp.value);
        if (a > page.maxBet) a = page.maxBet;
        const c = rowCells(page, l, a);
        tr.querySelector('.darthy-fc-pay').textContent = fmtInt(c.pay);
        tr.querySelector('.darthy-fc-ne').textContent = c.ne.toFixed(2);
        totals();
      });
      inp.addEventListener('change', () => { let a = parseNP(inp.value); if (a > page.maxBet) a = page.maxBet; if (a < 1) a = 1; inp.value = String(a); inp.dispatchEvent(new Event('input')); });
      tr.querySelector('.darthy-fc-place').addEventListener('click', (e) => { e.preventDefault(); placeRow(tr, l, entry); });
    });
    totals();
    updateCount(page);
  }
  function placedCount(page) {
    const placed = placedLoad(page.round);
    return Math.max(Number(page.betsPlaced) || 0, Object.keys(placed.bets).length);
  }
  function updateCount(page) {
    const n = placedCount(page), max = page.maxBets || 10;
    const el = document.getElementById('darthy-fc-count');
    if (el) el.textContent = 'Bets placed this round: ' + n + ' / ' + max;
    if (n >= max) {
      document.querySelectorAll('#darthy-fc-bets .darthy-fc-place:not([disabled])').forEach(b => { b.disabled = true; b.textContent = 'Limit reached'; b.style.background = '#475569'; });
    }
  }
  function rowMsg(tr, html, color) { const m = tr.querySelector('.darthy-fc-msg'); if (m) { m.innerHTML = html; m.style.color = color || '#94a3b8'; } }
  function rowPlaced(tr, page, line, amount, how, note) {
    placedMark(page.round, line.picks, { stake: amount, how });
    addSpend(amount);
    histMarkPlaced(page, line, amount);
    const btn = tr.querySelector('.darthy-fc-place');
    btn.disabled = true; btn.textContent = how === 'sent' ? 'Sent ✓' : 'Placed ✓'; btn.style.background = '#166534';
    tr.querySelector('.darthy-fc-amt').disabled = true;
    tr.style.background = 'rgba(34,197,94,.15)';
    rowMsg(tr, note || '', '#86efac');
    updateCount(page);
  }
  // one click = one bet: locked while it is being sent, never re-sent for a row already placed
  async function placeRow(tr, line, entry) {
    const btn = tr.querySelector('.darthy-fc-place');
    if (betBusy || btn.disabled || tr.dataset.busy === '1') return;
    const page = readBetPage();
    if (!pageOk(page)) { rowMsg(tr, 'The bet form is not on the page any more — reload Place a Bet.', '#fca5a5'); return; }
    if (placedLoad(page.round).bets[pickStr(line.picks)]) {
      btn.disabled = true; btn.textContent = 'Placed ✓'; btn.style.background = '#166534'; rowMsg(tr, 'already placed this round', '#86efac'); return;
    }
    if (placedCount(page) >= (page.maxBets || 10)) { updateCount(page); return; }
    let amount = parseNP(tr.querySelector('.darthy-fc-amt').value);
    if (amount > page.maxBet) amount = page.maxBet;
    if (!(amount > 0)) { rowMsg(tr, 'Enter an amount.', '#fca5a5'); return; }
    betBusy = true; tr.dataset.busy = '1'; btn.disabled = true;
    try {
      if (newTabMode()) {
        window.open(newTabUrl(page, line, amount), '_blank');
        rowPlaced(tr, page, line, amount, 'newtab', 'opened in a new tab');
        return;
      }
      btn.textContent = 'Placing…';
      rowMsg(tr, '');
      const r = await placeInBackground(page, line, amount);
      if (r.kind === 'ok') { rowPlaced(tr, page, line, amount, 'bg', 'placed in the background'); return; }
      if (r.kind === 'sent') { rowPlaced(tr, page, line, amount, 'sent', 'sent — Neopets gave no clear answer, check Current Bets'); return; }
      const url = newTabUrl(page, line, amount);
      btn.disabled = false; btn.textContent = 'Retry';
      rowMsg(tr, esc(r.kind === 'neterr' ? 'Couldn\'t place it in the background (' + r.msg + ').' : 'Failed: ' + r.msg) +
        ' <a href="' + esc(url) + '" target="_blank" rel="noopener" class="darthy-fc-newtab-link" style="color:#7dd3fc;">Open in a new tab ↗</a>', '#fca5a5');
      const a = tr.querySelector('.darthy-fc-newtab-link');
      if (a) a.addEventListener('click', () => { const p2 = readBetPage() || page; setTimeout(() => rowPlaced(tr, p2, line, amount, 'newtab', 'opened in a new tab'), 0); });
    } finally {
      betBusy = false; tr.dataset.busy = '';
    }
  }
  function copyPlan(btn) {
    const page = readBetPage();
    const plan = page && planLoad(page);
    const entry = plan && plan.byStyle[getStyle()];
    if (!pageOk(page) || !entry) { alert('No bets worked out yet.'); return; }
    const arenas = page.arenas.map(ar => ({ names: ar.pirates.map(p => p.name), odds: ar.pirates.map(p => p.odds) }));
    const d = { round: page.round, arenas, probs: entry.raw, bets: entry.lines.map(l => ({ picks: l.picks, names: l.picks.map((s, k) => s ? arenas[k].names[s - 1] : ''), O: l.O, P: null, stake: l.stake })), names: [] };
    nfcRoundData(page.round).then(nfc => copyText(buildBetsText(d, nfc), btn, 'Copy Bets'));
  }

  // style picker only (Food Club front page, no bet form)
  function mountStylePanel() {
    if (document.getElementById('darthy-fc-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'darthy-fc-panel';
    panel.style.cssText = 'margin:12px auto 16px;max-width:820px;background:#1e293b;border:2px solid #fbbf24;border-radius:10px;padding:12px 16px;font-family:Verdana,Arial,sans-serif;color:#e2e8f0;';
    const cur = getStyle();
    panel.innerHTML = '<div style="font-size:15px;font-weight:bold;color:#fbbf24;margin-bottom:6px;">Food Club Styles</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px;">' +
      STYLE_ORDER.map(id => '<button data-style="' + id + '" title="' + esc(STYLES[id].desc) + '" style="' + (id === cur ? 'background:#fbbf24;color:#1e293b;' : 'background:#334155;color:#e2e8f0;') + 'border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:pointer;">' + esc(STYLES[id].name) + '</button>').join('') +
      '</div><div style="font-size:11px;color:#94a3b8;">Open <a href="' + FC_URL + '?tab=bet" style="color:#7dd3fc;">Place a Bet</a> to see this style\'s bets and place them.</div>';
    mountAtTop(panel);
    panel.querySelectorAll('button[data-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        setStyle(btn.dataset.style);
        panel.querySelectorAll('button[data-style]').forEach(b => { b.style.background = b === btn ? '#fbbf24' : '#334155'; b.style.color = b === btn ? '#1e293b' : '#e2e8f0'; });
      });
    });
  }

  // Plus "Original model" (used by Copy Bets when there is no NeoFoodClub round file, exactly as Plus)
  function makeArenaProbs(odds4) {
    const n = 4;
    const min = new Array(n), max = new Array(n), std = new Array(n);
    let minSum = 0, maxSum = 0;
    for (let i = 0; i < n; i++) {
      const od = odds4[i];
      let mn, mx;
      if (od === 13) { mn = 0; mx = 1 / 13; }
      else if (od === 2) { mn = 1 / 3; mx = 1; }
      else { mn = 1 / (1 + od); mx = 1 / od; }
      min[i] = mn; max[i] = mx;
      minSum += mn; maxSum += mx;
    }
    for (let i = 0; i < n; i++) {
      const mnO = min[i], mxO = max[i];
      min[i] = Math.max(mnO, 1 + mxO - maxSum);
      max[i] = Math.min(mxO, 1 + mnO - minSum);
      std[i] = (odds4[i] === 13) ? 0.05 : (min[i] + max[i]) / 2;
    }
    // Rectify-ish: push non-13 pirates so the four sum to 1 when possible.
    let sum = std.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-6) {
      const adj = [];
      for (let i = 0; i < n; i++) if (odds4[i] !== 13) adj.push(i);
      if (adj.length) {
        const pinned = sum - adj.reduce((s, i) => s + std[i], 0);
        const target = 1 - pinned;
        const cur = adj.reduce((s, i) => s + std[i], 0);
        if (cur > 0 && target > 0) {
          const scale = target / cur;
          for (const i of adj) std[i] = Math.max(min[i], Math.min(max[i], std[i] * scale));
          sum = std.reduce((a, b) => a + b, 0);
          if (Math.abs(sum - 1) > 0.02) {
            const p2 = sum - adj.reduce((s, i) => s + std[i], 0);
            const t2 = 1 - p2;
            const c2 = adj.reduce((s, i) => s + std[i], 0);
            if (c2 > 0) for (const i of adj) std[i] *= t2 / c2;
          }
        }
      }
    }
    return std;
  }
  function pct(p) { return (p * 100).toFixed(3) + '%'; }
  function padR(t, w) { t = String(t); return t.length >= w ? t : t + ' '.repeat(w - t.length); }
  function padL(t, w) { t = String(t); return t.length >= w ? t : ' '.repeat(w - t.length) + t; }
  // NeoFoodClub bets hash (crates/core/src/math.rs bet_indices_to_bets_hash) for a neofood.club link
  function nfcBetsHash(bets) {
    const flat = [];
    bets.forEach(b => b.picks.forEach(x => flat.push(Number(x) || 0)));
    if (bets.length & 1) flat.push(0);
    let h = '';
    for (let i = 0; i + 1 < flat.length; i += 2) h += String.fromCharCode(97 + flat[i] * 5 + flat[i + 1]);
    return h;
  }
  // payout table in units (1 unit per bet): every arena outcome, one winner per arena
  function unitChances(bets, probs) {
    const map = new Map();
    for (let o = 0; o < 1024; o++) {
      const w = [o & 3, (o >> 2) & 3, (o >> 4) & 3, (o >> 6) & 3, (o >> 8) & 3];
      let p = 1;
      for (let k = 0; k < 5; k++) p *= probs[k][w[k]];
      if (!(p > 0)) continue;
      let u = 0;
      for (const b of bets) {
        let ok = true;
        for (let k = 0; k < 5; k++) if (b.picks[k] && b.picks[k] - 1 !== w[k]) { ok = false; break; }
        if (ok) u += b.O;
      }
      map.set(u, (map.get(u) || 0) + p);
    }
    let cum = 0;
    return [...map.entries()].sort((x, y) => x[0] - y[0]).map(([u, p]) => {
      const tail = 1 - cum;   // P(units >= this row), as NeoFoodClub shows it
      cum += p;
      return { u, p, cum, tail };
    });
  }
  // choose probabilities: NFC opening odds (if NFC's pirates match this round's arenas), else saved odds
  function copyProbs(d, nfc) {
    if (!d.arenas) return null;
    if (nfc && nfc.openingOdds && nfc.pirates && Number(nfc.round) === Number(d.round) &&
        nfc.pirates.every((ids, k) => ids.every((id, i) => NFC_NAMES[id - 1] === shortName(d.arenas[k].names[i])))) {
      return { probs: nfc.openingOdds.map(a => nfcOriginal(a.slice(1, 5))), src: 'NeoFoodClub Original model, opening odds' };
    }
    if (d.arenas.every(a => a.odds && a.odds.length === 4 && a.odds.every(o => o > 0))) {
      return { probs: d.arenas.map(a => nfcOriginal(a.odds)), src: 'NeoFoodClub Original model, odds when Prime made the bets' };
    }
    return null;
  }
  function buildBetsText(d, nfc) {
    const bets = (d.bets || []).filter(b => b.picks.some(Boolean));
    const n = bets.length;
    const pr = copyProbs(d, nfc);
    const haveOdds = n > 0 && bets.every(b => b.O > 0);
    const chances = pr && haveOdds ? unitChances(bets, pr.probs) : null;
    const out = [];
    if (chances) {
      const bust = chances.filter(c => c.u === 0).reduce((x, c) => x + c.p, 0);
      const profit = chances.filter(c => c.u > n).reduce((x, c) => x + c.p, 0);
      const dbl = chances.filter(c => c.u >= 2 * n).reduce((x, c) => x + c.p, 0);
      const tri = chances.filter(c => c.u >= 3 * n).reduce((x, c) => x + c.p, 0);   // 1.8.40
      const quad = chances.filter(c => c.u >= 4 * n).reduce((x, c) => x + c.p, 0);
      out.push('Round ' + d.round + ': ' + pct(bust) + ' to bust | ' + pct(profit) + ' to profit | ' + pct(dbl) + ' to double | ' +
        pct(tri) + ' to triple | ' + pct(quad) + ' to quad');
    } else {
      out.push('Round ' + d.round + ' (no odds/probabilities for the chances)');
    }
    out.push('```');
    const head = [String(d.round), ...ARENA_NAMES, 'Odds'];
    const rows = bets.map((b, i) => [String(i + 1), ...ARENA_NAMES.map((_, k) => b.picks[k] ? shortName(b.names[k]) : ''), b.O > 0 ? b.O + ':1' : '']);
    const w = head.map((h, c) => Math.max(h.length, ...rows.map(r => r[c].length)));
    const line = r => r.map((t, c) => (c === 0 || c === 6) ? padL(t, w[c]) : padR(t, w[c])).join(' | ').replace(/\s+$/, '');
    out.push(line(head));
    out.push(w.map(x => '-'.repeat(x)).join('-+-'));
    rows.forEach(r => out.push(line(r)));
    if (chances) {
      const ter = bets.reduce((x, b) => { let p = 1; b.picks.forEach((s, k) => { if (s) p *= pr.probs[k][s - 1]; }); return x + p * b.O; }, 0);
      out.push('');
      out.push('TER: ' + ter.toFixed(3));
      out.push('');
      const ch = ['Odds', 'Probability', 'Cumulative', 'Tail'];
      const cr = chances.map(c => [c.u + ':' + n, pct(c.p), pct(c.cum), pct(c.tail)]);
      const cw = ch.map((h, c) => Math.max(h.length, ...cr.map(r => r[c].length)));
      const cl = r => r.map((t, c) => padL(t, cw[c])).join(' | ');
      out.push(cl(ch));
      out.push(cw.map(x => '-'.repeat(x)).join('-+-'));
      cr.forEach(r => out.push(cl(r)));
    }
    out.push('```');
    if (pr && chances) out.push('Probabilities: ' + pr.src);
    if (d.arenas && Number(d.round) > 0 && n && n <= 10) out.push('https://neofood.club/#round=' + Number(d.round) + '&b=' + nfcBetsHash(bets));
    out.push('Darthy Prime FC Bets');
    return out.join('\n');
  }
  function gatherBets(nfc) {
    const roundEl = document.querySelector('.fc-round-pill, .fc-round__status, [class*="round"]');
    let round = 'Unknown';
    if (roundEl) {
      const m = /Round\s*(\d+)/i.exec(roundEl.textContent || '');
      if (m) round = m[1];
    }
    // "Bet n: pirates" lines from Current Bets (no longer copied in 1.8.39; still used to find the bets)
    const names = [];
    const pageRows = [];
    const rows = document.querySelectorAll('#fc-cb-table .fc-cb-row, .fc-cb-row');
    rows.forEach((row, i) => {
      const pirates = [...row.querySelectorAll('.fc-cb-leg__pirate')]
        .map(el => el.textContent.trim()).filter(Boolean);
      if (pirates.length) {
        names.push('Bet ' + (i + 1) + ': ' + pirates.join(', '));
        const oddsEl = row.querySelector('.fc-cb-cell--odds, [data-label="Odds"]');
        const om = oddsEl && /(\d+)\s*:\s*1/.exec(oddsEl.textContent || '');
        const amtEl = row.querySelector('.fc-cb-cell--amount, [data-label="Bet Amount"], [data-label="Amount"]');
        // arena of each leg, if the leg shows it (used only when no odds data is stored)
        const legArena = [...row.querySelectorAll('.fc-cb-leg__pirate')].map(el => {
          const t = ((el.closest('.fc-cb-leg') || el.parentElement || el).textContent || '');
          return ARENA_NAMES.findIndex(a => new RegExp(a, 'i').test(t));
        });
        pageRows.push({ pirates, legArena, O: om ? Number(om[1]) : 0, stake: amtEl ? (parseInt(String(amtEl.textContent || '').replace(/[^\d]/g, ''), 10) || 0) : 0 });
      }
    });
    let snap = gmGet(SNAP_KEY, null);
    const pr = Number(round) || 0;
    if (snap && pr && Number(snap.round) !== pr) snap = null;
    let arenas = snap && snap.arenas, probs = snap && snap.probs;
    if (!arenas) {
      const page = readBetPage();
      if (page && page.arenas.length === 5 && page.arenas.every(a => a.pirates.length === 4 && a.pirates.every(p => p.odds > 0))) {
        arenas = page.arenas.map(ar => ({ names: ar.pirates.map(p => p.name), odds: ar.pirates.map(p => p.odds) }));
        probs = arenas.map(a => makeArenaProbs(a.odds));
        if (round === 'Unknown' && page.round) round = String(page.round);
      }
    }
    if (!arenas && nfc && nfc.pirates && nfc.currentOdds && (!pr || Number(nfc.round) === pr)) {
      // 1.8.39: no saved data / bet form — use NeoFoodClub's round data for names and odds
      arenas = nfc.pirates.map((ids, k) => ({ names: ids.map(id => NFC_NAMES[id - 1] || ''), odds: nfc.currentOdds[k].slice(1, 5) }));
      probs = arenas.map(a => makeArenaProbs(a.odds));
      if (round === 'Unknown' && nfc.round) round = String(nfc.round);
    }
    const lc = t => String(t || '').trim().toLowerCase();
    const mkBet = (picks, O, stake) => {
      const nm = picks.map((s, k) => (s && arenas) ? arenas[k].names[s - 1] : '');
      let P = null;
      if (probs) { P = 1; picks.forEach((s, k) => { if (s) P *= probs[k][s - 1]; }); }
      if (!(O > 0) && arenas) { O = 1; picks.forEach((s, k) => { if (s) O *= arenas[k].odds[s - 1]; }); }
      return { picks, names: nm, O, P, stake: stake || 0 };
    };
    let bets = [];
    if (pageRows.length && arenas) {
      // map Current Bets pirate names back to arenas / slots
      bets = pageRows.map(r => {
        const picks = [0, 0, 0, 0, 0];
        r.pirates.forEach(n => {
          for (let k = 0; k < 5; k++) { const i = arenas[k].names.findIndex(x => lc(x) === lc(n) || shortName(x) === shortName(n)); if (i >= 0 && !picks[k]) { picks[k] = i + 1; break; } }
        });
        const sl = snap && snap.lines && snap.lines.find(l => l.picks.join() === picks.join());
        return mkBet(picks, r.O || (sl && sl.O) || 0, r.stake || (sl && sl.stake) || 0);
      });
      if (bets.some(b => b.picks.filter(Boolean).length !== pageRows[bets.indexOf(b)].pirates.length)) bets = [];
    }
    if (!bets.length && snap && snap.lines && snap.lines.length) bets = snap.lines.map(l => mkBet(l.picks, l.O, l.stake));
    if (!bets.length && pageRows.length) {
      // no odds / arena data at all: names only, Win % n/a
      bets = pageRows.map(r => {
        const picks = [0, 0, 0, 0, 0], nm = ['', '', '', '', ''];
        const known = r.legArena.every((a, i, arr) => a >= 0 && arr.indexOf(a) === i);
        r.pirates.forEach((n, i) => { const k = known ? r.legArena[i] : i; if (k < 5) { picks[k] = 1; nm[k] = n; } });
        return { picks, names: nm, O: r.O, P: null, stake: r.stake };
      });
      probs = null;
    }
    return { round, bets, arenas: arenas || null, probs: bets.length && bets.every(b => b.P != null) ? probs : null, names };
  }
  function roundOnPage() {
    const el = document.querySelector('.fc-round-pill, .fc-round__status, [class*="round"]');
    const m = el && /Round\s*(\d+)/i.exec(el.textContent || '');
    return m ? Number(m[1]) : 0;
  }
  function copyBetsToDiscord() {
    const btn = document.getElementById('darthy-fc-copy-btn');
    const round = roundOnPage() || Number((gmGet(SNAP_KEY, null) || {}).round) || 0;
    if (btn) btn.textContent = 'Copying…';
    nfcRoundData(round).then(nfc => {
      const d = gatherBets(nfc);
      if (btn) btn.textContent = 'Copy Bets';
      if (!d.bets.length && !d.names.length) {
        alert('No bets found on this page to copy.');
        return;
      }
      const text = buildBetsText(d, nfc);
      navigator.clipboard.writeText(text).then(() => {
        if (btn) { const t = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = t, 1500); }
      }).catch(() => {
        prompt('Copy this:', text);
      });
    });
  }
  function chromeLocal() {
    try { return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) ? chrome.storage.local : null; }
    catch (_) { return null; }
  }
  function normHist(h) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) h = {};
    if (!h.v) h.v = 1;
    if (!h.rounds || typeof h.rounds !== 'object') h.rounds = {};
    if (!Array.isArray(h.collects)) h.collects = [];
    if (!Array.isArray(h.legacy)) h.legacy = [];
    return h;
  }
  function histLoad() {
    const cl = chromeLocal();
    if (!cl) return Promise.resolve(normHist(gmGet(HIST_KEY, null)));
    return new Promise((res, rej) => {
      try {
        cl.get(HIST_KEY, o => {
          let err = null;
          try { err = chrome.runtime.lastError; } catch (_) {}
          if (err) { rej(err); return; }   // never write over the history after a failed read
          res(normHist(o && o[HIST_KEY]));
        });
      } catch (e) { rej(e); }
    });
  }
  function histSave(h) {
    const cl = chromeLocal();
    if (!cl) { gmSet(HIST_KEY, h); return Promise.resolve(); }
    return new Promise(res => { try { cl.set({ [HIST_KEY]: h }, () => res()); } catch (_) { res(); } });
  }
  let histQ = Promise.resolve();
  // read → change → write, one at a time in this tab; fn returns false to skip the write
  function histUpdate(fn) {
    const p = histQ.then(async () => {
      const h = await histLoad();
      if (fn(h) === false) return h;
      await histSave(h);
      return h;
    }).catch(() => null);
    histQ = p;
    return p;
  }
  function pirateIdsFromNames(lists) {
    try {
      const ids = lists.map(names => names.map(n => NFC_NAMES.indexOf(shortName(n)) + 1));
      return ids.length === 5 && ids.every(a => a.length === 4 && a.every(x => x > 0)) ? ids : null;
    } catch (_) { return null; }
  }
  // the bets that count for a round: the confirmed ones; when all 10 were confirmed on the page, the plan
  function roundBets(rec) {
    const b = Array.isArray(rec.b) ? rec.b : [];
    const placed = b.filter(x => x[3]);
    if (!rec.full) return placed;
    const n = Number(rec.n) || 10;
    return placed.concat(b.filter(x => !x[3])).slice(0, n);
  }
  function resolveRound(rec, w) {
    const bets = roundBets(rec);
    let ids = null;
    if (rec.pids && w.pirates && rec.pids.every((a, k) => w.pirates[k] && a.slice().sort().join() === w.pirates[k].slice().sort().join())) ids = rec.pids;
    const winId = ids ? w.winners.map((x, k) => w.pirates[k][x - 1]) : null;
    let u = 0, np = 0, cost = 0;
    const won = [];
    bets.forEach(b => {
      cost += b[2];
      let ok = true;
      for (let k = 0; k < 5; k++) {
        const s = Number(b[0][k]) || 0;
        if (!s) continue;
        if (ids ? ids[k][s - 1] !== winId[k] : s !== w.winners[k]) { ok = false; break; }
      }
      if (ok) { u += b[1]; np += Math.min(b[2] * b[1], MAX_WIN); won.push(b[0]); }
    });
    rec.w = w.winners.slice();
    rec.nb = bets.length;
    rec.u = u;
    rec.np = np;
    rec.cost = cost;
    rec.won = won;
    rec.bust = bets.length > 0 && u === 0 ? 1 : 0;
    rec.res = 1;
    rec.resAt = Date.now();
    if (!ids && rec.pids) rec.note = 'pirate list differs from NeoFoodClub; matched by slot';
  }
  // winners from NeoFoodClub's public round file (no Neopets request, not cached with the Copy Bets data)
  function fetchWinners(round) {
    const r = Number(round) || 0;
    if (!r || typeof fetch !== 'function') return Promise.resolve(null);
    let ctl = null;
    try { ctl = new AbortController(); setTimeout(() => { try { ctl.abort(); } catch (_) {} }, 6000); } catch (_) {}
    return fetch('https://cdn.neofood.club/rounds/' + r + '.json', { credentials: 'omit', cache: 'no-cache', signal: ctl ? ctl.signal : undefined })
      .then(res => res.ok ? res.json() : null)
      .then(j => {
        if (!j || Number(j.round) !== r || !Array.isArray(j.winners) || j.winners.length !== 5 || !j.winners.every(x => x >= 1 && x <= 4)) return null;
        return { round: r, winners: j.winners.map(Number), pirates: Array.isArray(j.pirates) ? j.pirates : null };
      })
      .catch(() => null);
  }
  let histBusy = false;
  // migrate once, then look up results for finished rounds (at most every 20 min, or right away on FC pages)
  async function histMaintain(force) {
    if (histBusy) return null;
    histBusy = true;
    try {
      await histMigrate();
      const last = Number(gmGet(HIST_CHECK_KEY, 0)) || 0;
      if (!force && Date.now() - last < 20 * 60000) return null;
      gmSet(HIST_CHECK_KEY, Date.now());
      const h = await histLoad();
      const today = nstDate().slice(1);
      const ended = Object.values(h.rounds).filter(x => !x.res && x.d && x.d < today).sort((a, b) => a.r - b.r);
      const noBets = ended.filter(x => !roundBets(x).length);
      const pend = ended.filter(x => roundBets(x).length && (x.tries || 0) < 60).slice(0, 12);
      if (!pend.length && !noBets.length) return h;
      const got = {};
      for (const p of pend) got[p.r] = await fetchWinners(p.r);
      return await histUpdate(h2 => {
        noBets.forEach(p => { const rec = h2.rounds[p.r]; if (rec && !rec.res) { rec.res = 1; rec.nb = 0; rec.u = 0; rec.np = 0; rec.cost = 0; rec.note = 'no bets confirmed'; } });
        pend.forEach(p => {
          const rec = h2.rounds[p.r];
          if (!rec || rec.res) return;
          if (got[p.r]) resolveRound(rec, got[p.r]);
          else rec.tries = (rec.tries || 0) + 1;
        });
      });
    } catch (_) { return null; }
    finally { histBusy = false; }
  }
  // ---- periods: NST weeks (Monday–Sunday, like the old Weekly Wins), calendar months, calendar quarters ----
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  function dUTC(d) { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); }
  function dAdd(d, n) { return new Date(dUTC(d) + n * 86400000).toISOString().slice(0, 10); }
  function dDiff(a, b) { return Math.round((dUTC(b) - dUTC(a)) / 86400000); }
  function periodKey(kind, d) {
    if (kind === 'week') { const wd = new Date(dUTC(d)).getUTCDay(); return dAdd(d, -((wd + 6) % 7)); }
    if (kind === 'month') return d.slice(0, 7);
    return d.slice(0, 4) + '-Q' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);
  }
  function periodRange(kind, key) {
    if (kind === 'week') return { start: key, days: 7 };
    if (kind === 'month') {
      const y = +key.slice(0, 4), m = +key.slice(5, 7);
      return { start: key + '-01', days: new Date(Date.UTC(y, m, 0)).getUTCDate() };
    }
    const y = +key.slice(0, 4), q = +key.slice(6);
    const start = y + '-' + String((q - 1) * 3 + 1).padStart(2, '0') + '-01';
    return { start, days: Math.round((Date.UTC(y, q * 3, 1) - Date.UTC(y, (q - 1) * 3, 1)) / 86400000) };
  }
  function periodLabel(kind, key) {
    if (kind === 'week') { const e = dAdd(key, 6); return 'Week of ' + (+key.slice(8)) + ' ' + MON[+key.slice(5, 7) - 1] + ' – ' + (+e.slice(8)) + ' ' + MON[+e.slice(5, 7) - 1] + ' ' + e.slice(0, 4); }
    if (kind === 'month') return MON[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4);
    const q = +key.slice(6);
    return 'Q' + q + ' ' + key.slice(0, 4) + ' (' + MON[(q - 1) * 3] + '–' + MON[q * 3 - 1] + ')';
  }
  const KIND_TITLE = { week: 'Weekly Bets Wrap Up', month: 'Monthly Bets Wrap Up', quarter: 'Quarterly Wrap Up' };
  function periodList(h, kind) {
    const keys = new Set([periodKey(kind, nstDate().slice(1))]);
    Object.values(h.rounds).forEach(x => { if (x.d) keys.add(periodKey(kind, x.d)); });
    h.collects.concat(h.legacy).forEach(x => { if (x.d) keys.add(periodKey(kind, x.d)); });
    return [...keys].sort().reverse();
  }
  function fmtNP(n) {
    n = Number(n) || 0;
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(abs >= 1e10 ? 0 : 2).replace(/\.0+$/, '') + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e7 ? 0 : 2).replace(/\.0+$/, '') + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }
  function wrapStats(h, kind, key) {
    const range = periodRange(kind, key);
    const inP = x => x.d && periodKey(kind, x.d) === key;
    const all = Object.values(h.rounds).filter(inP);
    const recs = all.filter(x => x.res && x.nb > 0).sort((a, b) => a.r - b.r);
    const pending = all.filter(x => !x.res && roundBets(x).length).length;
    const subs = recs.length, bets = recs.reduce((s, x) => s + x.nb, 0);
    const units = recs.reduce((s, x) => s + (x.u || 0), 0);
    const busts = recs.filter(x => !(x.u > 0)).length;
    const npWon = recs.reduce((s, x) => s + (x.np || 0), 0), spent = recs.reduce((s, x) => s + (x.cost || 0), 0);
    let best = null;
    recs.forEach(x => { if (x.u > 0 && (!best || x.u > best.u)) best = x; });
    const today = nstDate().slice(1);
    const collected = h.collects.concat(h.legacy).filter(inP).reduce((s, x) => s + (Number(x.np) || 0), 0);
    // cumulative ROI at the end of each day of the period (null before the first round / after today)
    const series = [];
    let cu = 0, cb = 0, j = 0;
    for (let i = 0; i < range.days; i++) {
      const day = dAdd(range.start, i);
      while (j < recs.length && recs[j].d <= day) { cu += recs[j].u || 0; cb += recs[j].nb; j++; }
      series.push(day > today ? null : (cb ? cu / cb : null));
    }
    return {
      kind, key, label: periodLabel(kind, key), range, subs, bets, units, busts, npWon, spent, profit: npWon - spent,
      roi: bets ? units / bets : 0, best: best ? { u: best.u, r: best.r, ago: Math.max(0, dDiff(dAdd(best.d, 1), today)) } : null,
      collected, pending, series
    };
  }
  function agoText(n) { return n <= 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago'; }
  function u2(n) { return Math.round(n * 100) / 100; }
  function chartSVG(st) {
    const W = 520, H = 200, L = 34, R = 92, T = 26, B = 24;
    const vals = st.series.filter(v => v != null);
    const peak = Math.max(0, ...vals);
    const yMax = Math.min(8, Math.max(3, Math.ceil(peak + 0.25)));   // 0–8 at most so 1x / 2x stay readable
    const step = 1;
    const n = st.range.days;
    const x = i => L + (W - L - R) * i / n, y = v => T + (H - T - B) * (1 - Math.min(v, yMax) / yMax);
    let g = '';
    for (let v = 0; v <= yMax; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#1e293b"/><text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" fill="#94a3b8" font-size="9" text-anchor="end">' + v + '</text>';
    const every = n <= 7 ? 1 : n <= 31 ? 5 : 15;
    for (let i = 0; i <= n; i += every) g += '<text x="' + x(i) + '" y="' + (H - B + 13) + '" fill="#94a3b8" font-size="9" text-anchor="middle">' + i + '</text>';
    let path = '', first = -1, lastI = -1;
    st.series.forEach((v, i) => {
      if (v == null) return;
      if (first < 0) { first = i; path = 'M' + x(i) + ',' + y(0) + ' L' + x(i) + ',' + y(v); }
      else path += ' L' + x(i) + ',' + y(v);
      path += ' L' + x(i + 1) + ',' + y(v);
      lastI = i;
    });
    const area = first >= 0 ? '<path d="' + path + ' L' + x(lastI + 1) + ',' + y(0) + ' Z" fill="rgba(34,211,238,0.35)" stroke="#22d3ee" stroke-width="1.5"/>' : '<text x="' + ((L + W - R) / 2) + '" y="' + (H / 2) + '" fill="#64748b" font-size="11" text-anchor="middle">No finished rounds yet</text>';
    const ref = (v, c, t) => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + c + '" stroke-width="2"' + (v === 2 ? ' stroke-dasharray="6 3"' : '') + '/><text x="' + (W - R + 6) + '" y="' + (y(v) + 3) + '" fill="' + c + '" font-size="10">' + t + '</text>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;background:#0b1220;border-radius:6px;">' +
      '<text x="' + (W / 2) + '" y="16" fill="#e2e8f0" font-size="12" font-weight="bold" text-anchor="middle">Total ROI for ' + st.label + '</text>' +
      g + area + ref(2, '#22c55e', 'Double Profit') + ref(1, '#ef4444', 'Break Even') +
      (peak > yMax ? '<text x="' + (W - R + 6) + '" y="' + (T + 4) + '" fill="#94a3b8" font-size="9">▲ peak ' + peak.toFixed(2) + '</text>' : '') +
      '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 1) + '" fill="#64748b" font-size="9" text-anchor="middle">day</text></svg>';
  }
  // text chart for Discord: columns = days (weekly 3 chars a day, quarterly 2 days a column)
  function chartText(st) {
    const days = st.range.days, per = days > 62 ? 2 : 1, cw = days <= 7 ? 3 : 1;
    const cols = [];
    for (let i = 0; i < days; i += per) {
      let v = null;
      for (let k = i; k < Math.min(days, i + per); k++) if (st.series[k] != null) v = st.series[k];
      for (let c = 0; c < cw; c++) cols.push(v);
    }
    const vals = cols.filter(v => v != null);
    const mx = Math.max(0, ...vals);
    // 0–4 or 0–8 so the 1x / 2x lines always show; anything higher is cut off with ▲ on top
    const H = 8, step = mx <= 4 ? 0.5 : 1;
    const yMax = H * step;
    const out = ['Total ROI for ' + st.label];
    for (let r = 0; r < H; r++) {
      const top = yMax - r * step, bot = top - step;
      let row = '';
      cols.forEach(v => {
        if (v != null && r === 0 && v > yMax + 1e-9) row += '▲';
        else if (v != null && v >= top - 1e-9) row += '█';
        else if (v != null && v - bot >= step / 2) row += '▄';
        else if (Math.abs(top - 2) < 1e-9) row += '=';
        else if (Math.abs(top - 1) < 1e-9) row += '-';
        else row += ' ';
      });
      const tag = Math.abs(top - 2) < 1e-9 ? '  2x Double Profit' : Math.abs(top - 1) < 1e-9 ? '  1x Break Even' : '';
      out.push((padL(String(u2(top)), 4) + ' ┤' + row + tag).replace(/\s+$/, ''));
    }
    out.push(padL('0', 4) + ' └' + '─'.repeat(cols.length) + (mx > yMax ? '  ▲ = above ' + yMax + ' (peak ' + mx.toFixed(2) + ')' : ''));
    let axis = '';
    if (days <= 7) axis = DOW.map(t => padR(t, 3)).join('');
    else if (days <= 31) { for (let i = 0; i < days; i++) { const lab = (i === 0 || (i + 1) % 5 === 0) ? String(i + 1) : ''; if (lab && axis.length <= i) axis = padR(axis, i) + lab; } }
    else { for (let m = 0; m < 3; m++) { const start = dAdd(st.range.start, 0).slice(0, 5) + String(+st.range.start.slice(5, 7) + m).padStart(2, '0') + '-01'; const col = Math.floor(dDiff(st.range.start, start) / per); axis = padR(axis, col) + MON[+start.slice(5, 7) - 1]; } }
    out.push('      ' + axis.replace(/\s+$/, ''));
    return out.join('\n');
  }
  function wrapText(st) {
    const out = [];
    out.push('📊 **FC ' + KIND_TITLE[st.kind] + ' — ' + st.label + '**');
    out.push('📈 **ROI: ' + st.roi.toFixed(3) + '**' + (st.subs ? (st.roi >= 2 ? '  (double profit)' : st.roi >= 1 ? '  (in profit)' : '  (below break even)') : ''));
    out.push('🎟️ Subs: ' + st.subs);
    out.push('💥 Busts: ' + st.busts + ' (' + (st.subs ? (st.busts / st.subs * 100).toFixed(2) : '0.00') + '%)');
    out.push('🏆 Highest Win: ' + (st.best ? u2(st.best.u) + ' units — Round ' + st.best.r + ', ' + agoText(st.best.ago) : '—'));
    out.push('💰 Total Won: ' + u2(st.units) + ' units' + (st.bets ? ' from ' + st.bets + ' bets' : ''));
    out.push('🪙 NP: ' + fmtNP(st.npWon) + ' won · ' + fmtNP(st.spent) + ' spent · ' + (st.profit >= 0 ? '+' : '') + fmtNP(st.profit) + ' profit');
    if (st.collected > 0) out.push('📦 Collect All paid: ' + fmtNP(st.collected) + ' NP');
    if (st.pending) out.push('⏳ Waiting on results: ' + st.pending + ' round' + (st.pending === 1 ? '' : 's'));
    out.push('```');
    out.push(chartText(st));
    out.push('```');
    out.push('Darthy Prime FC Wrap Up');
    return out.join('\n');
  }
  function statsHTML(st) {
    const cell = (k, v, c) => '<div style="flex:1 1 30%;min-width:140px;background:#111827;border-radius:6px;padding:5px 7px;text-align:left;"><div style="font-size:10px;color:#94a3b8;">' + k + '</div><div style="font-size:13px;font-weight:bold;color:' + (c || '#e2e8f0') + ';">' + v + '</div></div>';
    const roiC = !st.subs ? '#e2e8f0' : st.roi >= 2 ? '#22c55e' : st.roi >= 1 ? '#22d3ee' : '#f87171';
    return '<div style="font-weight:bold;color:#e2e8f0;margin:6px 0 4px;">' + st.label + ' Stats — ROI: <span style="color:' + roiC + ';">' + st.roi.toFixed(3) + '</span></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">' +
      cell('Subs', st.subs) +
      cell('Busts', st.busts + ' (' + (st.subs ? (st.busts / st.subs * 100).toFixed(2) : '0.00') + '%)', '#f87171') +
      cell('Highest Win', st.best ? u2(st.best.u) + ' units<span style="font-weight:normal;color:#94a3b8;font-size:10px;"> · R' + st.best.r + ' · ' + agoText(st.best.ago) + '</span>' : '—', '#facc15') +
      cell('Total Won', u2(st.units) + ' units', '#22d3ee') +
      cell('NP won / spent', fmtNP(st.npWon) + ' / ' + fmtNP(st.spent)) +
      cell('NP profit', (st.profit >= 0 ? '+' : '') + fmtNP(st.profit), st.profit >= 0 ? '#4ade80' : '#f87171') +
      '</div>' +
      ((st.collected > 0 || st.pending) ? '<div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">' +
        (st.collected > 0 ? 'Collect All paid ' + fmtNP(st.collected) + ' NP' : '') + (st.collected > 0 && st.pending ? ' · ' : '') +
        (st.pending ? st.pending + ' round' + (st.pending === 1 ? '' : 's') + ' waiting on results' : '') + '</div>' : '') +
      chartSVG(st);
  }
  function copyText(text, btn, label) {
    const done = () => { if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = label; }, 1500); } };
    try {
      navigator.clipboard.writeText(text).then(done).catch(() => { prompt('Copy this:', text); });
    } catch (_) { prompt('Copy this:', text); }
  }
  // the old FC Weekly Wins panel, now "FC Wrap Up": same place, three dropdowns
  function mountWinsPanel() {
    if (document.getElementById('darthy-fc-wins')) return;
    const host = document.getElementById('fc-tabs') || document.querySelector('nav.fc-tabs') || document.body;
    const wrap = document.createElement('div');
    wrap.id = 'darthy-fc-wins';
    wrap.style.cssText = 'margin:10px auto;background:#0f172a;color:#e2e8f0;border:1px solid #4a90e2;border-radius:8px;font:12px Verdana;max-width:560px;text-align:center;';
    const head = document.createElement('div');
    head.style.cssText = 'padding:6px 10px;font-weight:bold;cursor:pointer;color:#7dd3fc;';
    head.textContent = 'FC Wrap Up ▾';
    const body = document.createElement('div');
    body.style.cssText = 'display:none;padding:8px 10px;';
    const sections = {};
    ['week', 'month', 'quarter'].forEach(kind => {
      const det = document.createElement('details');
      det.className = 'darthy-fc-wrap';
      det.setAttribute('data-kind', kind);
      det.style.cssText = 'margin:6px 0;border:1px solid #1e293b;border-radius:8px;background:#020617;text-align:left;';
      const sum = document.createElement('summary');
      sum.textContent = KIND_TITLE[kind];
      sum.style.cssText = 'padding:6px 10px;cursor:pointer;font-weight:bold;color:#7dd3fc;';
      const inner = document.createElement('div');
      inner.style.cssText = 'padding:4px 10px 10px;text-align:center;';
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;gap:6px;justify-content:center;align-items:center;';
      const sel = document.createElement('select');
      sel.className = 'darthy-fc-wrap-sel';
      sel.style.cssText = 'font:11px Verdana;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:2px 4px;';
      const btn = document.createElement('button');
      btn.className = 'darthy-fc-wrap-copy';
      btn.textContent = 'Copy ' + KIND_TITLE[kind];
      btn.style.cssText = 'padding:4px 12px;background:#4a90e2;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:11px;';
      const view = document.createElement('div');
      view.className = 'darthy-fc-wrap-view';
      bar.appendChild(sel);
      bar.appendChild(btn);
      inner.appendChild(bar);
      inner.appendChild(view);
      det.appendChild(sum);
      det.appendChild(inner);
      body.appendChild(det);
      sections[kind] = { det, sel, btn, view, h: null, st: null };
      sel.onchange = () => draw(kind);
      det.addEventListener('toggle', () => { if (det.open) refresh(kind); });
      btn.onclick = () => {
        histLoad().then(h => { const st = wrapStats(h, kind, sel.value || periodKey(kind, nstDate().slice(1))); copyText(wrapText(st), btn, 'Copy ' + KIND_TITLE[kind]); }).catch(() => {});
      };
    });
    function draw(kind) {
      const s = sections[kind];
      if (!s.h) return;
      s.st = wrapStats(s.h, kind, s.sel.value);
      s.view.innerHTML = statsHTML(s.st);
    }
    function refresh(kind) {
      histLoad().then(h => {
        const s = sections[kind];
        s.h = h;
        const keys = periodList(h, kind);
        const cur = s.sel.value;
        s.sel.innerHTML = keys.map((k, i) => '<option value="' + k + '">' + periodLabel(kind, k) + (i === 0 && k === periodKey(kind, nstDate().slice(1)) ? ' (current)' : '') + '</option>').join('');
        s.sel.value = keys.includes(cur) ? cur : keys[0];
        draw(kind);
      }).catch(() => {});
    }
    wrap.__refresh = () => Object.keys(sections).forEach(k => { if (sections[k].det.open) refresh(k); });
    head.onclick = () => { body.style.display = body.style.display === 'none' ? 'block' : 'none'; };
    wrap.appendChild(head);
    wrap.appendChild(body);
    host.insertAdjacentElement('afterend', wrap);
  }
  async function wrapUpText(kind, key) {
    const h = await histLoad();
    return wrapText(wrapStats(h, kind, key || periodKey(kind, nstDate().slice(1))));
  }
  function readNP() {
    const el = document.getElementById('npanchor') || document.querySelector('.np-text__2020, #npanchor__2020, [id*="npanchor"]');
    const n = el ? parseInt(String(el.textContent || '').replace(/[^\d]/g, ''), 10) : 0;
    return n > 0 ? n : 0;
  }
  function pageCollectTotal(body) {
    const el = (body || document).querySelector('#fc-collect-total, .fc-collect-total, [data-collect-total]');
    if (el) {
      const n = parseInt(String(el.getAttribute('data-collect-total') || el.textContent || '').replace(/[^\d]/g, ''), 10);
      if (n > 0) return n;
    }
    const m = /total[^\d]{0,40}([\d,]{3,})\s*(?:NP|neopoints)/i.exec(((body || document.body).textContent || '').replace(/\s+/g, ' '));
    return m ? (parseInt(m[1].replace(/,/g, ''), 10) || 0) : 0;
  }
  function recordCollect(amount, rows) {
    const at = Date.now();
    // dated 12 h back so the Sunday collect lands in the week it was won
    const e = { at: at - 12 * 3600000, collectedAt: at, np: amount, bets: (rows || []).length, rounds: [...new Set((rows || []).map(r => r[0]).filter(Boolean))].map(Number) };
    e.d = ymdNST(e.at);
    histMigrate();   // queued first, so an old entry is never copied twice
    histUpdate(h => { h.collects.push(e); });
  }

  // 1.8.36: the Collect All button (#fc-collect-all); the old text match is kept as a fallback but
  // never matches the FC tab links (the "Collect Winnings" tab sits before the button on the page).
  function collectAllBtn() {
    const vis = el => !!el && el.offsetParent !== null && !el.disabled;
    const direct = document.getElementById('fc-collect-all') || document.querySelector('button.fc-collect-all, .fc-collect-all');
    if (direct && !direct.disabled) return direct;
    return [...document.querySelectorAll('button, input[type=submit], a, div[role=button]')].find(el => {
      if (el.closest('#fc-tabs, nav.fc-tabs, .fc-tabs') || el.hasAttribute('data-tab') || /[?&]tab=/i.test(el.getAttribute('href') || '')) return false;
      const t = (el.textContent || el.value || '').trim();
      return /collect/i.test(t) && !/calculator|possible|winnings calculator/i.test(t) && vis(el);
    }) || null;
  }

  // ---- 1.6.1: history glue for the non-Plus build ----
  // copy the old 1.6.0 wins list (darthy_fc_wins) into the history once (kept as it was)
  function histMigrate() {
    if (gmGet('darthy_fc_hist_migrated', 0)) return Promise.resolve(null);
    const old = getWins();
    return histUpdate(h => {
      if (h.migrated) return false;
      old.forEach(w => {
        if (!w || !(Number(w.returns) > 0)) return;
        const at = Number(w.at) || 0;
        h.legacy.push({ at, d: at ? ymdNST(at) : '', np: Number(w.returns) || 0, type: 'win', bets: 1, rounds: (w.round ? [w.round] : []).map(Number).filter(Boolean) });
      });
      h.migrated = Date.now();
    }).then(h => { if (h && h.migrated) gmSet('darthy_fc_hist_migrated', h.migrated); return h; });
  }
  function histRound(h, round, page) {
    const r = Number(round) || 0;
    let rec = h.rounds[r];
    if (!rec) {
      rec = h.rounds[r] = { r, d: nstDate().slice(1), at: Date.now(), n: Number(page && page.maxBets) || 10, b: [], pids: null };
    }
    if (!rec.pids && page && page.arenas && page.arenas.length === 5) rec.pids = pirateIdsFromNames(page.arenas.map(ar => (ar.pirates || []).map(p => p.name)));
    return rec;
  }
  // a bet you placed from the table
  function histMarkPlaced(page, line, amount) {
    const r = Number(page && page.round) || 0;
    if (!r || !line) return;
    const s = pickStr(line.picks);
    histUpdate(h => {
      const rec = histRound(h, r, page);
      const b = rec.b.find(x => x[0] === s);
      if (b) { b[3] = 1; if (amount > 0) b[2] = amount; }
      else rec.b.push([s, Number(line.O) || 0, Number(amount) || 0, 1]);
    });
  }
  // Current Bets shows what is really placed: that list becomes the round's bets
  let lastCurrentSig = '';
  function syncCurrent() {
    let d;
    try { d = gatherBets(null); } catch (_) { return; }
    const r = Number(d && d.round) || 0;
    const bets = (d && d.bets || []).filter(b => b.picks && b.picks.some(Boolean) && d.arenas);
    if (!r || !bets.length) return;
    const sig = r + ':' + bets.map(b => pickStr(b.picks)).join(',');
    if (sig === lastCurrentSig) return;
    lastCurrentSig = sig;
    const v = placedLoad(r);
    bets.forEach(b => { const k = pickStr(b.picks); if (!v.bets[k]) v.bets[k] = { at: Date.now(), stake: b.stake || 0, how: 'current' }; });
    gmSet(PLACED_KEY, v);
    const page = { round: r, maxBets: 10, arenas: d.arenas.map(a => ({ pirates: a.names.map(n => ({ name: n })) })) };
    histUpdate(h => {
      const rec = histRound(h, r, page);
      const old = rec.b;
      rec.b = bets.map(b => {
        const s = pickStr(b.picks), o = old.find(x => x[0] === s);
        return [s, Number(b.O) || (o && o[1]) || 0, Number(b.stake) || (o && o[2]) || 0, 1];
      });
      rec.seen = Date.now();
    });
  }

  // ---- Collect All: what it really paid (you click it; this only watches) ----
  function collectScope() { return document.getElementById('fc-tab-body') || document.querySelector('[data-tab-panel="collect"]') || document.body; }
  function collectRows() {
    const scope = collectScope();
    let total = 0;
    const rows = [];
    (scope !== document.body ? scope : document).querySelectorAll('.fc-collect-row, .fc-cb-row').forEach(row => {
      const retEl = row.querySelector('[data-label="Total Payoffs"]') || row.querySelector('.fc-cb-cell--return, [data-label="Potential Returns"]');
      if (!retEl) return;
      const n = parseNP(retEl.textContent);
      if (n > 0) {
        total += n;
        const roundEl = row.querySelector('.fc-round-tag');
        rows.push([roundEl ? (roundEl.textContent || '').replace(/[^\d]/g, '') : '', [...row.querySelectorAll('.fc-cb-leg__pirate')].map(el => el.textContent.trim()).filter(Boolean), n]);
      }
    });
    return { total: total || pageCollectTotal(scope), rows };
  }
  function hookCollect() {
    const btn = collectAllBtn();
    if (!btn || btn.getAttribute('data-darthy-collect-hook') === '1') return;
    btn.setAttribute('data-darthy-collect-hook', '1');
    btn.addEventListener('click', () => {
      const s = collectRows();
      if (!(s.total > 0) && !s.rows.length) return;
      gmSet(COLLECT_PEND_KEY, { at: Date.now(), npBefore: readNP(), total: s.total, rows: s.rows });
    }, true);
  }
  // once the Collect tab shows nothing left to collect: count it (NP gained, else the listed total)
  function settleCollect() {
    const p = gmGet(COLLECT_PEND_KEY, null);
    if (!p || !p.at) return false;
    if (Date.now() - p.at > 30 * 60000) { gmSet(COLLECT_PEND_KEY, null); return false; }
    if (Date.now() - p.at < 1500) return false;
    const scope = collectScope();
    const text = (scope.textContent || '').replace(/\s+/g, ' ');
    const noneText = /do not have any winning bets|no winning bets|nothing to collect|collected all|have collected/i.test(text);
    const rows = (scope !== document.body ? scope : document).querySelectorAll('.fc-collect-row, .fc-cb-row');
    const live = [...rows].filter(r => { const e = r.querySelector('[data-label="Total Payoffs"]') || r.querySelector('.fc-cb-cell--return'); return e && parseNP(e.textContent) > 0; });
    if (!noneText && live.length) return false;
    const after = readNP();
    const delta = (p.npBefore > 0 && after > 0) ? after - p.npBefore : 0;
    const amount = delta > 0 ? delta : (Number(p.total) || 0);
    gmSet(COLLECT_PEND_KEY, null);
    if (!(amount > 0)) return false;
    addProfit(amount);
    recordCollect(amount, p.rows || []);
    const w = document.getElementById('darthy-fc-wins');
    setTimeout(() => { if (w && w.__refresh) w.__refresh(); }, 300);
    return true;
  }

  // ---- Copy Bets button (Current Bets tab) ----
  function mountCopyButton() {
    if (document.getElementById('darthy-fc-copy-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'darthy-fc-copy-btn';
    btn.textContent = 'Copy Bets';
    btn.style.cssText = 'display:block;margin:8px auto;padding:7px 18px;background:#4a90e2;color:#fff;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:13px;';
    btn.onclick = copyBetsToDiscord;
    // Prefer under the FC tabs
    const tabs = document.getElementById('fc-tabs') || document.querySelector('nav.fc-tabs');
    if (tabs) {
      tabs.insertAdjacentElement('afterend', btn);
      return;
    }
    const buffer = document.getElementById('navsub-buffer__2020');
    if (buffer) {
      buffer.appendChild(btn);
      return;
    }
    btn.style.position = 'fixed';
    btn.style.top = '70px';
    btn.style.right = '16px';
    btn.style.zIndex = '99999';
    document.body.appendChild(btn);
  }

  function clearPanels() {
    document.querySelectorAll('#darthy-fc-panel, #darthy-fc-wins, #darthy-fc-copy-btn').forEach(el => el.remove());
  }
  let lastTab = '';
  function refresh() {
    if (!onFC()) { clearPanels(); return; }
    const tab = currentTab();
    const hasForm = !!document.getElementById('fc-bet-form');
    const key = tab + (hasForm ? '+form' : '');
    if (key !== lastTab) { clearPanels(); lastTab = key; }
    // Copy Bets and FC Wrap Up exactly as Plus: on every Food Club tab, right under the FC tabs
    mountCopyButton();
    mountWinsPanel();
    if (tab === 'bet' && hasForm) mountBetPanel();
    else if (tab === 'bet' || tab === 'main') mountStylePanel();
    if (tab === 'current') syncCurrent();
    if (tab === 'collect') { hookCollect(); settleCollect(); }
  }

  window.DarthyPrimeFC = {
    styleLines, setStats, pickSet, nfcOriginal, calibrate, readBetAnswer, betParams, betEndpoint, newTabUrl,
    betsText: (nfc) => buildBetsText(gatherBets(nfc || null), nfc || null),
    wrapUpText, history: () => histLoad(), updateHistory: (force) => histMaintain(!!force),
    STYLES, GARRET_GOOD_ER
  };

  async function init() {
    if (!onFC()) return;
    try { if (window.DarthyPrimeStorage && window.DarthyPrimeStorage.ready) await window.DarthyPrimeStorage.ready; } catch (_) {}
    refresh();
    // FC Wrap Up: migrate once, then look up finished rounds' winners (cdn.neofood.club only, never Neopets)
    setTimeout(() => { histMaintain(true).then(() => { const w = document.getElementById('darthy-fc-wins'); if (w && w.__refresh) w.__refresh(); }).catch(() => {}); }, 1500);
    let lastHref = location.href, lastBody = '';
    setInterval(() => {
      const body = document.getElementById('fc-tab-body');
      const bodyKey = body ? (body.getAttribute('data-tab-panel') || '') + ':' + (body.children.length || 0) : '';
      if (location.href !== lastHref || bodyKey !== lastBody) { lastHref = location.href; lastBody = bodyKey; refresh(); }
    }, 350);
    setInterval(() => { if (currentTab() === 'collect') { hookCollect(); settleCollect(); } }, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
