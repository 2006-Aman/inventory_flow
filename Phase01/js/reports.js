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
  updateActiveRangeBtn('reports-range-30');
  applyRange(30);
  wireEvents();
  updateSidebarBadge();
});

function wireEvents() {
  ['reports-from', 'reports-to'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (e) {
        try {
          if (typeof e.target.showPicker === 'function') {
            e.target.showPicker();
          }
        } catch (err) {
          // Ignored if browser prevents programmatic picker call
        }
      });
    }
  });

  document.getElementById('reports-from').addEventListener('change', function (e) {
    reportsState.from = e.target.value || null;
    updateActiveRangeBtn(null);
    renderAll();
  });
  document.getElementById('reports-to').addEventListener('change', function (e) {
    reportsState.to = e.target.value || null;
    updateActiveRangeBtn(null);
    renderAll();
  });
  document.getElementById('reports-range-30').addEventListener('click', function () {
    updateActiveRangeBtn('reports-range-30');
    applyRange(30);
  });
  document.getElementById('reports-range-90').addEventListener('click', function () {
    updateActiveRangeBtn('reports-range-90');
    applyRange(90);
  });
  document.getElementById('reports-range-all').addEventListener('click', function () {
    updateActiveRangeBtn('reports-range-all');
    reportsState.from = null;
    reportsState.to = null;
    document.getElementById('reports-from').value = '';
    document.getElementById('reports-to').value = '';
    renderAll();
  });
  document.getElementById('reports-export-btn').addEventListener('click', exportReportsCSV);
}

function updateActiveRangeBtn(activeId) {
  document.querySelectorAll('.range-btn').forEach(btn => btn.classList.remove('active'));
  if (activeId) {
    const activeBtn = document.getElementById(activeId);
    if (activeBtn) activeBtn.classList.add('active');
  }
}

function applyRange(days) {
  if (days) {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    reportsState.from = toDateKey(from);
    reportsState.to = toDateKey(today);
    document.getElementById('reports-from').value = reportsState.from;
    document.getElementById('reports-to').value = reportsState.to;
  } else {
    reportsState.from = null;
    reportsState.to = null;
    document.getElementById('reports-from').value = '';
    document.getElementById('reports-to').value = '';
  }
  renderAll();
}

function getInRange() {
  let sales = getSales();
  if (reportsState.from) {
    sales = sales.filter(function (s) {
      return toDateKey(parseDate(s.date)) >= reportsState.from;
    });
  }
  if (reportsState.to) {
    sales = sales.filter(function (s) {
      return toDateKey(parseDate(s.date)) <= reportsState.to;
    });
  }
  return sales;
}

function getSummary(sales) {
  let revenue = 0, profit = 0, units = 0;
  for (const s of sales) {
    const qty = Number(s.quantity) || 0;
    const price = Number(s.sellingPrice) || 0;
    const cost = Number(s.costPrice) || 0;
    const p = (s.profit != null && !isNaN(s.profit)) ? Number(s.profit) : (price - cost) * qty;

    revenue += qty * price;
    profit += p;
    units += qty;
  }
  return {
    revenue: Math.round(revenue * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    units: units,
    orders: sales.length
  };
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
window.renderAll = renderAll;

// Daily revenue bar chart
function renderTrendChart(sales) {
  const canvas = document.getElementById('chart-reports-trend');
  if (!canvas) return;

  const isLight = document.body.classList.contains('theme-light');
  const textColor = isLight ? '#475569' : '#64748b';
  const gridColor = isLight ? 'rgba(203, 213, 225, 0.5)' : 'rgba(148, 163, 184, 0.08)';
  const tooltipBg = isLight ? '#ffffff' : '#0b1220';
  const tooltipTitle = isLight ? '#0f172a' : '#ffffff';
  const tooltipBody = isLight ? '#475569' : '#94a3b8';
  const tooltipBorder = isLight ? '#e2e8f0' : 'rgba(148, 163, 184, 0.2)';

  const buckets = {};
  for (const s of sales) {
    const key = toDateKey(parseDate(s.date));
    const qty = Number(s.quantity) || 0;
    const price = Number(s.sellingPrice) || 0;
    buckets[key] = (buckets[key] || 0) + (qty * price);
  }
  const keys = Object.keys(buckets).sort();
  const labels = keys.map(function (k) { return formatShortDate(k); });
  const dataValues = keys.map(function (k) { return Math.round(buckets[k] * 100) / 100; });

  if (reportsCharts.trend) reportsCharts.trend.destroy();
  reportsCharts.trend = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Revenue ($)',
        data: dataValues,
        backgroundColor: isLight ? 'rgba(2, 132, 199, 0.85)' : 'rgba(56, 189, 248, 0.7)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          callbacks: {
            label: function (ctx) {
              return 'Revenue: ' + formatCurrency(ctx.raw);
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, maxRotation: 60 } },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            callback: function (val) { return '$' + formatNumber(val); }
          }
        }
      }
    }
  });
}

