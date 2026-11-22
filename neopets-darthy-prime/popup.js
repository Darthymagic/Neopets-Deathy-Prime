/**
 * Popup – stats + shop profit + spending
 */
document.addEventListener('DOMContentLoaded', async () => {
  const petEl = document.getElementById('pet-name');
  const levelEl = document.getElementById('s-level');
  const hpEl = document.getElementById('s-hp');
  const strEl = document.getElementById('s-str');
  const defEl = document.getElementById('s-def');
  const daysEl = document.getElementById('days-tracked');
  const profitEl = document.getElementById('shop-profit');
  const spendEl = document.getElementById('shop-spend');
  const shopTitle = document.getElementById('popup-shop-title');

  function fmt(n) {
    if (n > 0) return '+' + n;
    return String(n);
  }
  function colorize(el, val) {
    el.className = 'value ' + (val > 0 ? 'pos' : val < 0 ? 'neg' : 'zero');
    el.textContent = fmt(val);
  }
  function formatNP(n) {
    return (n || 0).toLocaleString('en-US') + ' NP';
  }

  function apply(stats, profit, spend, shopName) {
    if (stats) {
      petEl.textContent = stats.pet || '—';
      colorize(levelEl, stats.level || 0);
      colorize(hpEl, stats.hp || 0);
      colorize(strEl, stats.strength || 0);
      colorize(defEl, stats.defence || 0);
    }
    if (profitEl) profitEl.textContent = formatNP(profit || 0);
    if (spendEl) spendEl.textContent = formatNP(spend || 0);
    if (shopTitle && shopName) shopTitle.textContent = shopName;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('neopets.com')) {
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'get-stats' });
        if (resp && resp.ok) {
          apply(resp.stats, resp.shopProfit, resp.spending, resp.shopName);
          const data = await chrome.storage.local.get(null);
          const petName = (resp.stats && resp.stats.pet) || data.darthy_pet_name || 'Darthenvy';
          const startKey = `neopets_start_date_${petName.toLowerCase()}`;
          const start = data[startKey];
          if (start && daysEl) {
            const startDate = new Date(start + 'T00:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const days = Math.max(1, Math.floor((today - startDate) / 86400000) + 1);
            daysEl.textContent = `Tracking for ${days} day${days === 1 ? '' : 's'}`;
          }
          return;
        }
      } catch (e) {}
    }

    const data = await chrome.storage.local.get(null);
    const petName = data.darthy_pet_name || 'Darthenvy';
    const key = `neopets_stats_${petName.toLowerCase()}`;
    const stats = data[key] || { level: 0, hp: 0, strength: 0, defence: 0 };
    const startKey = `neopets_start_date_${petName.toLowerCase()}`;
    const start = data[startKey];
    apply({ ...stats, pet: petName }, data.darthy_shop_profit_total || 0, data.darthy_spending_total || 0, data.darthy_shop_name || '');

    if (start && daysEl) {
      const startDate = new Date(start + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.max(1, Math.floor((today - startDate) / 86400000) + 1);
      daysEl.textContent = `Tracking for ${days} day${days === 1 ? '' : 's'}`;
    }
  } catch (err) {
    petEl.textContent = 'Error loading';
    console.error(err);
  }
});
