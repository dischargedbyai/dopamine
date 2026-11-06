/**
 * DopamineDiet - De-Stimulation Controller
 * Toggles grayscale and badge hiding dynamically.
 * Runs at document_start to avoid flash of saturated colors.
 */

(function () {
  async function applyDeStimulation() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'get_site_config',
        url: window.location.href
      });

      if (!response || !response.config) return;

      const { grayscale, hideBadges } = response.config;

      if (document.documentElement) {
        if (grayscale) {
          document.documentElement.classList.add('dd-grayscale');
        } else {
          document.documentElement.classList.remove('dd-grayscale');
        }

        if (hideBadges) {
          document.documentElement.classList.add('dd-hide-badges');
        } else {
          document.documentElement.classList.remove('dd-hide-badges');
        }
      }
    } catch (e) {
      // Background worker might be sleeping
    }
  }

  // Apply immediately at document_start to prevent color flash
  if (document.documentElement) {
    applyDeStimulation();
  } else {
    document.addEventListener('DOMContentLoaded', applyDeStimulation);
  }

  // Listen for live updates from popup or background
  chrome.runtime.onMessage.addListener((message) => {
    const msgType = (message.type || '').toLowerCase();
    if (msgType === 'update_destimulate_state') {
      if (document.documentElement) {
        if (message.grayscale !== undefined) {
          if (message.grayscale) {
            document.documentElement.classList.add('dd-grayscale');
          } else {
            document.documentElement.classList.remove('dd-grayscale');
          }
        }
        if (message.hideBadges !== undefined) {
          if (message.hideBadges) {
            document.documentElement.classList.add('dd-hide-badges');
          } else {
            document.documentElement.classList.remove('dd-hide-badges');
          }
        }
      }
    }
  });
})();
