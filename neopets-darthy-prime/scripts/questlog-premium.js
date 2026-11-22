/**
 * Daily Quest Log — highlight valuable premium rewards
 * https://www.neopets.com/questlog*
 */
(function () {
  'use strict';

  const LIST_KEY = 'darthy_ql_valuable';
  const DEFAULT_LIST = `Horace Stamp
Siliclast Stamp
Red Shoyru Stamp
Gruntharxx Stamp
Hilda the Hedgewitch Stamp
Second Hand Stamp
Petpetorium Stamp
Isca Maractite Coin
Pastel Paint Brush
Maraquan Paint Brush
Halloween Paint Brush
Texting Barbat Flip Phone
Woodland Paint Brush
Stealth Paint Brush
Candy Paint Brush
Plushie Paint Brush
Jhudora Stamp
Pink Paint Brush
Wraith Paint Brush
Mystery Island Paint Brush
Faerie Paint Brush
Ghost Paint Brush
Red Petpet Paint Brush
Tattoo Petpet Paint Brush
Ixi Woods
Toy Paint Brush
Darigan Petpet Paint Brush
Diadem of the Deep
Island Petpet Paint Brush
Shadow Paint Brush
Maraquan Petpet Paint Brush
Faerie Petpet Paint Brush
Yellow Petpet Paint Brush
Tyrannian Paint Brush
Mutant Petpet Paint Brush
Astral Constellation Frame
Spotted Paint Brush
Transparent Paint Brush
Relic Paint Brush
Spotted Petpet Paint Brush
Dimensional Paint Brush
Disco Petpet Paint Brush
Fire, Fire, Your Pants On Fire Paint Brush
Rainbow Flower
Spring Petpet Paint Brush
Steampunk Paint Brush
Get Off My Lawn Paint Brush
Negg Terrarium
Water Paint Brush
Eventide Paint Brush
Celestial Wayfarer Peophin Mane
Pirate Petpet Paint Brush
Oil Paint Brush
Black Petpet Paint Brush
White Petpet Paint Brush
Lost Desert Petpet Paint Brush
White Paint Brush
Marble Paint Brush
Stealthy Petpet Paint Brush
Water Petpet Paint Brush
Woodland Petpet Paint Brush
Zombie Paint Brush
Robot Petpet Paint Brush
Usuki Paint Brush
Fire Petpet Paint Brush
Grey Paint Brush
Skunk Paint Brush
Glowing Brain Tree Stamp
Peaceful Coexistence Stamp
Cliffhanger Stamp
Origami Paint Brush
Scurvy Island Stamp
Camouflage Paint Brush
Rainbow Petpet Paint Brush
Golden Paint Brush
Slorganic Chemistry
Vampire Pea
Kou-Jong Tile Stamp
Starry Petpet Paint Brush
Blue Petpet Paint Brush
Polka Dot Paint Brush
Rainbow Paint Brush
Chasm Beast Stamp
Hubrid Nox Commemorative Stamp
Electric Blue Paint Brush
Adorable Illusen Wig
Elephante Trunk Stew
Cancelled Stamp
Eventide Petpet Paint Brush
Scorchio Mummy Stamp
Sweet and Sour Negg
Ultra Icy Negg
Plushie Petpet Paint Brush
Bogie Berry
Ghost Petpet Paint Brush
Alien Aisha Myriad Stamp
Usukiland Stamp
Worm Stew
Maractite Petpet Paint Brush
Magical Blueberry Meerca Plushie
Tulah Kisner Acara Plushie
Mokti and Rikti Stamp
Peopatra Plushie
Magma Petpet Paint Brush
Halloween Petpet Paint Brush
Spotted Schnelly Plushie
Celestial Talisman Stamp
Strawberry Ice Cream Apple Lantern
Jewelled Scarab Stamp
Green Petpet Paint Brush
Grey Petpet Paint Brush
Hubrid Noxs Mountain Fortress Stamp
Snow Paint Brush
Swamp Gas Paint Brush
Elderly Petpet Paint Brush
Holiday Spoiled Neggnog
Crunchy Tooth Surprise
Disco Fever Paint Brush
Celestial Wayfarer Peophin Scarf
Brown Petpet Paint Brush
Tyrannian Petpet Paint Brush
Dusk Glade Draik Head
Red PaintBrush Collectable Charm
Eye of Mortog Soup
Purple Paint Brush
Pirate Paint Brush
Zombie Petpet Paint Brush
Orange Paint Brush
Thief Dagger
An Apple a Day? No Way!
Baseball Kacheek Stamp
Glaxi Plushie
Jalapeno Cheese Nightmare
Celestial Wayfarer Peophin Harness
Tasu Stamp
Handsome Prince Quiggle Powdered Crown
Pizza Pencil Case
Woodland Grundo Plushie`;

  function gmGet(k, fb) {
    try {
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(k, null);
        if (v !== null && v !== undefined) return v;
      }
    } catch (_) {}
    try {
      const r = localStorage.getItem('dp_' + k);
      return r === null ? fb : JSON.parse(r);
    } catch (_) { return fb; }
  }
  function gmSet(k, v) {
    try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (_) {}
    try { localStorage.setItem('dp_' + k, JSON.stringify(v)); } catch (_) {}
  }

  function getListText() {
    const v = gmGet(LIST_KEY, null);
    if (typeof v === 'string' && v.trim()) return v;
    return DEFAULT_LIST;
  }
  function setListText(t) { gmSet(LIST_KEY, String(t || '')); }
  function valuableSet() {
    const s = {};
    String(getListText()).split(/\r?\n/).forEach(line => {
      const n = line.trim().toLowerCase();
      if (n) s[n] = true;
    });
    return s;
  }

  function mountToNavBuffer(panelId, widthPx) {
    let host = document.getElementById('darthy-plus-nav-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'darthy-plus-nav-host';
      host.style.cssText = 'display:flex;justify-content:flex-end;align-items:flex-start;flex-wrap:wrap;gap:8px;padding:6px 12px 8px;box-sizing:border-box;width:100%;background:transparent;z-index:99990';
      const buffer = document.getElementById('navsub-buffer__2020');
      if (buffer && buffer.parentNode) buffer.parentNode.insertBefore(host, buffer.nextSibling);
      else document.body.appendChild(host);
    }
    let el = document.getElementById(panelId);
    if (el) return el;
    el = document.createElement('div');
    el.id = panelId;
    if (widthPx) el.style.width = widthPx + 'px';
    host.appendChild(el);
    return el;
  }

  function highlight() {
    const good = valuableSet();
    const cards = document.querySelectorAll('.ql-premium, .questlog-quest.ql-premium');
    const found = [];
    cards.forEach(card => {
      const label = card.querySelector('.ql-reward-label');
      const name = ((label && label.textContent) || '').trim();
      if (!name) return;
      const wrap = card.querySelector('.ql-reward, .ql-reward-img') || card;
      const isGood = !!good[name.toLowerCase()];
      wrap.style.border = isGood ? '3px solid #dc2626' : '3px solid transparent';
      wrap.style.borderRadius = '8px';
      wrap.style.padding = '3px';
      wrap.style.boxSizing = 'border-box';
      found.push({ name, good: isGood });
    });
    return found;
  }

  function createUI(found) {
    if (document.getElementById('darthy-ql-ui')) {
      const st = document.getElementById('ql-today-status');
      if (st && found && found.length) {
        st.innerHTML = found.map(f =>
          '<div style="margin:2px 0;">' +
          (f.good ? '<span style="color:#fca5a5;font-weight:bold;">GOOD</span>' : '<span style="color:#94a3b8;">skip</span>') +
          ' — ' + f.name + '</div>'
        ).join('');
      }
      return;
    }
    const c = mountToNavBuffer('darthy-ql-ui', 240);
    c.style.cssText += ';background:#3f1d1d;color:#fee2e2;border:2px solid #ef4444;padding:8px;border-radius:8px;font:12px Verdana;box-sizing:border-box;';
    const today = (found || []).map(f =>
      '<div style="margin:2px 0;">' +
      (f.good ? '<span style="color:#fca5a5;font-weight:bold;">GOOD</span>' : '<span style="color:#94a3b8;">skip</span>') +
      ' — ' + f.name + '</div>'
    ).join('') || '<div style="color:#fca5a5;">No premium item detected yet</div>';
    c.innerHTML =
      '<div style="font-weight:bold;color:#fecaca;margin-bottom:6px;">📜 Quest Log Premium</div>' +
      '<div id="ql-today-status" style="font-size:11px;margin-bottom:6px;">' + today + '</div>' +
      '<button id="ql-toggle" style="width:100%;padding:5px;background:#7f1d1d;color:#fee2e2;border:none;border-radius:5px;cursor:pointer;">Valuable list ▸</button>' +
      '<div id="ql-list-wrap" style="display:none;margin-top:6px;">' +
      '<div style="font-size:10px;color:#fecaca;margin-bottom:4px;">One item per line. Matching premium rewards get a red border.</div>' +
      '<textarea id="ql-valuable-ta" spellcheck="false" style="width:100%;height:150px;box-sizing:border-box;background:#1c1917;color:#fee2e2;border:1px solid #ef4444;border-radius:6px;padding:6px;font:11px Verdana;resize:vertical;"></textarea>' +
      '<button id="ql-save" style="width:100%;margin-top:6px;padding:6px;background:#b91c1c;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">Save list</button>' +
      '</div>';
    const ta = c.querySelector('#ql-valuable-ta');
    if (ta) ta.value = getListText();
    c.querySelector('#ql-toggle').onclick = function () {
      const w = document.getElementById('ql-list-wrap');
      const open = w.style.display !== 'none';
      w.style.display = open ? 'none' : 'block';
      this.textContent = open ? 'Valuable list ▸' : 'Valuable list ▾';
    };
    c.querySelector('#ql-save').onclick = function () {
      setListText(document.getElementById('ql-valuable-ta').value);
      const again = highlight();
      createUI(again);
    };
  }

  window.DarthyPrimeQuestLog = {
    init: function () {
      if (!/\/questlog/i.test(location.href)) return;
      const run = () => {
        const found = highlight();
        createUI(found);
      };
      run();
      setTimeout(run, 800);
      setTimeout(run, 2000);
      const host = document.getElementById('QuestLogContent') || document.body;
      if (host && window.MutationObserver) {
        let t = null;
        new MutationObserver(() => {
          clearTimeout(t);
          t = setTimeout(run, 300);
        }).observe(host, { childList: true, subtree: true });
      }
      console.log('%c[DarthyPrime] Quest Log premium highlighter', 'color:#ef4444');
    }
  };
})();
