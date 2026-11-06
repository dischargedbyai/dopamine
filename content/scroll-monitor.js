/**
 * DopamineDiet - Doomscroll Interrupter Content Script
 * Monitors infinite scrolling across social feeds, Reels, and Shorts.
 * Prompts user with a mindful pause dialog when scrolling thresholds are hit.
 */

(async function () {
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'get_site_config',
      url: window.location.href
    });
  } catch (e) {
    return;
  }

  if (!response || !response.config || !response.config.enabled || !response.config.scrollInterrupt) {
    return;
  }

  const domain = response.domain || window.location.hostname;
  let postLimit = response.config.doomscrollThresholdPosts || 25;
  let timeLimitMinutes = response.config.doomscrollThresholdMinutes || 10;

  let postsScrolled = 0;
  const countedElements = new WeakSet();
  let isDialogOpen = false;
  let isDismissedForSession = false;
  let sessionStartTime = Date.now();

  // Platform specific selectors
  const platformSelectors = {
    'youtube.com': 'ytd-rich-item-renderer, ytd-video-renderer, ytd-reel-video-renderer, ytd-compact-video-renderer, ytd-shorts',
    'x.com': 'article[data-testid="tweet"], div[data-testid="cellInnerDiv"]',
    'twitter.com': 'article[data-testid="tweet"], div[data-testid="cellInnerDiv"]',
    'reddit.com': 'shreddit-post, div[data-testid="post-container"], .Post',
    'instagram.com': 'article, div[data-page-type="reels"], div[role="presentation"]',
    'tiktok.com': 'div[data-e2e="feed-item"], div[data-e2e="recommend-item-video"]',
    'facebook.com': 'div[role="feed"] > div, div[data-pagelet*="FeedUnit"]',
    'linkedin.com': 'div.feed-shared-update-v2'
  };

  // Find matching selector
  let activeSelector = null;
  for (const [key, selector] of Object.entries(platformSelectors)) {
    if (domain === key || domain.endsWith('.' + key)) {
      activeSelector = selector;
      break;
    }
  }

  /**
   * Pause active media on page when interrupter triggers
   */
  function pauseVideos() {
    try {
      const videos = document.querySelectorAll('video');
      videos.forEach((v) => {
        if (!v.paused) {
          v.pause();
        }
      });
    } catch (e) {}
  }

  /**
   * Display the Material 3 Doomscroll Dialog
   */
  function showDoomscrollDialog(reasonText) {
    if (isDialogOpen || isDismissedForSession) return;
    isDialogOpen = true;
    pauseVideos();

    // Prevent background scrolling
    const origHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    // Shadow DOM host
    const host = document.createElement('div');
    host.id = 'dd-scroll-interrupter-host';
    const shadow = host.attachShadow({ mode: 'open' });

    // Link stylesheet
    const cssUrl = chrome.runtime.getURL('content/scroll-dialog.css');
    const linkElem = document.createElement('link');
    linkElem.setAttribute('rel', 'stylesheet');
    linkElem.setAttribute('href', cssUrl);
    shadow.appendChild(linkElem);

    const scrim = document.createElement('div');
    scrim.className = 'dd-dialog-scrim';
    scrim.innerHTML = `
      <div class="dd-dialog-surface">
        <h2 class="dd-dialog-headline">Mindful pause</h2>
        <p class="dd-dialog-body">
          ${reasonText}<br>
          The feed algorithm is designed to keep you scrolling forever. <strong>Have you found what you came for?</strong>
        </p>

        <div class="dd-dialog-actions">
          <button class="dd-dialog-btn dd-btn-primary" id="dd-btn-leave">
            Close feed & step away
          </button>
          <button class="dd-dialog-btn dd-btn-secondary" id="dd-btn-extend">
            Give me 5 more minutes
          </button>
          <button class="dd-dialog-btn dd-btn-tertiary" id="dd-btn-dismiss">
            I'm doing intentional research (dismiss)
          </button>
        </div>
      </div>
    `;
    shadow.appendChild(scrim);
    document.body.appendChild(host);

    function closeDialog() {
      host.classList.add('dd-dialog-fade-out');
      document.documentElement.style.overflow = origHtmlOverflow;
      setTimeout(() => {
        host.remove();
        isDialogOpen = false;
      }, 300);
    }

    // Atomic tab close & averted scroll tracking
    shadow.getElementById('dd-btn-leave').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'close_tab',
        domain: domain
      });
    });

    shadow.getElementById('dd-btn-extend').addEventListener('click', () => {
      // Extend limit: +15 posts and +5 minutes
      postLimit = postsScrolled + 15;
      timeLimitMinutes += 5;
      closeDialog();
    });

    shadow.getElementById('dd-btn-dismiss').addEventListener('click', () => {
      isDismissedForSession = true;
      closeDialog();
    });
  }

  /**
   * Intersection observer to count posts as they enter the screen
   */
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !countedElements.has(entry.target)) {
          countedElements.add(entry.target);
          postsScrolled++;

          if (postsScrolled >= postLimit) {
            showDoomscrollDialog(`You have scrolled past <strong>${postsScrolled} posts</strong>.`);
          }
        }
      });
    },
    { threshold: 0.2 }
  );

  /**
   * Scan DOM for new feed elements
   */
  function scanFeed() {
    if (isDialogOpen || isDismissedForSession) return;

    if (activeSelector) {
      const items = document.querySelectorAll(activeSelector);
      items.forEach((item) => {
        if (!countedElements.has(item)) {
          observer.observe(item);
        }
      });
    }
  }

  // Fallback for infinite scroll on sites without specific selectors
  let lastScrollY = window.scrollY;
  let cumulativeScroll = 0;

  function handleScroll() {
    if (isDialogOpen || isDismissedForSession) return;

    const currentY = window.scrollY;
    const delta = currentY - lastScrollY;
    if (delta > 0) {
      cumulativeScroll += delta;
      const approxScreenHeights = Math.floor(cumulativeScroll / window.innerHeight);
      if (!activeSelector && approxScreenHeights >= postLimit) {
        showDoomscrollDialog(`You have scrolled through <strong>${approxScreenHeights} pages</strong> of content.`);
      }
    }
    lastScrollY = currentY;
    scanFeed();
  }

  // Periodic check for elapsed continuous feed time
  setInterval(() => {
    if (isDialogOpen || isDismissedForSession) return;
    const elapsedMinutes = (Date.now() - sessionStartTime) / 60000;
    if (elapsedMinutes >= timeLimitMinutes) {
      showDoomscrollDialog(`You have spent <strong>${Math.floor(elapsedMinutes)} minutes</strong> continuously on this feed.`);
    }
  }, 15000);

  // Initial scan and listeners
  function initFeedTracking() {
    scanFeed();
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeedTracking);
  } else {
    initFeedTracking();
  }

  // MutationObserver for dynamically loaded feed posts
  const mutationObserver = new MutationObserver(() => {
    scanFeed();
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // SPA navigation handling (e.g. YouTube watch -> home or Reels/Shorts)
  let lastUrl = window.location.href;
  function handleUrlChange() {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      postsScrolled = 0;
      cumulativeScroll = 0;
      sessionStartTime = Date.now();
      isDismissedForSession = false;
      scanFeed();
    }
  }

  window.addEventListener('yt-navigate-finish', handleUrlChange);
  window.addEventListener('popstate', handleUrlChange);
  setInterval(handleUrlChange, 1000);
})();
