/**
 * First-run setup modal
 * Asks for main battle pet name + shop name (emoji allowed for shop).
 * Only shows once until both are set (or user saves).
 */
(function () {
  'use strict';

  const PET_KEY = 'darthy_pet_name';
  const SHOP_KEY = 'darthy_shop_name';
  const SETUP_DONE_KEY = 'darthy_setup_done';

  function needsSetup() {
    // Show if never completed setup, or if pet name is still the old default and setup flag missing
    const done = GM_getValue(SETUP_DONE_KEY, false);
    if (done) return false;
    const pet = GM_getValue(PET_KEY, '');
    // If user already has a non-empty custom pet from options, treat as done
    if (pet && pet !== 'Darthenvy') {
      GM_setValue(SETUP_DONE_KEY, true);
      return false;
    }
    // First install: still default → show setup
    return true;
  }

  function showModal() {
    if (document.getElementById('darthy-setup-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'darthy-setup-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483646;
      display:flex;align-items:center;justify-content:center;font-family:Verdana,Arial,sans-serif;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background:#1e293b;border:2px solid #4a90e2;border-radius:14px;padding:24px 28px;
      width:min(420px,92vw);box-shadow:0 20px 50px rgba(0,0,0,0.5);color:#e2e8f0;
    `;

    box.innerHTML = `
      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:22px;margin-bottom:4px;">🐾</div>
        <div style="font-size:16px;font-weight:bold;color:#7dd3fc;">Neopets Darthy Prime</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Quick setup – only asked once</div>
      </div>

      <label style="display:block;font-size:12px;color:#cbd5e1;margin-bottom:5px;">
        Enter main battle pet name
      </label>
      <input id="darthy-setup-pet" type="text" placeholder="e.g. Darthenvy" maxlength="20"
        style="width:100%;padding:10px 12px;border-radius:7px;border:1px solid #475569;
               background:#0f172a;color:#f1f5f9;font-size:14px;margin-bottom:14px;box-sizing:border-box;">

      <label style="display:block;font-size:12px;color:#cbd5e1;margin-bottom:5px;">
        Enter Shop Name <span style="color:#64748b;font-weight:normal;">(emoji allowed)</span>
      </label>
      <input id="darthy-setup-shop" type="text" placeholder="e.g. ✨ Darthy's Emporium" maxlength="40"
        style="width:100%;padding:10px 12px;border-radius:7px;border:1px solid #475569;
               background:#0f172a;color:#f1f5f9;font-size:14px;margin-bottom:6px;box-sizing:border-box;">
      <div style="font-size:11px;color:#64748b;margin-bottom:16px;">
        Shop name appears above Shop Profit in the profile dropdown.
      </div>

      <div id="darthy-setup-error" style="display:none;color:#f87171;font-size:12px;margin-bottom:10px;"></div>

      <button id="darthy-setup-save" style="
        width:100%;padding:11px;background:linear-gradient(135deg,#4a90e2,#2563eb);
        color:white;border:none;border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;
      ">Save &amp; Continue</button>
      <button id="darthy-setup-skip" style="
        width:100%;padding:8px;margin-top:8px;background:transparent;color:#94a3b8;
        border:none;font-size:12px;cursor:pointer;
      ">Skip for now (uses defaults)</button>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Prefill if anything already stored
    const existingPet = GM_getValue(PET_KEY, '');
    const existingShop = GM_getValue(SHOP_KEY, '');
    if (existingPet) document.getElementById('darthy-setup-pet').value = existingPet;
    if (existingShop) document.getElementById('darthy-setup-shop').value = existingShop;

    document.getElementById('darthy-setup-pet').focus();

    document.getElementById('darthy-setup-save').onclick = () => {
      const pet = document.getElementById('darthy-setup-pet').value.trim();
      const shop = document.getElementById('darthy-setup-shop').value.trim();
      const err = document.getElementById('darthy-setup-error');

      if (!pet) {
        err.style.display = 'block';
        err.textContent = 'Please enter your main battle pet name.';
        return;
      }

      GM_setValue(PET_KEY, pet);
      GM_setValue(SHOP_KEY, shop || '');
      GM_setValue(SETUP_DONE_KEY, true);

      overlay.remove();

      // Soft reload so stats tracker picks up the new pet name
      const banner = document.createElement('div');
      banner.style.cssText = `
        position:fixed;top:18%;left:50%;transform:translateX(-50%);
        background:#16a34a;color:white;padding:14px 24px;border-radius:10px;
        z-index:999999;font-size:14px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.35);
      `;
      banner.innerHTML = `✅ Setup saved<br><span style="font-size:12px;opacity:0.9;">Refreshing so Stats Tracker uses <b>${pet}</b>…</span>`;
      document.body.appendChild(banner);
      setTimeout(() => location.reload(), 900);
    };

    document.getElementById('darthy-setup-skip').onclick = () => {
      // Keep current defaults, mark done so we don't nag
      if (!GM_getValue(PET_KEY, null)) GM_setValue(PET_KEY, 'Darthenvy');
      GM_setValue(SETUP_DONE_KEY, true);
      overlay.remove();
    };
  }

  window.DarthyPrimeSetup = {
    init: function () {
      // Small delay so page is settled
      setTimeout(() => {
        if (needsSetup()) showModal();
      }, 1200);
    },
    show: showModal // allow re-open from options later if needed
  };
})();
