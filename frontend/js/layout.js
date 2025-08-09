import { appState } from './core.js';
import { renderApiTrendChart } from './charts.js';

export function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabSlider = document.querySelector('.tab-slider');
  const viewContainer = document.getElementById('view-container');
  const tabOrder = Array.from(tabBtns).map((btn) => btn.dataset.view);
  const viewElements = Array.from(document.querySelectorAll('.view-content'));
  const viewHeights = new Map(); // key: view element id, value: height in px
  let viewsResizeObserver = null;

  function getActiveViewElement() {
    const activeTab = document.querySelector('.tab-btn.active');
    const activeViewName = activeTab ? activeTab.dataset.view : tabOrder[0];
    return activeViewName ? document.getElementById(`${activeViewName}-view`) : null;
  }

  function applyHeightForActiveView() {
    const activeView = getActiveViewElement();
    if (!activeView || !viewContainer) return;
    const cached = viewHeights.get(activeView.id);
    const targetHeight = typeof cached === 'number' ? cached : activeView.scrollHeight;
    viewContainer.style.height = `${targetHeight}px`;
  }

  function measureAllViewsOnce() {
    viewElements.forEach((el) => {
      const height = el.scrollHeight;
      viewHeights.set(el.id, height);
    });
  }

  function setupViewsResizeObserver() {
    if (viewsResizeObserver) viewsResizeObserver.disconnect();
    viewsResizeObserver = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target;
        const newHeight = Math.ceil(entry.contentRect.height);
        if (viewHeights.get(el.id) !== newHeight) {
          viewHeights.set(el.id, newHeight);
          changed = true;
        }
      }
      if (changed) requestAnimationFrame(applyHeightForActiveView);
    });
    viewElements.forEach((el) => viewsResizeObserver.observe(el));
  }

  function updateSlider(activeTab) {
    if (!tabSlider || !activeTab) return;
    tabSlider.style.width = `${activeTab.offsetWidth}px`;
    tabSlider.style.transform = `translateX(${activeTab.offsetLeft}px)`;
  }

  function switchView(viewName) {
    const viewIndex = tabOrder.indexOf(viewName);
    if (viewIndex === -1) return;
    const offset = viewIndex * -100;
    // Pre-apply the target view's height for smoother transition
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
      const cached = viewHeights.get(targetView.id);
      const targetHeight = typeof cached === 'number' ? cached : targetView.scrollHeight;
      viewContainer.style.height = `${targetHeight}px`;
    }
    viewContainer.style.transform = `translateX(${offset}%)`;
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const viewName = btn.dataset.view;
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateSlider(btn);
      switchView(viewName);
      setTimeout(() => window.scrollTo(0, 0), 300);
      window.location.hash = viewName;
    });
  });

  window.addEventListener('resize', () => {
    const activeTab = document.querySelector('.tab-btn.active');
    updateSlider(activeTab);
    applyHeightForActiveView();
  });

  // Initialize measured height and observer once tabs are set up
  requestAnimationFrame(() => {
    measureAllViewsOnce();
    setupViewsResizeObserver();
    applyHeightForActiveView();
  });
}

export function initializeActiveTab() {
  const viewName = window.location.hash.substring(1);
  let targetTab = viewName
    ? document.querySelector(`.tab-btn[data-view="${viewName}"]`)
    : document.querySelector('.tab-btn.active');
  if (!targetTab) targetTab = document.querySelector('.tab-btn');
  if (targetTab) requestAnimationFrame(() => targetTab.click());
}

export function setupSwipeNavigation() {
  const main = document.body;
  let touchStartX = 0;
  let touchEndX = 0;
  let touchStartY = 0;
  let touchEndY = 0;
  let isInsideScrollable = false;
  let isInsideChart = false;

  main.addEventListener(
    'touchstart',
    function (event) {
      touchStartX = event.changedTouches[0].screenX;
      touchStartY = event.changedTouches[0].screenY;
      let target = event.target;
      isInsideScrollable = false;
      isInsideChart = !!target.closest('#api-trend-card');
      while (target && target !== document.body) {
        const style = window.getComputedStyle(target);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') { isInsideScrollable = true; break; }
        target = target.parentElement;
      }
    },
    { passive: true }
  );

  main.addEventListener(
    'touchend',
    function (event) {
      touchEndX = event.changedTouches[0].screenX;
      touchEndY = event.changedTouches[0].screenY;
      handleSwipeGesture();
    },
    { passive: true }
  );

  function handleSwipeGesture() {
    if (isInsideScrollable || isInsideChart) return;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      const tabBtns = document.querySelectorAll('.tab-btn');
      const activeTab = document.querySelector('.tab-btn.active');
      const tabOrder = Array.from(tabBtns).map((btn) => btn.dataset.view);
      const activeTabIndex = tabOrder.indexOf(activeTab.dataset.view);
      if (deltaX < 0) {
        if (activeTabIndex < tabBtns.length - 1) tabBtns[activeTabIndex + 1].click();
      } else {
        if (activeTabIndex > 0) tabBtns[activeTabIndex - 1].click();
      }
    }
  }
}

export function setupThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const doc = document.documentElement;
  const lightIcon = 'assets/black.svg';
  const darkIcon = 'assets/white.svg';

  function applyTheme(theme) {
    doc.setAttribute('data-theme', theme);
    themeIcon.src = theme === 'dark' ? darkIcon : lightIcon;
    localStorage.setItem('theme', theme);
    if (appState.apiTrendChart && appState.lastTrendData) renderApiTrendChart(appState.lastTrendData);
  }

  themeToggle.addEventListener('click', () => {
    const currentTheme = doc.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  });

  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme);
}


