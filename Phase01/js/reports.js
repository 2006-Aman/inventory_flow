// reports.js - Reports page.
// Aggregates sales from LocalStorage over a chosen date range into
// KPIs, charts and tables. All derived live, nothing hardcoded.

const reportsState = {
  from: null,
  to: null
};

let reportsCharts = {};

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();

  // Default to last 30 days
  applyRange(30);
  wireEvents();
  updateSidebarBadge();
});

function wireEvents() {
  document.getElementById('reports-from').addEventListener('change', function (e) {
    reportsState.from = e.target.value || null;
    renderAll();
  });
  document.getElementById('reports-to').addEventListener('change', function (e) {
    reportsState.to = e.target.value || null;
    renderAll();
  });
  document.getElementById('reports-range-30').addEventListener('click', function () { applyRange(30); });
  document.getElementById('reports-range-90').addEventListener('click', function () { applyRange(90); });
  document.getElementById('reports-range-all').addEventListener('click', function () {
    reportsState.from = null;
    reportsState.to = null;
    document.getElementById('reports-from').value = '';
    document.getElementById('reports-to').value = '';
    renderAll();
  });
  document.getElementById('reports-export-btn').addEventListener('click', exportReportsCSV);
}

function applyRange(days) {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));
  reportsState.from = toDateKey(from);
  reportsState.to = toDateKey(today);
  document.getElementById('reports-from').value = reportsState.from;
  document.getElementById('reports-to').value = reportsState.to;
  renderAll();
}

function getInRange() {
  let sales = getSales();
  if (reportsState.from) sales = sales.filter(function (s) { return toDateKey(parseDate(s.date)) >= reportsState.from; });
  if (reportsState.to) sales = sales.filter(function (s) { return toDateKey(parseDate(s.date)) <= reportsState.to; });
  return sales;
}

function getSummary(sales) {
  let revenue = 0, profit = 0, units = 0;
  for (const s of sales) {
    revenue += Number(s.quantity) * Number(s.sellingPrice);
    profit += Number(s.profit);
    units += Number(s.quantity);
  }
  return { revenue: revenue, profit: profit, units: units, orders: sales.length };
}

function renderAll() {
  const sales = getInRange();
  const summary = getSummary(sales);

  document.getElementById('rpt-revenue').textContent = formatCurrency(summary.revenue);
  document.getElementById('rpt-profit').textContent = formatCurrency(summary.profit);
  document.getElementById('rpt-profit').style.color = summary.profit >= 0 ? '#34d399' : '#ef4444';
  document.getElementById('rpt-orders').textContent = formatNumber(summary.orders);
  document.getElementById('rpt-units').textContent = formatNumber(summary.units);
  document.getElementById('rpt-avg').textContent = summary.orders ? formatCurrency(summary.revenue / summary.orders) : formatCurrency(0);

  renderTrendChart(sales);
  renderCategoryChart(sales);
  renderMonthlyTable(sales);
  renderTopProducts(sales);
}

// Daily revenue line chart
function renderTrendChart(sales) {
  const canvas = document.getElementById('chart-reports-trend');
  if (!canvas) return;

  const buckets = {};
  for (const s of sales) {
    const key = toDateKey(parseDate(s.date));
    buckets[key] = (buckets[key] || 0) + Number(s.quantity) * Number(s.sellingPrice);
  }
  const keys = Object.keys(buckets).sort();
  const labels = keys.map(function (k) { return formatShortDate(k); });

  // Destroy any previous chart on this canvas
  if (reportsCharts.trend) reportsCharts.trend.destroy();
  reportsCharts.trend = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Revenue',
        data: keys.map(function (k) { return buckets[k]; }),
        backgroundColor: 'rgba(56, 189, 248, 0.7)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0b1220',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#94a3b8'
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', maxRotation: 60 } },
        y: { grid: { color: 'rgba(148, 163, 184, 0.08)' }, ticks: { color: '#64748b' } }
      }
    }
  });
}

