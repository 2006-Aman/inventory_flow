// analytics.js - Analytics page.
// Inventory value, stock turnover, day-of-week patterns, monthly
// revenue vs orders, stock health and category performance. All live.

let analyticsCharts = {};

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();
  renderKpis();
  renderDayOfWeekChart();
  renderRevenueOrdersChart();
  renderStockHealthChart();
  renderCategoriesTable();
  updateSidebarBadge();
});

function getLast90Sales() {
  const sales = getSales();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 89);
  const cutoffKey = toDateKey(cutoff);
  return sales.filter(function (s) { return toDateKey(parseDate(s.date)) >= cutoffKey; });
}

function renderKpis() {
  const products = getProducts();
  const recent = getLast90Sales();

  // Inventory value at cost
  const value = products.reduce(function (sum, p) { return sum + Number(p.stock) * Number(p.costPrice); }, 0);
  document.getElementById('ana-value').textContent = formatCurrency(value);

  // Stock turnover: units sold in 30d / average stock
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 29);
  const cutoffKey = toDateKey(cutoff);
  const monthSales = getSales().filter(function (s) { return toDateKey(parseDate(s.date)) >= cutoffKey; });
  let unitsSold = 0;
  for (const s of monthSales) unitsSold += Number(s.quantity);
  const avgStock = products.length ? products.reduce(function (sum, p) { return sum + Number(p.stock); }, 0) / products.length : 0;
  document.getElementById('ana-turnover').textContent = avgStock > 0 ? (unitsSold / avgStock).toFixed(1) + 'x' : 'n/a';

  // Best category by 30-day revenue
  const catMap = {};
  for (const p of products) catMap[String(p.id)] = p.category || 'Uncategorized';
  const byCat = {};
  for (const s of monthSales) {
    const cat = catMap[String(s.productId)] || 'Uncategorized';
    byCat[cat] = (byCat[cat] || 0) + Number(s.quantity) * Number(s.sellingPrice);
  }
  const best = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; })[0];
  document.getElementById('ana-best-cat').textContent = best || 'n/a';

  // Avg units per order
  let totalUnits = 0;
  for (const s of getSales()) totalUnits += Number(s.quantity);
  const orderCount = getSales().length;
  document.getElementById('ana-avg-units').textContent = orderCount ? (totalUnits / orderCount).toFixed(2) : 'n/a';
}

function renderDayOfWeekChart() {
  const canvas = document.getElementById('chart-dayofweek');
  if (!canvas) return;

  const recent = getLast90Sales();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const s of recent) {
    totals[parseDate(s.date).getDay()] += Number(s.quantity) * Number(s.sellingPrice);
  }

  analyticsCharts.dayofweek = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: dayNames,
      datasets: [{
        label: 'Revenue',
        data: totals,
        backgroundColor: ['#f472b6', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa', '#fb923c', '#60a5fa'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0b1220', borderColor: 'rgba(148,163,184,0.2)', borderWidth: 1, titleColor: '#fff', bodyColor: '#94a3b8' }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b' } },
        y: { grid: { color: 'rgba(148, 163, 184, 0.08)' }, ticks: { color: '#64748b' } }
      }
    }
  });
}

function renderRevenueOrdersChart() {
  const canvas = document.getElementById('chart-revenue-orders');
  if (!canvas) return;

  // Build month buckets (last 6)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: MONTH_SHORT[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2), key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), revenue: 0, orders: 0 });
  }
  const bucketMap = {};
  for (const m of months) bucketMap[m.key] = m;

  for (const s of getSales()) {
    const d = parseDate(s.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const bucket = bucketMap[key];
    if (bucket) {
      bucket.revenue += Number(s.quantity) * Number(s.sellingPrice);
      bucket.orders++;
    }
  }

  analyticsCharts.revOrders = new Chart(canvas.getContext('2d'), {
    data: {
      labels: months.map(function (m) { return m.label; }),
      datasets: [
        {
          type: 'bar',
          label: 'Revenue',
          data: months.map(function (m) { return m.revenue; }),
          backgroundColor: 'rgba(56, 189, 248, 0.7)',
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Orders',
          data: months.map(function (m) { return m.orders; }),
          borderColor: '#a78bfa',
          backgroundColor: 'transparent',
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', boxWidth: 12, padding: 16, font: { size: 12 } } },
        tooltip: { backgroundColor: '#0b1220', borderColor: 'rgba(148,163,184,0.2)', borderWidth: 1, titleColor: '#fff', bodyColor: '#94a3b8' }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b' } },
        y: { position: 'left', grid: { color: 'rgba(148, 163, 184, 0.08)' }, ticks: { color: '#64748b' } },
        y1: { position: 'right', grid: { display: false }, ticks: { color: '#a78bfa' } }
      }
    }
  });
}

function renderStockHealthChart() {
  const canvas = document.getElementById('chart-stock-health');
  if (!canvas) return;

  let inStock = 0, low = 0, critical = 0, out = 0;
  for (const p of getProducts()) {
    if (p.status === 'In Stock') inStock++;
    else if (p.status === 'Low Stock') low++;
    else if (p.status === 'Out of Stock') out++;
    else critical++;
  }

  analyticsCharts.health = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['In Stock', 'Low Stock', 'Critical', 'Out of Stock'],
      datasets: [{
        data: [inStock, low, critical, out],
        backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 12, padding: 12, font: { size: 11 } } },
        tooltip: { backgroundColor: '#0b1220', borderColor: 'rgba(148,163,184,0.2)', borderWidth: 1, titleColor: '#fff', bodyColor: '#94a3b8' }
      }
    }
  });
}

function renderCategoriesTable() {
  const tbody = document.getElementById('ana-categories-tbody');
  const products = getProducts();

  const byCat = {};
  for (const p of products) {
    const cat = p.category || 'Uncategorized';
    if (!byCat[cat]) byCat[cat] = { products: 0, units: 0, revenue: 0 };
    byCat[cat].products++;
  }

  const catMap = {};
  for (const p of products) catMap[String(p.id)] = p.category || 'Uncategorized';
  for (const s of getSales()) {
    const cat = catMap[String(s.productId)];
    if (cat && byCat[cat]) {
      byCat[cat].units += Number(s.quantity);
      byCat[cat].revenue += Number(s.quantity) * Number(s.sellingPrice);
    }
  }

  const rows = Object.keys(byCat)
    .map(function (c) { return { name: c, products: byCat[c].products, units: byCat[c].units, revenue: byCat[c].revenue }; })
    .sort(function (a, b) { return b.revenue - a.revenue; });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No data.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function (r) {
    return '<tr>' +
      '<td>' + escapeHtml(r.name) + '</td>' +
      '<td class="num">' + formatNumber(r.products) + '</td>' +
      '<td class="num">' + formatNumber(r.units) + '</td>' +
      '<td class="num">' + formatCurrency(r.revenue) + '</td>' +
      '</tr>';
  }).join('');
}
