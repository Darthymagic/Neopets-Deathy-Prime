document.addEventListener('DOMContentLoaded', async () => {
  const petInput = document.getElementById('pet-name');
  const shopInput = document.getElementById('shop-name');
  const saveBtn = document.getElementById('save-pet');
  const petStatus = document.getElementById('pet-status');
  const resetBtn = document.getElementById('reset-stats');
  const resetStatus = document.getElementById('reset-status');
  const shopProfitEl = document.getElementById('opt-shop-profit');
  const shopSpendEl = document.getElementById('opt-shop-spend');
  const resetShopBtn = document.getElementById('reset-shop-profit');
  const resetSpendBtn = document.getElementById('reset-shop-spend');
  const shopResetStatus = document.getElementById('shop-reset-status');

  function formatNP(n) {
    return (n || 0).toLocaleString('en-US') + ' NP';
  }

  const data = await chrome.storage.local.get([
    'darthy_pet_name',
    'darthy_shop_name',
    'darthy_shop_profit_total',
    'darthy_spending_total'
  ]);

  if (petInput) petInput.value = data.darthy_pet_name || 'Darthenvy';
  if (shopInput) shopInput.value = data.darthy_shop_name || '';
  if (shopProfitEl) shopProfitEl.textContent = formatNP(data.darthy_shop_profit_total || 0);
  if (shopSpendEl) shopSpendEl.textContent = formatNP(data.darthy_spending_total || 0);

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = (petInput.value || '').trim();
      const shop = (shopInput ? shopInput.value : '').trim();
      if (!name) {
        petStatus.textContent = 'Pet name cannot be empty.';
        petStatus.className = 'status err';
        return;
      }
      await chrome.storage.local.set({
        darthy_pet_name: name,
        darthy_shop_name: shop,
        darthy_setup_done: true
      });
      petStatus.textContent = `Saved. Pet: "${name}"${shop ? ' · Shop: "' + shop + '"' : ''}. Refresh Neopets tabs.`;
      petStatus.className = 'status ok';
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const name = (petInput.value || '').trim() || 'Darthenvy';
      if (!confirm(`Reset all tracked stats for ${name}?`)) return;

      const key = `neopets_stats_${name.toLowerCase()}`;
      const startKey = `neopets_start_date_${name.toLowerCase()}`;
      const logKey = `neopets_log_${name.toLowerCase()}`;
      const logDateKey = `neopets_log_date_${name.toLowerCase()}`;
      const today = new Date();
      const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');

      await chrome.storage.local.set({
        [key]: { level: 0, hp: 0, strength: 0, defence: 0 },
        [startKey]: todayStr,
        [logKey]: [],
        [logDateKey]: todayStr
      });
      resetStatus.textContent = `Stats for ${name} have been reset.`;
      resetStatus.className = 'status ok';
    });
  }

  if (resetShopBtn) {
    resetShopBtn.addEventListener('click', async () => {
      if (!confirm('Reset Shop Profit total to 0?')) return;
      await chrome.storage.local.set({ darthy_shop_profit_total: 0 });
      if (shopProfitEl) shopProfitEl.textContent = formatNP(0);
      if (shopResetStatus) {
        shopResetStatus.textContent = 'Shop profit reset.';
        shopResetStatus.className = 'status ok';
      }
    });
  }

  if (resetSpendBtn) {
    resetSpendBtn.addEventListener('click', async () => {
      if (!confirm('Reset Spending Tracker total to 0?')) return;
      await chrome.storage.local.set({ darthy_spending_total: 0 });
      if (shopSpendEl) shopSpendEl.textContent = formatNP(0);
      if (shopResetStatus) {
        shopResetStatus.textContent = 'Spending total reset.';
        shopResetStatus.className = 'status ok';
      }
    });
  }
});
