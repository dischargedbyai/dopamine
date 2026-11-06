/**
 * DopamineDiet - Clean Digital Wellbeing Dashboard Controller
 * Seamless tabs, local charts, and responsive settings.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation elements
  const tabs = document.querySelectorAll('.dd-tab');
  const panes = document.querySelectorAll('.dd-pane');
  const globalMasterToggle = document.getElementById('dd-global-master-toggle');

  // Stats elements
  const statTimeToday = document.getElementById('dash-time-today');
  const statTimeWeek = document.getElementById('dash-time-week');
  const statScrollsAverted = document.getElementById('dash-scrolls-averted');
  const statSitesCount = document.getElementById('dash-sites-count');
  const domainBarsContainer = document.getElementById('dash-domain-bars');
  const trendCanvas = document.getElementById('dash-trend-canvas');

  // Target sites elements
  const sitesListContainer = document.getElementById('dash-sites-tbody');
  const inputNewDomain = document.getElementById('dash-input-new-domain');
  const btnAddDomain = document.getElementById('dash-btn-add-domain');

  // Doomscroll elements
  const sliderPosts = document.getElementById('dash-slider-posts');
  const valPosts = document.getElementById('dash-posts-val');
  const sliderFeedtime = document.getElementById('dash-slider-feedtime');
  const valFeedtime = document.getElementById('dash-feedtime-val');
  const toggleHideBadges = document.getElementById('dash-toggle-hide-badges');
  const toggleGlobalGrayscale = document.getElementById('dash-toggle-global-grayscale');

  // Data buttons
  const btnExport = document.getElementById('dash-btn-export');
  const btnResetData = document.getElementById('dash-btn-reset-data');

  let currentSettings = await DopamineDietStorage.getSettings();
  let currentAnalytics = await DopamineDietStorage.getAnalytics();

  /**
   * Switch Active Tab
   */
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove('active'));
      panes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const activePane = document.getElementById(`tab-${targetTab}`);
      if (activePane) activePane.classList.add('active');

      if (targetTab === 'analytics') {
        renderAnalytics();
      }
    });
  });

  /**
   * Master Toggle
   */
  if (globalMasterToggle) {
    globalMasterToggle.checked = currentSettings.enabled;
    globalMasterToggle.addEventListener('change', async () => {
      currentSettings.enabled = globalMasterToggle.checked;
      await DopamineDietStorage.saveSettings(currentSettings);
    });
  }

  /**
   * Format duration in minutes / hours
   */
  function formatMinutes(seconds) {
    if (!seconds || seconds <= 0) return '0m';
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }

  /**
   * Render Analytics
   */
  async function renderAnalytics() {
    currentAnalytics = await DopamineDietStorage.getAnalytics();
    const todayKey = DopamineDietStorage.getTodayKey();
    const todayData = currentAnalytics.daily[todayKey] || {
      secondsByDomain: {},
      scrollsAverted: 0
    };

    let todaySeconds = 0;
    for (const sec of Object.values(todayData.secondsByDomain || {})) {
      todaySeconds += sec;
    }
    if (statTimeToday) statTimeToday.textContent = formatMinutes(todaySeconds);

    let weekSeconds = 0;
    const now = new Date();
    const last7DaysKeys = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      last7DaysKeys.push({ key, label: d.toLocaleDateString(undefined, { weekday: 'short' }) });

      const dayObj = currentAnalytics.daily[key];
      if (dayObj && dayObj.secondsByDomain) {
        for (const s of Object.values(dayObj.secondsByDomain)) {
          weekSeconds += s;
        }
      }
    }
    if (statTimeWeek) statTimeWeek.textContent = `${formatMinutes(weekSeconds)} tracked this week`;
    if (statScrollsAverted) statScrollsAverted.textContent = todayData.scrollsAverted || 0;
    if (statSitesCount) {
      const activeCount = (currentSettings.targetSites || []).filter((s) => s.enabled).length;
      statSitesCount.textContent = activeCount;
    }

    renderDomainBars(todayData.secondsByDomain || {});
    renderTrendCanvas(last7DaysKeys);
  }

  /**
   * Render Domain Bars
   */
  function renderDomainBars(secondsByDomain) {
    if (!domainBarsContainer) return;
    const entries = Object.entries(secondsByDomain).sort((a, b) => b[1] - a[1]);
    domainBarsContainer.innerHTML = '';

    if (entries.length === 0) {
      domainBarsContainer.innerHTML = '<div class="dd-empty-hint">No distracting websites visited today yet.</div>';
      return;
    }

    const maxSeconds = Math.max(...entries.map((e) => e[1]), 60);

    entries.forEach(([domain, sec]) => {
      const percent = Math.min(100, Math.max(8, Math.round((sec / maxSeconds) * 100)));
      const row = document.createElement('div');
      row.className = 'dd-domain-bar-row';
      row.innerHTML = `
        <div class="dd-domain-bar-header">
          <span>${domain}</span>
          <span>${formatMinutes(sec)}</span>
        </div>
        <div class="dd-bar-track">
          <div class="dd-bar-fill" style="width: ${percent}%;"></div>
        </div>
      `;
      domainBarsContainer.appendChild(row);
    });
  }

  /**
   * Render Canvas 7-Day Trend Chart
   */
  function renderTrendCanvas(days) {
    if (!trendCanvas) return;
    const ctx = trendCanvas.getContext('2d');
    const width = trendCanvas.width;
    const height = trendCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const data = days.map((day) => {
      const dayObj = currentAnalytics.daily[day.key];
      let secs = 0;
      if (dayObj && dayObj.secondsByDomain) {
        for (const s of Object.values(dayObj.secondsByDomain)) {
          secs += s;
        }
      }
      return { label: day.label, minutes: Math.round(secs / 60) };
    });

    const maxMins = Math.max(...data.map((d) => d.minutes), 30);
    const barWidth = 32;
    const chartBottom = height - 28;
    const chartTop = 16;
    const usableHeight = chartBottom - chartTop;
    const spacing = (width - data.length * barWidth) / (data.length + 1);

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const primaryColor = isDarkMode ? '#a8c7fa' : '#0b57d0';
    const emptyColor = isDarkMode ? '#28292a' : '#e9eef6';

    data.forEach((item, index) => {
      const x = spacing + index * (barWidth + spacing);
      const barH = (item.minutes / maxMins) * usableHeight;
      const y = chartBottom - barH;

      const radius = 4;
      ctx.fillStyle = item.minutes > 0 ? primaryColor : emptyColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, Math.max(barH, 4), [radius, radius, 0, 0]);
      ctx.fill();

      if (item.minutes > 0) {
        ctx.fillStyle = isDarkMode ? '#c4c7c5' : '#444746';
        ctx.font = '500 11px "IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${item.minutes}m`, x + barWidth / 2, y - 6);
      }

      ctx.fillStyle = isDarkMode ? '#8e918f' : '#747775';
      ctx.font = '500 11px "IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, x + barWidth / 2, height - 10);
    });
  }

  /**
   * Render Sites List
   */
  function renderSitesTable() {
    if (!sitesListContainer) return;
    sitesListContainer.innerHTML = '';

    currentSettings.targetSites.forEach((site, index) => {
      const row = document.createElement('div');
      row.className = 'dd-site-item';
      row.innerHTML = `
        <div class="dd-site-primary">
          <span class="dd-site-name">${site.domain}</span>
        </div>
        <div class="dd-site-options">
          <label class="dd-site-opt-label">
            <span>Scroll limit</span>
            <label class="dd-switch">
              <input type="checkbox" data-index="${index}" data-prop="scrollInterrupt" ${site.scrollInterrupt ? 'checked' : ''}>
              <span class="dd-slider"></span>
            </label>
          </label>
          <label class="dd-site-opt-label">
            <span>Grayscale</span>
            <label class="dd-switch">
              <input type="checkbox" data-index="${index}" data-prop="grayscale" ${site.grayscale ? 'checked' : ''}>
              <span class="dd-slider"></span>
            </label>
          </label>
          <button class="dd-btn-remove" data-index="${index}" title="Remove site">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;
      sitesListContainer.appendChild(row);
    });

    sitesListContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', async (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        const prop = e.target.dataset.prop;
        currentSettings.targetSites[idx][prop] = e.target.checked;
        await DopamineDietStorage.saveSettings(currentSettings);
      });
    });

    sitesListContainer.querySelectorAll('.dd-btn-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.index, 10);
        const domain = currentSettings.targetSites[idx].domain;
        if (confirm(`Remove ${domain} from protection?`)) {
          currentSettings.targetSites.splice(idx, 1);
          await DopamineDietStorage.saveSettings(currentSettings);
          renderSitesTable();
          if (statSitesCount) {
            statSitesCount.textContent = currentSettings.targetSites.filter((s) => s.enabled).length;
          }
        }
      });
    });
  }

  // Add Custom Domain
  if (btnAddDomain && inputNewDomain) {
    btnAddDomain.addEventListener('click', async () => {
      const rawVal = inputNewDomain.value.trim();
      if (!rawVal) return;
      const cleanDomain = DopamineDietStorage.normalizeDomain(rawVal);
      if (!cleanDomain || !cleanDomain.includes('.')) {
        alert('Please enter a valid domain (e.g. news.ycombinator.com)');
        return;
      }

      const existing = currentSettings.targetSites.find((s) => s.domain === cleanDomain);
      if (existing) {
        alert(`${cleanDomain} is already in your protected target list.`);
        return;
      }

      currentSettings.targetSites.unshift({
        domain: cleanDomain,
        enabled: true,
        scrollInterrupt: true,
        grayscale: false
      });

      await DopamineDietStorage.saveSettings(currentSettings);
      inputNewDomain.value = '';
      renderSitesTable();
      if (statSitesCount) {
        statSitesCount.textContent = currentSettings.targetSites.filter((s) => s.enabled).length;
      }
    });

    inputNewDomain.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnAddDomain.click();
    });
  }

  // Doomscroll Sliders
  if (sliderPosts && valPosts) {
    sliderPosts.value = currentSettings.doomscrollThresholdPosts || 25;
    valPosts.textContent = `${sliderPosts.value} posts`;
    sliderPosts.addEventListener('input', async () => {
      const p = parseInt(sliderPosts.value, 10);
      valPosts.textContent = `${p} posts`;
      currentSettings.doomscrollThresholdPosts = p;
      await DopamineDietStorage.saveSettings(currentSettings);
    });
  }

  if (sliderFeedtime && valFeedtime) {
    sliderFeedtime.value = currentSettings.doomscrollThresholdMinutes || 10;
    valFeedtime.textContent = `${sliderFeedtime.value} minutes`;
    sliderFeedtime.addEventListener('input', async () => {
      const m = parseInt(sliderFeedtime.value, 10);
      valFeedtime.textContent = `${m} minutes`;
      currentSettings.doomscrollThresholdMinutes = m;
      await DopamineDietStorage.saveSettings(currentSettings);
    });
  }

  if (toggleHideBadges) {
    toggleHideBadges.checked = !!currentSettings.hideBadges;
    toggleHideBadges.addEventListener('change', async () => {
      currentSettings.hideBadges = toggleHideBadges.checked;
      await DopamineDietStorage.saveSettings(currentSettings);
    });
  }

  if (toggleGlobalGrayscale) {
    toggleGlobalGrayscale.checked = !!currentSettings.globalGrayscale;
    toggleGlobalGrayscale.addEventListener('change', async () => {
      currentSettings.globalGrayscale = toggleGlobalGrayscale.checked;
      await DopamineDietStorage.saveSettings(currentSettings);
    });
  }

  // Export & Reset
  if (btnExport) {
    btnExport.addEventListener('click', async () => {
      const data = {
        settings: await DopamineDietStorage.getSettings(),
        analytics: await DopamineDietStorage.getAnalytics(),
        exportDate: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dopaminediet-${DopamineDietStorage.getTodayKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (btnResetData) {
    btnResetData.addEventListener('click', async () => {
      if (confirm('Clear all local DopamineDiet analytics?')) {
        await chrome.storage.local.set({ dd_analytics: DopamineDietStorage.defaultAnalytics });
        renderAnalytics();
      }
    });
  }

  renderAnalytics();
  renderSitesTable();
});
