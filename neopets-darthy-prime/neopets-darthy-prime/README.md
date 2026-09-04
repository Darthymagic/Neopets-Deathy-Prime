# Neopets Darthy Prime

**Unified browser extension** that brings together your three userscripts with zero functionality lost:

1. **Stats Tracker (Kitchen + Lab)** – v1.15 logic  
   Tracks Level / HP / Strength / Defence gains from Kitchen, Lab, Inventory, SDB, Scratchcards, Training Schools, Faerie Quests + daily log. Injects into the profile dropdown.

2. **Notification Prime** – v4.8.3 logic  
   Training Helper Plus (smart quick-start buttons, complete single/all courses, floating 🛎️ notification bell for finished trainings & native Neopets alerts, Clear Notifications button.

3. **Stamp Album Helper**  
   Fetches Jellyneo data, shows missing stamps section, greyscale placeholders, click-for-info, double-click SSW search (if Premium).

4. **Shop History Profit Tracker** (new in 1.1.0)  
   On your Shop → Sales History page the "Clear Sales History" button becomes **"Process Shop History"**.  
   Clicking it adds every listed sale price to a running total, then clears the history so you never double-count.  
   Total is shown under the table and also in the profile dropdown + extension popup.

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
