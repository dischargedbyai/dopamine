/**
 * DopamineDiet - Default Configuration
 * Baseline settings, target domains, and initial state schema.
 */

const defaultTargetSites = [
  { domain: 'youtube.com', enabled: true, scrollInterrupt: true, grayscale: false },
  { domain: 'x.com', enabled: true, scrollInterrupt: true, grayscale: false },
  { domain: 'twitter.com', enabled: true, scrollInterrupt: true, grayscale: false },
  { domain: 'reddit.com', enabled: true, scrollInterrupt: true, grayscale: false },
  { domain: 'instagram.com', enabled: true, scrollInterrupt: true, grayscale: false },
  { domain: 'tiktok.com', enabled: true, scrollInterrupt: true, grayscale: false },
  { domain: 'facebook.com', enabled: true, scrollInterrupt: true, grayscale: false },
  { domain: 'linkedin.com', enabled: true, scrollInterrupt: true, grayscale: false }
];

const defaultSettings = {
  enabled: true,
  doomscrollThresholdPosts: 25,
  doomscrollThresholdMinutes: 10,
  globalGrayscale: false,
  hideBadges: true,
  targetSites: defaultTargetSites,
  quickFocus: {
    active: false,
    endTime: 0,
    durationMinutes: 25
  }
};

const defaultAnalytics = {
  daily: {},
  lifetime: {
    totalSeconds: 0,
    totalScrollsAverted: 0
  }
};

const dopamineDietConfig = {
  defaultTargetSites,
  defaultSettings,
  defaultAnalytics
};

if (typeof window !== 'undefined') {
  window.dopamineDietConfig = dopamineDietConfig;
}
if (typeof self !== 'undefined') {
  self.dopamineDietConfig = dopamineDietConfig;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = dopamineDietConfig;
}
