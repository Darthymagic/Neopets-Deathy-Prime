# Neopets Darthy Prime

A Chrome extension for Neopets (also works in Edge, Brave, and Opera).

## Modules

- Stats Tracker
- Shop Profit / Spending Tracker
- Random Events
- Shop Inventory
- Training Helper
- Notification Prime
- Reminders
- Shop Wizard Prime
- Quest Log Premium check
- Stamp Album Prime
- Shop Mimic
- Home Pets Grid
- Sidebar (stats, NP, and today’s log)

## Installation (Chrome / Edge / Brave / Opera)

1. Download / unzip this folder.
2. Open `chrome://extensions` (or `edge://extensions` etc.).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `neopets-darthy-prime` folder (the one that contains `manifest.json`).
5. Pin the extension if you like.

## First-time setup

* Click the extension icon → **Open Settings**.
* Confirm or change the Primary Pet name used by the Stats Tracker (default: Darthenvy).
* Save. Refresh any open Neopets tabs.

## What stayed the same

* All original detection regexes, timing, MutationObservers, and UI injections are kept.
* Training data continues to live in `localStorage` under the same keys (`neoActiveTrainings`, etc.), so existing data from the Tampermonkey version is preserved.
* Stats data moved to `chrome.storage.local` (more reliable across sessions) but uses the same key pattern.
* `PET_NAME` is now configurable instead of hard-coded.

## Files

```
neopets-darthy-prime/
├── manifest.json
├── background.js
├── popup.html / popup.js
├── options.html / options.js
├── icons/
├── styles/darthy-prime.css
└── scripts/
    ├── jquery.min.js
    ├── storage-polyfill.js
    ├── setup-modal.js
    ├── stats-tracker.js
    ├── notification-prime.js
    ├── stamp-helper.js
    ├── shop-profit.js
    ├── shop-mimic.js
    ├── random-events.js
    ├── home-pets-grid.js
    ├── shopwiz-pro.js
    ├── questlog-premium.js
    └── content-main.js
```

## Notes

* Works on `https://www.neopets.com/*`.
* Host permissions include Jellyneo (for stamp data) and `pets.neopets.com` (for pet images in the notification panel).
* If you previously used the Tampermonkey versions, you can disable them after installing this extension to avoid double-running.

Enjoy – Darthy Prime 🐾
