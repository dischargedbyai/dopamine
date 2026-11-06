# DopamineDiet - digital wellbeing chrome extension (manifest v3)

A modern, privacy-first digital wellbeing extension built with **Chrome Manifest V3** and **Google Material Design 3**.

Instead of punitive and frustrating website blocking, **DopamineDiet** uses **doomscroll interruption** and **visual de-stimulation** to break repetitive dopamine loops without disrupting intentional web browsing.

---

## Key features

1. **Doomscroll interrupter**:
   - Observes infinite scroll on feeds, Shorts, and Reels across YouTube, X, Reddit, Instagram, TikTok, Facebook, and LinkedIn.
   - Gently pauses the feed after a configurable threshold of posts or minutes with an in-page Material 3 dialog asking if you found what you came for.
   - Atomic actions: take a break (safely closes tab and tallies paused scroll), extend browsing (+15 posts / +5 minutes), or dismiss for intentional research.
   - Handles single-page app (SPA) transitions (such as YouTube watch to feed navigation) without requiring page reloads.

2. **Visual de-stimulation mode (dopamine dimmer)**:
   - Injects full CSS grayscale (`filter: grayscale(100%)`) at `document_start` to mute hyper-stimulating colors without visual flash (FOUC).
   - Suppresses red notification badges, unread counter pills, and vanity metrics (like counts, retweet counts).
   - Exempts fullscreen intentional video playback from grayscale automatically.

3. **100% on-device & local-first**:
   - Zero external analytics, zero tracking pixels, zero remote telemetry.
   - Battery-safe active time tracking using `chrome.idle` (60s AFK threshold) and window focus observers.
   - Session resiliency via `chrome.storage.session` to ensure background service worker suspensions do not lose active tracking progress.
   - Automatic 60-day retention pruning to prevent unbounded local storage growth while preserving lifetime metrics.

4. **Focus sprint**:
   - Built-in 25-minute deep-work sprint accessible directly from the extension popup.

5. **Design system**:
   - Typography strictly powered by **IBM Plex Sans**.
   - Geometry strictly styled with **`rounded-md` (6px to 8px)** tokens (no pill capsules or rounded-full elements).
   - Sentence-case typography and Google Material Symbols SVG icons (zero emojis).

---

## Project structure

```
dopaminediet/
├── manifest.json              # Chrome Manifest V3 configuration
├── background/
│   └── service-worker.js      # Session-resilient time tracking, alarms & message handlers
├── content/
│   ├── scroll-monitor.js      # Feed scroll observer, SPA route handler & pause dialog
│   ├── scroll-dialog.css      # In-page Material 3 pause dialog styles
│   ├── destimulate.js         # Document-start grayscale & badge hiding controller
│   └── destimulate.css        # Grayscale rules & selectors for metrics and badges
├── popup/
│   ├── popup.html             # Material 3 popup interface
│   ├── popup.css              # MD3 tokens, rectangular switches & cards
│   └── popup.js               # Tab status detection, quick toggles & focus countdown
├── dashboard/
│   ├── dashboard.html         # Settings, monitored domains & analytics dashboard
│   ├── dashboard.css          # Centered MD3 layout, hero stats & clean rows
│   └── dashboard.js           # 7-day trend chart (IBM Plex Sans), site manager & export
├── shared/
│   ├── config.js              # Default settings, target domains & initial state schema
│   ├── material-tokens.css    # Material Design 3 color roles & rounded-md tokens
│   └── storage.js             # Local storage persistence, read/write & 60-day prune
└── icons/
    ├── icon16.png             # Cobalt blue rounded-md icon with lettermark
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Installation & testing

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `dopaminediet` folder (`/home/priyanshu/Documents/dopaminediet`).
5. Pin **DopamineDiet** to your Chrome toolbar.
6. Open any target website (e.g. YouTube, X, Reddit) to test infinite scroll limits, the grayscale dimmer, and the popup controls.
