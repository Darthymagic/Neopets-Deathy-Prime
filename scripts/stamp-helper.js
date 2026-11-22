/**
 * Stamp album helper (ported from original)
 * Shows missing stamps by fetching Jellyneo data.
 * All original functionality preserved. Requires jQuery (loaded before this).
 */
(function () {
  'use strict';

  // Only run on album pages
  if (!location.pathname.includes('stamps.phtml') || !location.search.includes('type=album')) {
    window.DarthyPrimeStamp = { init: function () {} };
    return;
  }

  const hasPremium = !!($("#sswmenu .imgmenu").length);
  let thisPage = {};

  function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  function nameToItemdbSlug(name) {
    if (!name) return '';
    return name.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function parseJellyneoPage(html, albumID) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const results = {};

    let cards = doc.querySelectorAll('.jnflex-grid > div, .item-table tbody tr, table tbody tr');
    let pos = 1;

    cards.forEach(card => {
      try {
        const img = card.querySelector('img');
        if (!img) return;

        const alt = img.getAttribute('alt') || '';
        if (!alt || alt.includes('No Stamp')) return;

        const nameMatch = alt.match(/^(.+?)\s*-\s*r\d+/);
        const name = nameMatch ? nameMatch[1].trim() : alt.trim();

        const src = img.getAttribute('src') || '';
        const imgFile = src.includes('/items/') ? src.split('/').pop() : src;

        const rarityMatch = alt.match(/r(\d+)/);
        const rarity = rarityMatch ? `r${rarityMatch[1]}` : '';

        if (name && pos <= 25) {
          results[pos] = { position: pos, name, img: imgFile, rarity };
          pos++;
        }
      } catch (e) {}
    });

    for (let i = 1; i <= 25; i++) {
      if (!results[i]) {
        results[i] = { position: i, name: 'No Stamp', img: '', rarity: '' };
      }
    }

    return results;
  }

  function fetchFromJellyneo(albumID) {
    GM_xmlhttpRequest({
      method: 'GET',
      url: `https://items.jellyneo.net/search/?sort=6&album=${albumID}`,
      onload: function (response) {
        if (response.status === 200) {
          try {
            const parsed = parseJellyneoPage(response.responseText, albumID);
            if (parsed && Object.keys(parsed).length > 0) {
              thisPage = parsed;
              runMainCode();
            } else {
              showErrorAndRun();
            }
          } catch (e) {
            showErrorAndRun();
          }
        } else {
          showErrorAndRun();
        }
      },
      onerror: showErrorAndRun
    });
  }

  function showErrorAndRun() {
    $('.content').prepend(`<p style="color:#c33;text-align:center;font-weight:bold;">Could not load data from Jellyneo.</p>`);
    thisPage = {};
    runMainCode();
  }

  function runMainCode() {
    $('body').append(`<style>
      .fake-stamp { filter: grayscale(100%) !important; }
      .stamp-info-table { width:450px; margin:auto; border:1px solid #b1b1b1; }
      .content table img { cursor:pointer; }
      .stamp-selected { background:#e6ffe6; }
      #missing-stamps-section a:hover img { box-shadow:0 0 8px #c33; transform:scale(1.08); }
    </style>`);

    const collectedNames = new Set();
    let infoContent = {};

    // PASS 1: Collect owned stamps
    $('.content table img').each(function () {
      const currentAlt = $(this).attr('alt') || '';
      if (currentAlt && currentAlt !== 'No Stamp') {
        collectedNames.add(normalizeName(currentAlt));
      }
    });

    // PASS 2: Guarded replacement
    $('.content table img').each(function (index, element) {
      const position = index + 1;
      const data = thisPage[position] || { name: 'No Stamp', img: '', rarity: '' };
      const { name, img, rarity } = data;

      $(element).attr('position', position).attr('rarity', rarity);

      const currentAlt = $(element).attr('alt') || '';

      if (currentAlt === 'No Stamp' && name && name !== 'No Stamp' && img) {
        if (!collectedNames.has(normalizeName(name))) {
          const fullImg = img.startsWith('http')
            ? img.replace(/^http:/, 'https:')
            : `https://images.neopets.com/items/${img}`;

          $(element)
            .addClass('fake-stamp')
            .attr('title', name)
            .attr('src', fullImg)
            .attr('alt', name);
        }
      }

      infoContent[position] = createInfoContent(element, data);

      $(element).on('click', function () {
        $('.stamp-info').html(infoContent[position]).show();
        $('.content table td').removeClass('stamp-selected');
        $(element).parent().addClass('stamp-selected');
      });

      if (hasPremium && currentAlt && currentAlt !== 'No Stamp') {
        $(element).on('dblclick', function () {
          sswopen(currentAlt);
        });
      }
    });

    // FINAL PASS: Fill remaining empty slots without duplicates
    const visuallyPlaced = new Set();
    $('.content table img.fake-stamp').each(function () {
      const alt = $(this).attr('alt') || '';
      if (alt) visuallyPlaced.add(normalizeName(alt));
    });

    const missingStampsForVisual = [];
    Object.values(thisPage).forEach(stamp => {
      if (stamp.name && stamp.name !== 'No Stamp') {
        const norm = normalizeName(stamp.name);
        if (!collectedNames.has(norm) && !visuallyPlaced.has(norm)) {
          missingStampsForVisual.push(stamp);
        }
      }
    });

    let missingIndex = 0;
    $('.content table img').each(function () {
      const $img = $(this);
      const currentAlt = $img.attr('alt') || '';

      if (currentAlt === 'No Stamp' && !$img.hasClass('fake-stamp') && missingIndex < missingStampsForVisual.length) {
        const stamp = missingStampsForVisual[missingIndex];
        missingIndex++;

        let fullImg = 'https://images.neopets.com/images/no_stamp.gif';
        if (stamp.img) {
          fullImg = stamp.img.startsWith('http')
            ? stamp.img.replace(/^http:/, 'https:')
            : `https://images.neopets.com/items/${stamp.img}`;
        }

        $img.addClass('fake-stamp')
          .attr('title', stamp.name)
          .attr('src', fullImg)
          .attr('alt', stamp.name);
      }
    });

    function createInfoContent(imgElement, data) {
      const $img = $(imgElement);
      const currentAlt = $img.attr('alt') || '';
      const position = $img.attr('position');

      const isPlaceholder = currentAlt === 'No Stamp' || $img.hasClass('fake-stamp');
      const hasStamp = !isPlaceholder;

      let displayName = currentAlt;
      if (currentAlt === 'No Stamp') {
        displayName = 'Empty slot';
      }

      if (currentAlt === 'No Stamp' && (!data.name || data.name === 'No Stamp')) {
        return `<br><table class="stamp-info-table"><tr><td>This stamp slot is empty or unreleased.</td></tr></table>`;
      }

      const status = hasStamp
        ? '<b style="color:green">Collected!</b>'
        : '<b style="color:red">Not collected</b>';

      return `<br><table class="stamp-info-table">
        <tr><td><strong>${displayName}</strong></td></tr>
        <tr><td>Position: <b>${position}</b></td></tr>
        <tr><td>Status: ${status}</td></tr>
      </table>`;
    }

    $('.content table').after(`<p class="stamp-info"></p>`);

    showMissingStampsSection(collectedNames);
  }

  function showMissingStampsSection(collectedNames) {
    $('#missing-stamps-section').remove();

    const missingStamps = [];

    Object.values(thisPage).forEach(stamp => {
      if (stamp.name && stamp.name !== 'No Stamp') {
        if (!collectedNames.has(normalizeName(stamp.name))) {
          missingStamps.push(stamp);
        }
      }
    });

    if (missingStamps.length === 0) {
      $('.content table').before(`
        <div id="missing-stamps-section" style="margin:15px 0; text-align:center; color:#2e8b57;">
          <strong>✓ All released stamps on this page are collected!</strong>
        </div>
      `);
      return;
    }

    let html = `
      <div id="missing-stamps-section" style="margin:15px 0; text-align:center; border:1px solid #ddd; padding:12px; background:#fafafa;">
        <strong style="color:#c33; font-size:15px;">Missing Stamps (${missingStamps.length})</strong>
        <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:10px;">
    `;

    missingStamps.forEach(stamp => {
      const slug = nameToItemdbSlug(stamp.name);
      const url = slug
        ? `https://itemdb.com.br/item/${slug}`
        : `https://itemdb.com.br/search/?name=${encodeURIComponent(stamp.name)}`;

      let stampImg = 'https://images.neopets.com/images/no_stamp.gif';
      if (stamp.img) {
        stampImg = stamp.img.startsWith('http')
          ? stamp.img.replace(/^http:/, 'https:')
          : `https://images.neopets.com/items/${stamp.img}`;
      }

      html += `
        <a href="${url}" target="_blank" title="${stamp.name}" style="text-decoration:none;">
          <img src="${stampImg}" style="width:58px; height:58px; border:2px solid #f66; border-radius:6px; background:#fff;">
          <div style="font-size:10px; color:#c33; margin-top:3px;">${stamp.name}</div>
        </a>
      `;
    });

    html += `</div></div>`;

    $('.content table').before(html);
  }

  function sswopen(item) {
    if ($('.sswdrop').hasClass('panel_hidden')) {
      $('#sswmenu .imgmenu').click();
    }
    if ($('#ssw-tabs-1').hasClass('ui-tabs-hide')) {
      $('#button-new-search').click();
    }
    $('#ssw-criteria').val('exact');
    $('#searchstr').val(item);
  }

  window.DarthyPrimeStamp = {
    init: function () {
      const match = location.search.match(/page_id=(\d+)&*/);
      if (!match) return;
      const albumID = match[1];
      fetchFromJellyneo(albumID);
      console.log('%c[DarthyPrime Stamp] Helper active for album ' + albumID, 'color:#c33;font-weight:bold');
    }
  };
})();
