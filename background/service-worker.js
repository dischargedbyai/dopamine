/**
 * DopamineDiet - Background Service Worker
 * Battery-efficient time tracking with chrome.idle and tab activation listeners.
 * 100% Local, zero external network calls.
 */

importScripts('/shared/config.js', '/shared/storage.js');

// Current tracking state
let currentTracking = {
  tabId: null,
  domain: null,
  startTime: null,
  isUserActive: true
};

// In-memory buffer to batch storage writes
let timeBuffer = {};

const flushAlarmName = 'dd_flush_alarm';

/**
 * Persist tracking state to chrome.storage.session so MV3 sleep doesn't lose progress
 */
async function saveSessionState() {
  if (chrome.storage && chrome.storage.session) {
    try {
      await chrome.storage.session.set({
        currentTracking,
        timeBuffer
      });
    } catch (e) {}
  }
}

/**
 * Restore tracking state from chrome.storage.session after worker wake
 */
async function restoreSessionState() {
  if (chrome.storage && chrome.storage.session) {
    try {
      const data = await chrome.storage.session.get(['currentTracking', 'timeBuffer']);
      if (data.currentTracking) {
        currentTracking = data.currentTracking;
      }
      if (data.timeBuffer) {
        timeBuffer = data.timeBuffer;
      }
    } catch (e) {}
  }
}

/**
 * Flush accumulated in-memory time buffer to chrome.storage.local
 */
async function flushTimeBuffer() {
  if (Object.keys(timeBuffer).length === 0) return;
  const entries = Object.entries(timeBuffer);
  timeBuffer = {};
  await saveSessionState();

  for (const [domain, seconds] of entries) {
    if (seconds > 0) {
      await DopamineDietStorage.addActiveTime(domain, seconds);
    }
  }
}

/**
 * Finalize active duration on current tab and add to buffer
 */
async function commitCurrentTabTime() {
  if (!currentTracking.startTime || !currentTracking.domain || !currentTracking.isUserActive) {
    return;
  }

  const now = Date.now();
  const elapsedSeconds = (now - currentTracking.startTime) / 1000;
  currentTracking.startTime = now;

  // Filter out transient switches (< 1s) or massive anomalies (> 1 hour unaccounted)
  if (elapsedSeconds >= 1 && elapsedSeconds < 3600) {
    const domain = currentTracking.domain;
    timeBuffer[domain] = (timeBuffer[domain] || 0) + elapsedSeconds;
  }
  await saveSessionState();
}

/**
 * Switch active tracking to a new tab/URL
 */
async function switchActiveTab(tabId, url) {
  await commitCurrentTabTime();

  if (!tabId || !url) {
    currentTracking = { tabId: null, domain: null, startTime: null, isUserActive: true };
    await saveSessionState();
    return;
  }

  // Only track http/https pages
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    currentTracking = { tabId: null, domain: null, startTime: null, isUserActive: true };
    await saveSessionState();
    return;
  }

  const domain = DopamineDietStorage.normalizeDomain(url);
  const settings = await DopamineDietStorage.getSettings();

  // Check if domain is one of our target sites
  const isTargetSite = settings.targetSites.some(
    (s) => s.enabled && (domain === s.domain || domain.endsWith('.' + s.domain))
  );

  if (isTargetSite) {
    currentTracking = {
      tabId: tabId,
      domain: domain,
      startTime: Date.now(),
      isUserActive: currentTracking.isUserActive
    };
  } else {
    currentTracking = { tabId: null, domain: null, startTime: null, isUserActive: currentTracking.isUserActive };
  }
  await saveSessionState();
}

// 1. Tab Activation (User switched tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await switchActiveTab(tab.id, tab.url);
  } catch (err) {}
});

// 2. Tab URL Update (User navigated inside current tab)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    await switchActiveTab(tabId, changeInfo.url);
  }
});

// 3. Tab Closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (currentTracking.tabId === tabId) {
    await commitCurrentTabTime();
    currentTracking = { tabId: null, domain: null, startTime: null, isUserActive: currentTracking.isUserActive };
    await saveSessionState();
    await flushTimeBuffer();
  }
});

// 4. Window Focus Changed (User minimized browser or switched to another app)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === -1 || windowId === chrome.windows.WINDOW_ID_NONE) {
    // Window lost focus - pause tracking
    await commitCurrentTabTime();
    currentTracking.startTime = null;
    await saveSessionState();
    await flushTimeBuffer();
  } else {
    // Window focused - get active tab in this window
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId: windowId });
      if (tab) {
        await switchActiveTab(tab.id, tab.url);
      }
    } catch (err) {}
  }
});

// 5. User Idle Detection (User walked away from keyboard/mouse)
// Set idle detection threshold to 60 seconds
chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    // User is away - pause tracking
    await commitCurrentTabTime();
    currentTracking.isUserActive = false;
    currentTracking.startTime = null;
    await saveSessionState();
    await flushTimeBuffer();
  } else if (newState === 'active') {
    // User is back
    currentTracking.isUserActive = true;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await switchActiveTab(tab.id, tab.url);
      }
    } catch (err) {}
  }
});

