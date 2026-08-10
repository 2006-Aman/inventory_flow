// forecast.js - Demand forecast page.
// Computes a 7-day moving average forecast from LocalStorage sales and
// compares it against actual demand. Everything is derived live.

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();

  renderKpis();
  renderForecastChart();
  renderTopForecast();
  renderForecastTable();
  updateSidebarBadge();
  wireEvents();
});

function wireEvents() {
  document.getElementById('forecast-export-btn').addEventListener('click', exportForecastCSV);
}

// Daily demand series: { 'YYYY-MM-DD': units }
function getDailyDemand() {
  const series = {};
  for (const sale of getSales()) {
    const key = toDateKey(parseDate(sale.date));
    series[key] = (series[key] || 0) + Number(sale.quantity);
  }
  return series;
}

// Build ordered day keys (date -> units) for the last n days
function getLastDays(n) {
  const demand = getDailyDemand();
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = toDateKey(d);
    days.push({ key: key, actual: demand[key] || 0 });
  }
  return days;
}

// 7-day moving average over a list of {key, actual}
function movingAverage(days, window) {
  const out = [];
  for (let i = 0; i < days.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      sum += days[j].actual;
      count++;
    }
    out.push(count ? sum / count : 0);
  }
  return out;
}

function getForecastAccuracy() {
  // Forecast for each of the last 7 days = average of the 7 days before it.
  const days = getLastDays(21); // 21 days so we have 14 forecast windows
  let totalForecast = 0;
  let totalActual = 0;
  for (let i = 14; i < 21; i++) {
    let sum = 0;
    for (let j = i - 7; j < i; j++) sum += days[j].actual;
    totalForecast += sum / 7;
    totalActual += days[i].actual;
  }
  if (!totalActual) return null;
  const error = Math.abs(totalForecast - totalActual) / totalActual;
  return Math.max(0, Math.round((1 - error) * 100));
}

function renderKpis() {
  const products = getProducts();
  const days = getLastDays(7);
  let last7 = 0;
  for (const d of days) last7 += d.actual;

  const avgDaily = products.reduce(function (sum, p) { return sum + Number(p.averageDailyDemand || 0); }, 0);

  document.getElementById('kpi-demand-7').textContent = formatNumber(Math.round(avgDaily * 7));
  document.getElementById('kpi-demand-7-sub').textContent = 'last 7 days actual: ' + formatNumber(last7) + ' units';
  document.getElementById('kpi-demand-30').textContent = formatNumber(Math.round(avgDaily * 30));
  document.getElementById('kpi-demand-30-sub').textContent = formatNumber(products.length) + ' products tracked';

  const accuracy = getForecastAccuracy();
  document.getElementById('kpi-accuracy').textContent = accuracy === null ? 'n/a' : accuracy + '%';
  document.getElementById('kpi-accuracy-sub').textContent = accuracy === null ? 'not enough data yet' : '7-day moving average';
  if (accuracy !== null) {
    document.getElementById('kpi-accuracy').style.color = accuracy >= 80 ? '#10b981' : accuracy >= 60 ? '#f59e0b' : '#ef4444';
  }

  document.getElementById('kpi-need-reorder').textContent = formatNumber(countProductsNeedingReorder());
  document.getElementById('kpi-need-reorder-sub').textContent = 'below reorder point';
}

function renderForecastChart() {
  const canvas = document.getElementById('chart-forecast');
  if (!canvas) return;

  const days = getLastDays(14);
  const labels = days.map(function (d) { return formatShortDate(d.key); });
  const forecast = movingAverage(days, 7).map(function (v) { return Math.round(v * 100) / 100; });
  const actual = days.map(function (d) { return d.actual; });

  const ctx = canvas.getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Actual sales',
          data: actual,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3
        },
        {
          label: 'Forecast (7-day avg)',
          data: forecast,
          borderColor: '#a78bfa',
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: '#94a3b8', boxWidth: 12, padding: 16, font: { size: 12 } }
        },
        tooltip: {
          backgroundColor: '#0b1220',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#94a3b8'
        }
      },
      scales: {
        x: { grid: { color: 'rgba(148, 163, 184, 0.08)' }, ticks: { color: '#64748b' } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

function renderTopForecast() {
  const container = document.getElementById('top-forecast-list');
  const top = getProducts()
    .slice()
    .sort(function (a, b) { return Number(b.forecastDemand || 0) - Number(a.forecastDemand || 0); })
    .slice(0, 8);

  if (!top.length) {
    container.innerHTML = '<div class="empty-state">No products found.</div>';
    return;
  }

  container.innerHTML = top.map(function (p, i) {
    const forecast7 = Math.round(Number(p.forecastDemand || 0));
    const avg = Number(p.averageDailyDemand || 0);
    return '<div class="forecast-rank-item">' +
      '<div class="rank">' + (i + 1) + '</div>' +
      '<div class="fr-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="fr-meta">' + avg.toFixed(1) + ' /day</div>' +
      '<div class="fr-value">' + formatNumber(forecast7) + ' units</div>' +
      '</div>';
  }).join('');
}

function renderForecastTable() {
  const tbody = document.getElementById('forecast-tbody');
  const products = getProducts().slice().sort(function (a, b) {
    return Number(b.forecastDemand || 0) - Number(a.forecastDemand || 0);
  });

  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No products yet.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(function (p) {
    const avg = Number(p.averageDailyDemand || 0);
    const forecast7 = Math.round(Number(p.forecastDemand || 0));
    const forecast30 = Math.round(avg * 30);
    const stock = Number(p.stock);
    const rop = Number(p.reorderPoint);
    const daysToStockout = avg > 0 ? (stock / avg) : Infinity;
    const daysText = avg > 0
      ? (daysToStockout >= 90 ? '90+' : Math.floor(daysToStockout) + ' days')
      : 'no sales';

    const status = p.status;
    const statusClass = status === 'In Stock' ? 'ok' : status === 'Low Stock' ? 'warn' : 'danger';
    const ropColor = stock <= rop ? '#ef4444' : '#94a3b8';

    return '<tr>' +
      '<td><div class="prod-name">' + escapeHtml(p.name) + '</div><div class="prod-sku">' + escapeHtml(p.sku) + '</div></td>' +
      '<td class="num">' + avg.toFixed(1) + '</td>' +
      '<td class="num" style="font-weight:600;color:#38bdf8;">' + formatNumber(forecast7) + '</td>' +
      '<td class="num">' + formatNumber(forecast30) + '</td>' +
      '<td class="num">' + formatNumber(stock) + '</td>' +
      '<td class="num" style="color:' + ropColor + ';">' + formatNumber(rop) + '</td>' +
      '<td class="num">' + daysText + '</td>' +
      '<td><span class="status-pill ' + statusClass + '">' + status + '</span></td>' +
      '</tr>';
  }).join('');
}

function exportForecastCSV() {
  const products = getProducts();
  if (!products.length) {
    showToast('Nothing to export.', 'error');
    return;
  }
  const rows = products.map(function (p) {
    return {
      SKU: p.sku,
      Product: p.name,
      Category: p.category,
      AvgDailyDemand: Number(p.averageDailyDemand || 0),
      Forecast7d: Math.round(Number(p.forecastDemand || 0)),
      Forecast30d: Math.round(Number(p.averageDailyDemand || 0) * 30),
      CurrentStock: p.stock,
      ReorderPoint: p.reorderPoint,
      Status: p.status
    };
  });
  downloadFile('demand-forecast.csv', toCSV(rows), 'text/csv;charset=utf-8');
  showToast('Forecast CSV downloaded.', 'success');
}
