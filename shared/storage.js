/**
 * DopamineDiet - Shared Storage and State Utility
 * 100% Local-Only Storage with chrome.storage.local
 */

function getResolvedConfig() {
  if (typeof dopamineDietConfig !== 'undefined') {
    return dopamineDietConfig;
  }
  if (typeof self !== 'undefined' && self.dopamineDietConfig) {
    return self.dopamineDietConfig;
  }
  if (typeof window !== 'undefined' && window.dopamineDietConfig) {
    return window.dopamineDietConfig;
  }
  try {
    return require('./config.js');
  } catch (e) {
    return {
      defaultSettings: {
        enabled: true,
        doomscrollThresholdPosts: 25,
        doomscrollThresholdMinutes: 10,
        globalGrayscale: false,
        hideBadges: true,
        targetSites: [],
        quickFocus: { active: false, endTime: 0, durationMinutes: 25 }
      },
      defaultAnalytics: { daily: {}, lifetime: { totalSeconds: 0, totalScrollsAverted: 0 } }
    };
  }
}

function getTodayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDomain(urlOrDomain) {
  if (!urlOrDomain) return '';
  try {
    let hostname = urlOrDomain;
    if (urlOrDomain.startsWith('http://') || urlOrDomain.startsWith('https://')) {
      hostname = new URL(urlOrDomain).hostname;
    }
    return hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
  } catch {
    return urlOrDomain.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
  }
}

async function getSettings() {
  const config = getResolvedConfig();
  return new Promise((resolve) => {
    chrome.storage.local.get(['dd_settings'], (result) => {
      if (!result.dd_settings) {
        chrome.storage.local.set({ dd_settings: config.defaultSettings }, () => {
          resolve(config.defaultSettings);
        });
      } else {
        const merged = { ...config.defaultSettings, ...result.dd_settings };
        resolve(merged);
      }
    });
  });
}

async function saveSettings(newSettings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ dd_settings: newSettings }, () => {
      resolve(newSettings);
    });
  });
}

async function getSiteConfig(domain) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return { enabled: false, scrollInterrupt: false, grayscale: false };
  }
  const cleanDomain = normalizeDomain(domain);
  const site = settings.targetSites.find((s) => cleanDomain === s.domain || cleanDomain.endsWith('.' + s.domain));
  if (!site || !site.enabled) {
    return {
      enabled: false,
      scrollInterrupt: false,
      grayscale: settings.globalGrayscale,
      hideBadges: settings.hideBadges
    };
  }
  return {
    enabled: true,
    scrollInterrupt: site.scrollInterrupt,
    grayscale: settings.globalGrayscale || site.grayscale,
    hideBadges: settings.hideBadges,
    doomscrollThresholdPosts: settings.doomscrollThresholdPosts,
    doomscrollThresholdMinutes: settings.doomscrollThresholdMinutes,
    quickFocus: settings.quickFocus
  };
}

async function getAnalytics() {
  const config = getResolvedConfig();
  return new Promise((resolve) => {
    chrome.storage.local.get(['dd_analytics'], (result) => {
      if (!result.dd_analytics) {
        chrome.storage.local.set({ dd_analytics: config.defaultAnalytics }, () => {
          resolve(config.defaultAnalytics);
        });
      } else {
        resolve({ ...config.defaultAnalytics, ...result.dd_analytics });
      }
    });
  });
}

async function recordEvent(eventType, domain = '') {
  const analytics = await getAnalytics();
  const today = getTodayKey();
  if (!analytics.daily[today]) {
    analytics.daily[today] = {
      secondsByDomain: {},
      scrollsAverted: 0
    };
  }
  const dayData = analytics.daily[today];
  if (!dayData.secondsByDomain) dayData.secondsByDomain = {};

  if (eventType === 'scrollAverted' || eventType === 'scroll_averted') {
    dayData.scrollsAverted = (dayData.scrollsAverted || 0) + 1;
    analytics.lifetime.totalScrollsAverted = (analytics.lifetime.totalScrollsAverted || 0) + 1;
  }

  await new Promise((resolve) => {
    chrome.storage.local.set({ dd_analytics: analytics }, resolve);
  });
  return analytics;
}

async function addActiveTime(domain, seconds) {
  if (!seconds || seconds <= 0) return;
  const cleanDomain = normalizeDomain(domain);
  if (!cleanDomain) return;

  const analytics = await getAnalytics();
  const today = getTodayKey();
  if (!analytics.daily[today]) {
    analytics.daily[today] = {
      secondsByDomain: {},
      scrollsAverted: 0
    };
  }
  const dayData = analytics.daily[today];
  if (!dayData.secondsByDomain) dayData.secondsByDomain = {};

  dayData.secondsByDomain[cleanDomain] = (dayData.secondsByDomain[cleanDomain] || 0) + Math.round(seconds);
  analytics.lifetime.totalSeconds = (analytics.lifetime.totalSeconds || 0) + Math.round(seconds);

  await new Promise((resolve) => {
    chrome.storage.local.set({ dd_analytics: analytics }, resolve);
  });
}

/**
 * Prune historical daily records older than retentionDays
 * Preserves lifetime totals.
 */
async function pruneAnalytics(retentionDays = 60) {
  const analytics = await getAnalytics();
  if (!analytics.daily) return analytics;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let modified = false;

  for (const dateKey of Object.keys(analytics.daily)) {
    const parts = dateKey.split('-');
    if (parts.length === 3) {
      const entryDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime();
      if (!isNaN(entryDate) && entryDate < cutoff) {
        delete analytics.daily[dateKey];
        modified = true;
      }
    }
  }

  if (modified) {
    await new Promise((resolve) => {
      chrome.storage.local.set({ dd_analytics: analytics }, resolve);
    });
  }
  return analytics;
}

const DopamineDietStorage = {
  get defaultSettings() {
    return getResolvedConfig().defaultSettings;
  },
  get defaultAnalytics() {
    return getResolvedConfig().defaultAnalytics;
  },
  getTodayKey,
  normalizeDomain,
  getSettings,
  saveSettings,
  getSiteConfig,
  getAnalytics,
  recordEvent,
  addActiveTime,
  pruneAnalytics
};

if (typeof window !== 'undefined') {
  window.DopamineDietStorage = DopamineDietStorage;
}
if (typeof self !== 'undefined') {
  self.DopamineDietStorage = DopamineDietStorage;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DopamineDietStorage;
}