// 6. Alarms: Regular buffer flush & Quick Focus countdown
chrome.alarms.create(flushAlarmName, { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === flushAlarmName) {
    await commitCurrentTabTime();
    await flushTimeBuffer();

    // Check Quick Focus expiration
    const settings = await DopamineDietStorage.getSettings();
    if (settings.quickFocus && settings.quickFocus.active) {
      if (Date.now() >= settings.quickFocus.endTime) {
        settings.quickFocus.active = false;
        await DopamineDietStorage.saveSettings(settings);
      }
    }

    // Daily retention pruning (60-day window)
    await DopamineDietStorage.pruneAnalytics(60);
  }
});

// 7. Message Handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    const msgType = (message.type || '').toLowerCase();

    switch (msgType) {
      case 'get_site_config': {
        const url = message.url || (sender.tab && sender.tab.url);
        const domain = DopamineDietStorage.normalizeDomain(url);
        const config = await DopamineDietStorage.getSiteConfig(domain);
        return { domain, config };
      }

      case 'close_tab': {
        if (message.domain) {
          await DopamineDietStorage.recordEvent('scrollAverted', message.domain);
        }
        if (sender.tab && sender.tab.id) {
          await chrome.tabs.remove(sender.tab.id);
        }
        return { success: true };
      }

      case 'record_event': {
        await DopamineDietStorage.recordEvent(message.eventType, message.domain || '');
        return { success: true };
      }

      case 'get_current_tab_status': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
          return { active: false, domain: '', config: null };
        }
        const domain = DopamineDietStorage.normalizeDomain(tab.url);
        const config = await DopamineDietStorage.getSiteConfig(domain);
        const settings = await DopamineDietStorage.getSettings();
        const site = settings.targetSites.find((s) => s.domain === domain || domain.endsWith('.' + s.domain));
        return {
          active: true,
          tabId: tab.id,
          url: tab.url,
          domain: domain,
          isTargetSite: !!site,
          siteSettings: site || null,
          config: config
        };
      }

      case 'get_popup_stats': {
        const analytics = await DopamineDietStorage.getAnalytics();
        const settings = await DopamineDietStorage.getSettings();
        const todayKey = DopamineDietStorage.getTodayKey();
        const todayData = analytics.daily[todayKey] || {
          secondsByDomain: {},
          scrollsAverted: 0
        };

        // Add any pending unflushed time from buffer
        let totalSecondsToday = 0;
        for (const [dom, sec] of Object.entries(todayData.secondsByDomain || {})) {
          totalSecondsToday += sec;
        }
        for (const [dom, sec] of Object.entries(timeBuffer)) {
          totalSecondsToday += sec;
        }

        return {
          todaySeconds: Math.round(totalSecondsToday),
          scrollsAverted: todayData.scrollsAverted || 0,
          quickFocus: settings.quickFocus || { active: false }
        };
      }

      case 'toggle_site_scroll': {
        const settings = await DopamineDietStorage.getSettings();
        const domain = DopamineDietStorage.normalizeDomain(message.domain);
        let site = settings.targetSites.find((s) => s.domain === domain);
        if (!site) {
          site = { domain: domain, enabled: true, scrollInterrupt: true, grayscale: false };
          settings.targetSites.push(site);
        }
        site.scrollInterrupt = message.value;
        if (message.value) site.enabled = true;
        await DopamineDietStorage.saveSettings(settings);
        return { success: true, site };
      }

      case 'toggle_grayscale': {
        const settings = await DopamineDietStorage.getSettings();
        if (message.scope === 'global') {
          settings.globalGrayscale = message.value;
        } else if (message.domain) {
          const domain = DopamineDietStorage.normalizeDomain(message.domain);
          let site = settings.targetSites.find((s) => s.domain === domain);
          if (site) {
            site.grayscale = message.value;
          }
        }
        await DopamineDietStorage.saveSettings(settings);
        return { success: true };
      }

      case 'start_quick_focus': {
        const settings = await DopamineDietStorage.getSettings();
        const durationMinutes = message.durationMinutes || 25;
        settings.quickFocus = {
          active: true,
          endTime: Date.now() + durationMinutes * 60 * 1000,
          durationMinutes: durationMinutes
        };
        await DopamineDietStorage.saveSettings(settings);
        return { success: true, quickFocus: settings.quickFocus };
      }

      case 'stop_quick_focus': {
        const settings = await DopamineDietStorage.getSettings();
        settings.quickFocus.active = false;
        await DopamineDietStorage.saveSettings(settings);
        return { success: true };
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  handleMessage().then(sendResponse).catch((err) => {
    sendResponse({ error: err.message });
  });

  // Keep channel open for async response
  return true;
});

// Initialization on extension load or worker wake
(async () => {
  await restoreSessionState();
  await DopamineDietStorage.getSettings();
  await DopamineDietStorage.getAnalytics();
})();
