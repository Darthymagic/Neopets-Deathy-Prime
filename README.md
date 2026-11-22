# Neopets Darthy Prime

A Chrome extension for Neopets (also works in Edge, Brave, and Opera).

## Changelog

### 1.6.1
- Food Club: five betting styles you can pick (the choice is remembered):
  - Darthy No Bust: 0–5% bust chance
  - Darthy Bets: 45–55% bust, the max TER style
  - Mimic - nsheng: 25–30% bust
  - Mimic - jkScrollingDown: 35–42% bust
  - Mimic - Garret Jaxx: about 30% bust when the round's odds look good (average E.R. per bet 1.85 or more), otherwise 0–5%
  - A style can use fewer than 10 bets when the odds don't justify all 10.
- Food Club bet page: a NeoFoodClub-style table of up to 10 bets (Bet #, Amount, Odds, Payoff, Prob., E.R., N.E., Maxbet, the five arenas, and a "Place bet!" button), with a Total row. The Amount is filled in with your max bet and can be edited.
- "Place bet!" places the bet in the background, without leaving the page. If that fails you get a Retry button and an "Open in a new tab" link. You can also tick "Place bets in a new tab instead". Each button sends only one bet, can't be double-clicked, and is greyed out once that bet is placed.
- Copy Bets button and FC Wrap Up (Weekly / Monthly / Quarterly, kept history, ROI charts, copy text), the same as Darthy Prime Plus.
- Collect All winnings are tracked and added to your profit and to FC Wrap Up. The NP you bet is added to your spending.

## Modules

- Stats Tracker (food, training, Kitchen Quest, Lab, and random-event sources)
- Stat source pie chart
- Shop Profit / Spending Tracker
- Shop history top sellers and weekly profit candles
- Random Events
- Shop Inventory
- Training Helper
- Notification Prime
- Reminders
- Shop Wizard Prime
- Quest Log Premium check
- Stamp Album Prime
- Account Completion (books, gourmet, avatars, stamps)
- Shop Mimic
- Home Pets Grid
- Sidebar (stats, NP, and today’s log)
- Food Club (betting styles, bet table, Copy Bets, FC Wrap Up, winnings tracking)

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
    ├── food-club.js
    └── content-main.js
```

## Notes

* Works on `https://www.neopets.com/*`.
* Food Club reads the round's opening odds from NeoFoodClub (`cdn.neofood.club`) when they're available. Nothing else is sent anywhere.
* Host permissions include Jellyneo (for stamp data) and `pets.neopets.com` (for pet images in the notification panel).
* If you previously used the Tampermonkey versions, you can disable them after installing this extension to avoid double-running.

Enjoy – Darthy Prime 🐾
