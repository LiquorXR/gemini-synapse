import { appState, showError } from './core.js';

export async function fetchAndRenderTrendChart(range = '1d') {
  try {
    const response = await fetch(`/admin/stats/trend?range=${range}`);
    if (!response.ok) throw new Error('获取趋势数据失败');
    const trendData = await response.json();
    appState.lastTrendData = trendData;
    renderApiTrendChart(trendData);
  } catch (err) {
    showError(err.message);
    const chartCanvas = document.getElementById('api-trend-chart');
    if (chartCanvas) {
      const ctx = chartCanvas.getContext('2d');
      ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
      ctx.font = "14px 'Inter', sans-serif";
      ctx.fillStyle = 'grey';
      ctx.textAlign = 'center';
      ctx.fillText('无法加载图表数据', chartCanvas.width / 2, chartCanvas.height / 2);
    }
  }
}

export function renderApiTrendChart(trendData) {
  if (!trendData || !trendData.datasets || trendData.datasets.length === 0) {
    const chartCanvas = document.getElementById('api-trend-chart');
    if (chartCanvas) {
      const ctx = chartCanvas.getContext('2d');
      ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
      ctx.font = "14px 'Inter', sans-serif";
      ctx.fillStyle = 'grey';
      ctx.textAlign = 'center';
      ctx.fillText('暂无调用数据', chartCanvas.width / 2, chartCanvas.height / 2);
    }
    return;
  }

  const ctx = document.getElementById('api-trend-chart').getContext('2d');
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const labelColor = isDarkMode ? '#9ca3af' : '#6b7280';
  const legendColor = isDarkMode ? '#d1d5db' : '#374151';

  const colors = [
    '#3b82f6', '#10b981', '#ef4444', '#f97316', '#8b5cf6', '#d946ef',
    '#ec4899', '#6366f1', '#06b6d4', '#f59e0b', '#84cc16', '#22c55e',
  ];

  const datasets = trendData.datasets.map((dataset, index) => {
    const color = colors[index % colors.length];
    return {
      label: dataset.label,
      data: dataset.data,
      borderColor: color,
      backgroundColor: `${color}1a`,
      pointBackgroundColor: color,
      pointBorderColor: color,
      pointRadius: 2,
      borderWidth: 2,
      fill: true,
      tension: 0.3,
    };
  });

  const chartConfig = {
    type: 'line',
    data: { labels: trendData.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { color: legendColor, boxWidth: 12, font: { size: 10 } },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
          titleColor: isDarkMode ? '#f9fafb' : '#111827',
          bodyColor: isDarkMode ? '#d1d5db' : '#374151',
          borderColor: gridColor,
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: labelColor, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: labelColor, font: { size: 10 }, precision: 0 }, grid: { color: gridColor, borderDash: [2, 4] } },
      },
    },
  };

  if (appState.apiTrendChart) {
    appState.apiTrendChart.destroy();
  }
  // Chart is provided by CDN in index.html
  // eslint-disable-next-line no-undef
  appState.apiTrendChart = new Chart(ctx, chartConfig);
setTimeout(() => {
    if (appState.apiTrendChart) {
      appState.apiTrendChart.update('none'); // 'none' prevents animation
    }
  }, 1); // A minimal delay to allow the initial render to complete
}


