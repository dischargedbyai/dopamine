/**
 * DopamineDiet - Popup Controller
 * Handles live UI interaction, switches, stats, and focus timer.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const statTimeElem = document.getElementById('dd-stat-time');
  const statScrollsElem = document.getElementById('dd-stat-scrolls');

  const siteSection = document.getElementById('dd-site-section');
  const neutralSection = document.getElementById('dd-neutral-section');
  const currentDomainElem = document.getElementById('dd-current-domain');
  const siteStatusElem = document.getElementById('dd-site-status');

  const toggleScroll = document.getElementById('dd-toggle-scroll');
  const toggleGrayscale = document.getElementById('dd-toggle-grayscale');
  const btnAddCurrentSite = document.getElementById('dd-btn-add-current-site');

  const btnQuickFocus = document.getElementById('dd-btn-quick-focus');
  const focusCaption = document.getElementById('dd-focus-caption');

  const btnOpenDashboard = document.getElementById('dd-btn-open-dashboard');
  const btnViewDashboard = document.getElementById('dd-btn-view-dashboard');

  let currentTabInfo = null;
  let focusInterval = null;

  /**
   * Format seconds into human readable time (e.g. 14m or 1h 20m)
   */
  function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds < 60) {
      return totalSeconds > 0 ? `${totalSeconds}s` : '0m';
    }
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `${hours}h ${remMin}m`;
  }

  /**
   * Open Dashboard
   */
  function openDashboard() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard/dashboard.html')
    });
  }

  btnOpenDashboard.addEventListener('click', openDashboard);
  btnViewDashboard.addEventListener('click', openDashboard);

  /**
   * Load popup stats
   */
  async function loadStats() {
    try {
      const stats = await chrome.runtime.sendMessage({ type: 'get_popup_stats' });
      if (stats) {
        statTimeElem.textContent = formatDuration(stats.todaySeconds);
        if (statScrollsElem) statScrollsElem.textContent = stats.scrollsAverted || 0;
        updateQuickFocusUI(stats.quickFocus);
      }
    } catch (e) {
      console.warn('Could not load stats:', e);
    }
  }

  /**
   * Quick Focus UI updates
   */
  function updateQuickFocusUI(quickFocus) {
    if (focusInterval) {
      clearInterval(focusInterval);
      focusInterval = null;
    }

    if (quickFocus && quickFocus.active && quickFocus.endTime > Date.now()) {
      btnQuickFocus.textContent = 'End focus';
      btnQuickFocus.className = 'dd-btn-focus dd-btn-focus-stop';

      const updateCountdown = () => {
        const remainingMs = quickFocus.endTime - Date.now();
        if (remainingMs <= 0) {
          clearInterval(focusInterval);
          btnQuickFocus.textContent = 'Start focus';
          btnQuickFocus.className = 'dd-btn-focus';
          focusCaption.textContent = 'Session complete';
          return;
        }
        const remSec = Math.floor(remainingMs / 1000);
        const mins = Math.floor(remSec / 60);
        const secs = remSec % 60;
        focusCaption.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} remaining`;
      };

      updateCountdown();
      focusInterval = setInterval(updateCountdown, 1000);
    } else {
      btnQuickFocus.textContent = 'Start focus';
      btnQuickFocus.className = 'dd-btn-focus';
      focusCaption.textContent = '25-minute deep work';
    }
  }

  // Quick Focus Toggle
  btnQuickFocus.addEventListener('click', async () => {
    if (btnQuickFocus.textContent.includes('End')) {
      await chrome.runtime.sendMessage({ type: 'stop_quick_focus' });
      await loadStats();
    } else {
      await chrome.runtime.sendMessage({ type: 'start_quick_focus', durationMinutes: 25 });
      await loadStats();
    }
  });

  /**
   * Load current tab status
   */
  async function loadTabStatus() {
    try {
      currentTabInfo = await chrome.runtime.sendMessage({ type: 'get_current_tab_status' });

      if (!currentTabInfo || !currentTabInfo.active || !currentTabInfo.domain) {
        siteSection.style.display = 'none';
        neutralSection.style.display = 'none';
        return;
      }

      currentDomainElem.textContent = currentTabInfo.domain;

      if (currentTabInfo.isTargetSite) {
        siteSection.style.display = 'block';
        neutralSection.style.display = 'none';

        const config = currentTabInfo.config || {};
        toggleScroll.checked = !!config.scrollInterrupt;
        toggleGrayscale.checked = !!config.grayscale;

        siteStatusElem.textContent = 'Protected';
        siteStatusElem.className = 'dd-site-chip';
      } else {
        siteSection.style.display = 'none';
        neutralSection.style.display = 'flex';
      }
    } catch (e) {
      console.warn('Could not load tab status:', e);
    }
  }

  // Toggle Scroll limit for current domain
  toggleScroll.addEventListener('change', async () => {
    if (!currentTabInfo || !currentTabInfo.domain) return;
    await chrome.runtime.sendMessage({
      type: 'toggle_site_scroll',
      domain: currentTabInfo.domain,
      value: toggleScroll.checked
    });
  });

  // Toggle Grayscale live for current domain
  toggleGrayscale.addEventListener('change', async () => {
    if (!currentTabInfo || !currentTabInfo.domain) return;
    const isGrayscale = toggleGrayscale.checked;

    await chrome.runtime.sendMessage({
      type: 'toggle_grayscale',
      domain: currentTabInfo.domain,
      value: isGrayscale
    });

    if (currentTabInfo.tabId) {
      chrome.tabs.sendMessage(currentTabInfo.tabId, {
        type: 'update_destimulate_state',
        grayscale: isGrayscale
      }).catch(() => {});
    }
  });

  // Protect Current Site Button
  btnAddCurrentSite.addEventListener('click', async () => {
    if (!currentTabInfo || !currentTabInfo.domain) return;
    await chrome.runtime.sendMessage({
      type: 'toggle_site_scroll',
      domain: currentTabInfo.domain,
      value: true
    });
    await loadTabStatus();
    await loadStats();
  });

  // Initialize
  await loadTabStatus();
  await loadStats();
});
