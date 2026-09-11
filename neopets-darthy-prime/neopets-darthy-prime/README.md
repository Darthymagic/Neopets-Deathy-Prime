# Neopets Darthy Prime

Prime includes, Tracking of all kinds. tracks NP spend/gain, Stats gain/loss, REs, Shop Inventory and training times of pets. 
Quality of life training helper. 
Global notifications system. 
SW Prime helps you find the lowest price. 
Premium item checked for QL if it's good or not which also needs user management of the item list.
Sidebar build into the neopets UI to show your stats gained, spent NP and Log for gains of all kinds.
Stamp Album Prime. Lets you know what stamps you're missing and links to databases to help you with buying if need be.

## Installation (Chrome / Edge / Brave / Opera)

1. Download / unzip this folder.
2. Open `chrome://extensions` (or `edge://extensions` etc.).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `neopets-darthy-prime` folder.
5. Pin the extension if you like.

## First-time setup

- Click the extension icon → **Open Settings**.
- Confirm or change the **Primary Pet** name used by the Stats Tracker (default: `Darthenvy`).
- Save. Refresh any open Neopets tabs.

## What stayed the same

- All original detection regexes, timing, MutationObservers, and UI injections are kept.
- Training data continues to live in `localStorage` under the same keys (`neoActiveTrainings`, etc.), so existing data from the Tampermonkey version is preserved.
- Stats data moved to `chrome.storage.local` (more reliable across sessions) but uses the same key pattern.
- PET_NAME is now configurable instead of hard-coded.

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
    ├── stats-tracker.js
    ├── notification-prime.js
    ├── stamp-helper.js
    └── content-main.js
```

## Notes

- Works on `https://www.neopets.com/*`.
- Host permissions include Jellyneo (for stamp data) and pets.neopets.com (for pet images in the notification panel).
- If you previously used the Tampermonkey versions, you can disable them after installing this extension to avoid double-running.

Enjoy – Darthy Prime 🐾