// Revenue by category doughnut
function renderCategoryChart(sales) {
  const canvas = document.getElementById('chart-reports-category');
  if (!canvas) return;

  const catMap = {};
  for (const p of getProducts()) catMap[String(p.id)] = p.category || 'Uncategorized';

  const byCat = {};
  for (const s of sales) {
    const cat = catMap[String(s.productId)] || 'Uncategorized';
    byCat[cat] = (byCat[cat] || 0) + Number(s.quantity) * Number(s.sellingPrice);
  }
  const labels = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
  const values = labels.map(function (l) { return byCat[l]; });

  if (reportsCharts.category) reportsCharts.category.destroy();
  reportsCharts.category = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#2dd4bf']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 12, padding: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#0b1220',
          borderColor: 'rgba(148, 163, 184, 0.2)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#94a3b8'
        }
      }
    }
  });
}

function renderMonthlyTable(sales) {
  const tbody = document.getElementById('rpt-monthly-tbody');
  const byMonth = {};
  for (const s of sales) {
    const key = formatDate(s.date).slice(0, 7); // "MMM YYYY"
    if (!byMonth[key]) byMonth[key] = { orders: 0, units: 0, revenue: 0, profit: 0 };
    byMonth[key].orders++;
    byMonth[key].units += Number(s.quantity);
    byMonth[key].revenue += Number(s.quantity) * Number(s.sellingPrice);
    byMonth[key].profit += Number(s.profit);
  }
  const months = Object.keys(byMonth).sort().reverse();

  if (!months.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No sales in this range.</td></tr>';
    return;
  }

  tbody.innerHTML = months.map(function (m) {
    const row = byMonth[m];
    return '<tr>' +
      '<td>' + m + '</td>' +
      '<td class="num">' + formatNumber(row.orders) + '</td>' +
      '<td class="num">' + formatNumber(row.units) + '</td>' +
      '<td class="num">' + formatCurrency(row.revenue) + '</td>' +
      '<td class="num" style="color:#34d399;">' + formatCurrency(row.profit) + '</td>' +
      '</tr>';
  }).join('');
}

function renderTopProducts(sales) {
  const tbody = document.getElementById('rpt-top-tbody');
  const byProduct = {};
  for (const s of sales) {
    const key = String(s.productId);
    if (!byProduct[key]) byProduct[key] = { name: s.productName, units: 0, revenue: 0, profit: 0 };
    byProduct[key].units += Number(s.quantity);
    byProduct[key].revenue += Number(s.quantity) * Number(s.sellingPrice);
    byProduct[key].profit += Number(s.profit);
  }
  const rows = Object.keys(byProduct).map(function (k) { return byProduct[k]; })
    .sort(function (a, b) { return b.revenue - a.revenue; })
    .slice(0, 10);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No sales in this range.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function (r) {
    return '<tr>' +
      '<td><div class="prod-name">' + escapeHtml(r.name) + '</div></td>' +
      '<td class="num">' + formatNumber(r.units) + '</td>' +
      '<td class="num">' + formatCurrency(r.revenue) + '</td>' +
      '<td class="num" style="color:#34d399;">' + formatCurrency(r.profit) + '</td>' +
      '</tr>';
  }).join('');
}

function exportReportsCSV() {
  const sales = getInRange();
  if (!sales.length) {
    showToast('Nothing to export for this range.', 'error');
    return;
  }
  const rows = sales.map(function (s) {
    return {
      ID: s.id,
      Product: s.productName,
      Quantity: s.quantity,
      SellingPrice: s.sellingPrice,
      Profit: s.profit,
      Total: Number(s.quantity) * Number(s.sellingPrice),
      Customer: s.customer,
      Date: s.date
    };
  });
  downloadFile('reports-export.csv', toCSV(rows), 'text/csv;charset=utf-8');
  showToast('Report CSV downloaded.', 'success');
}