// Revenue by category doughnut chart
function renderCategoryChart(sales) {
  const canvas = document.getElementById('chart-reports-category');
  if (!canvas) return;

  const isLight = document.body.classList.contains('theme-light');
  const legendColor = isLight ? '#334155' : '#94a3b8';
  const tooltipBg = isLight ? '#ffffff' : '#0b1220';
  const tooltipTitle = isLight ? '#0f172a' : '#ffffff';
  const tooltipBody = isLight ? '#475569' : '#94a3b8';
  const tooltipBorder = isLight ? '#e2e8f0' : 'rgba(148, 163, 184, 0.2)';

  const catMap = {};
  for (const p of getProducts()) catMap[String(p.id)] = p.category || 'Uncategorized';

  const byCat = {};
  for (const s of sales) {
    const cat = catMap[String(s.productId)] || s.category || 'Uncategorized';
    const qty = Number(s.quantity) || 0;
    const price = Number(s.sellingPrice) || 0;
    byCat[cat] = (byCat[cat] || 0) + (qty * price);
  }
  const labels = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
  const values = labels.map(function (l) { return Math.round(byCat[l] * 100) / 100; });

  if (reportsCharts.category) reportsCharts.category.destroy();
  reportsCharts.category = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['No Data'],
      datasets: [{
        data: values.length ? values : [0],
        backgroundColor: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#fb923c', '#4ade80', '#e879f9', '#2dd4bf']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: legendColor, boxWidth: 12, padding: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: tooltipBorder,
          borderWidth: 1,
          titleColor: tooltipTitle,
          bodyColor: tooltipBody,
          callbacks: {
            label: function (ctx) {
              return ctx.label + ': ' + formatCurrency(ctx.raw);
            }
          }
        }
      }
    }
  });
}

// Monthly Breakdown table
function renderMonthlyTable(sales) {
  const tbody = document.getElementById('rpt-monthly-tbody');
  if (!tbody) return;

  const byMonth = {};
  for (const s of sales) {
    const d = parseDate(s.date);
    const sortKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const label = MONTH_FULL[d.getMonth()] + ' ' + d.getFullYear();

    if (!byMonth[sortKey]) {
      byMonth[sortKey] = { label: label, orders: 0, units: 0, revenue: 0, profit: 0 };
    }
    const qty = Number(s.quantity) || 0;
    const price = Number(s.sellingPrice) || 0;
    const cost = Number(s.costPrice) || 0;
    const p = (s.profit != null && !isNaN(s.profit)) ? Number(s.profit) : (price - cost) * qty;

    byMonth[sortKey].orders++;
    byMonth[sortKey].units += qty;
    byMonth[sortKey].revenue += qty * price;
    byMonth[sortKey].profit += p;
  }

  const months = Object.keys(byMonth).sort().reverse();

  if (!months.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No sales in this range.</td></tr>';
    return;
  }

  tbody.innerHTML = months.map(function (m) {
    const row = byMonth[m];
    const profitColor = row.profit >= 0 ? '#34d399' : '#ef4444';
    return '<tr>' +
      '<td>' + escapeHtml(row.label) + '</td>' +
      '<td class="num">' + formatNumber(row.orders) + '</td>' +
      '<td class="num">' + formatNumber(row.units) + '</td>' +
      '<td class="num">' + formatCurrency(row.revenue) + '</td>' +
      '<td class="num" style="color:' + profitColor + ';">' + formatCurrency(row.profit) + '</td>' +
      '</tr>';
  }).join('');
}

// Top products table
function renderTopProducts(sales) {
  const tbody = document.getElementById('rpt-top-tbody');
  if (!tbody) return;

  const byProduct = {};
  for (const s of sales) {
    const key = String(s.productId || s.productName);
    const qty = Number(s.quantity) || 0;
    const price = Number(s.sellingPrice) || 0;
    const cost = Number(s.costPrice) || 0;
    const p = (s.profit != null && !isNaN(s.profit)) ? Number(s.profit) : (price - cost) * qty;

    if (!byProduct[key]) {
      byProduct[key] = { name: s.productName || 'Unknown Product', units: 0, revenue: 0, profit: 0 };
    }
    byProduct[key].units += qty;
    byProduct[key].revenue += qty * price;
    byProduct[key].profit += p;
  }

  const rows = Object.keys(byProduct).map(function (k) { return byProduct[k]; })
    .sort(function (a, b) { return b.revenue - a.revenue; })
    .slice(0, 10);

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No sales in this range.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function (r) {
    const profitColor = r.profit >= 0 ? '#34d399' : '#ef4444';
    return '<tr>' +
      '<td><div class="prod-name">' + escapeHtml(r.name) + '</div></td>' +
      '<td class="num">' + formatNumber(r.units) + '</td>' +
      '<td class="num">' + formatCurrency(r.revenue) + '</td>' +
      '<td class="num" style="color:' + profitColor + ';">' + formatCurrency(r.profit) + '</td>' +
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
    const qty = Number(s.quantity) || 0;
    const price = Number(s.sellingPrice) || 0;
    const cost = Number(s.costPrice) || 0;
    const profit = (s.profit != null && !isNaN(s.profit)) ? Number(s.profit) : (price - cost) * qty;
    return {
      ID: s.id,
      Product: s.productName,
      Quantity: qty,
      SellingPrice: price,
      Profit: profit,
      Total: qty * price,
      Customer: s.customer || '',
      Date: s.date
    };
  });
  downloadFile('reports-export.csv', toCSV(rows), 'text/csv;charset=utf-8');
  showToast('Report CSV downloaded.', 'success');
}
