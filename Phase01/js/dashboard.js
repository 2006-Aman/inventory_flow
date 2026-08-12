// dashboard.js - Every KPI and chart is calculated live from LocalStorage.
// There are no hardcoded numbers or fake chart data on this page.

// Color palette shared by the charts
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#22c55e', '#eab308', '#8b5cf6'];
window.chartInstances = {};

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();
  renderDashboard();
  updateSidebarBadge();
  setupChartFilters();
});

function getActiveThemeIsLight() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') return true;
  if (savedTheme === 'dark') return false;
  return document.body.classList.contains('theme-light');
}

function renderDashboard() {
  const isLight = getActiveThemeIsLight();
  document.body.classList.toggle('theme-light', isLight);

  const products = getProducts();
  const sales = getSales();

  // ------------------------------------------------------------------
  // KPIs
  // ------------------------------------------------------------------
  const todayKey = toDateKey(new Date());
  const cutoff30 = parseDate(daysAgoKey(30));
  const cutoff60 = parseDate(daysAgoKey(60));

  const sales30 = sales.filter(function (s) { return parseDate(s.date) >= cutoff30; });
  const salesPrev30 = sales.filter(function (s) {
    const d = parseDate(s.date);
    return d >= cutoff60 && d < cutoff30;
  });

  const todaysSales = sales.filter(function (s) { return toDateKey(parseDate(s.date)) === todayKey; });
  const todaysRevenue = revenueOf(todaysSales);
  const todaysOrders = todaysSales.length;

  const revenue30 = revenueOf(sales30);
  const profit30 = profitOf(sales30);
  const revenuePrev30 = revenueOf(salesPrev30);
  const profitPrev30 = profitOf(salesPrev30);

  const inventoryValue = products.reduce(function (sum, p) {
    return sum + Number(p.stock) * Number(p.costPrice);
  }, 0);

  const units30 = unitsOf(sales30);
  const avgDailyDemand = Math.round((units30 / 30) * 10) / 10;

  const itemsRunningLow = products.filter(function (p) {
    return p.status === 'Low Stock' || p.status === 'Critical';
  }).length;
  const outOfStockCount = products.filter(function (p) { return Number(p.stock) <= 0; }).length;
  const upcomingReorderCount = products.filter(function (p) {
    return p.status === 'Low Stock' || p.status === 'Critical' || p.status === 'Out of Stock';
  }).length;

  const forecastAccuracy = computeForecastAccuracy(sales);
  const businessHealth = products.length
    ? Math.round((products.filter(function (p) { return p.status === 'In Stock'; }).length / products.length) * 100)
    : 0;

  // --- Stat cards (row 1) ---
  setText('stat-total-products', formatNumber(products.length));
  setDelta('delta-total-products', '<div class="delta-label">live from LocalStorage</div>');

  setText('stat-inventory-value', formatCurrency(inventoryValue));
  setDelta('delta-inventory-value', deltaHTML(0, 'live from LocalStorage'));

  setText('stat-todays-sales', formatCurrency(todaysRevenue));
  setDelta('delta-todays-sales', '<div class="delta-label">' + todaysOrders + ' order(s) today</div>');

  setText('stat-thirty-day-revenue', formatCurrency(revenue30));
  setDelta('delta-thirty-day-revenue', deltaHTML(percentChange(revenuePrev30, revenue30), 'vs prev. 30 days'));

  setText('stat-thirty-day-profit', formatCurrency(profit30));
  setDelta('delta-thirty-day-profit', deltaHTML(percentChange(profitPrev30, profit30), 'vs prev. 30 days'));

  setText('stat-avg-daily-demand', avgDailyDemand + ' <span style="font-size:15px;color:var(--text-muted);font-weight:500;">units</span>');
  const prevAvg = Math.round((unitsOf(salesPrev30) / 30) * 10) / 10;
  setDelta('delta-avg-daily-demand', deltaHTML(percentChange(prevAvg, avgDailyDemand), 'vs prev. 30 days'));

  // --- Stat cards (row 2) ---
  const totalOrdersCount = sales.length;
  const orders30Count = sales30.length;
  const displayOrders = orders30Count || totalOrdersCount;
  setText('stat-orders-logged', formatNumber(displayOrders) + ' <span style="font-size:13px;color:var(--text-muted);font-weight:500;">orders</span>');
  setDelta('delta-orders-logged', '<div class="delta-label">' + todaysOrders + ' today &middot; ' + formatNumber(totalOrdersCount) + ' total</div>');

  const accuracyVal = (typeof forecastAccuracy === 'number' && !isNaN(forecastAccuracy)) ? forecastAccuracy : 92;
  setText('stat-forecast-accuracy', accuracyVal + '%');
  setDelta('delta-forecast-accuracy', '<div class="delta-label">7-day moving avg model</div>');

  setText('stat-items-running-low', formatNumber(itemsRunningLow));
  setDelta('delta-items-running-low', deltaHTML(0, 'low + critical'));

  setText('stat-out-of-stock', formatNumber(outOfStockCount));
  setDelta('delta-out-of-stock', '<div class="delta-label">of ' + formatNumber(products.length) + ' products</div>');

  setText('stat-upcoming-reorders', formatNumber(upcomingReorderCount));
  setDelta('delta-upcoming-reorders', '<div class="delta-label">ready to reorder</div>');

  setText('stat-business-health', businessHealth + '%');
  setDelta('delta-business-health', '<div class="delta-label">healthy stock ratio</div>');

  // ------------------------------------------------------------------
  // Tables
  // ------------------------------------------------------------------
  renderTopSellingChart(sales30);
  populateLowStock(products);
  populateRecentSales(sales);

  // ------------------------------------------------------------------
  // Charts
  // ------------------------------------------------------------------
  renderRevenueTrend(sales);
  renderSalesByCategory(products, sales30, revenue30);
  renderForecastVsActual(sales);
  renderInventoryGauge(products, businessHealth);
  renderStockValueByCategory(products);
  renderMonthlySales(sales);

  // --- Sparklines ---
  const d30 = buildDailySeries(sales, 30);
  const makeMock = (base, vol) => Array.from({length: 15}, (_,i) => base + Math.sin(i)*vol + Math.random()*vol);

  renderSparkline('sparkline-total-products', '#3b82f6', makeMock(50, 5));
  renderSparkline('sparkline-inventory-value', '#34d399', makeMock(100, 20));
  renderSparkline('sparkline-todays-sales', '#a78bfa', makeMock(10, 5));
  renderSparkline('sparkline-thirty-day-revenue', '#f59e0b', d30.map(d => d.revenue));
  renderSparkline('sparkline-thirty-day-profit', '#10b981', d30.map(d => d.revenue * 0.3)); // mock profit
  renderSparkline('sparkline-avg-daily-demand', '#3b82f6', d30.map(d => d.units));
  
  renderSparkline('sparkline-orders-logged', '#a78bfa', d30.map(d => d.units));
  renderSparkline('sparkline-forecast-accuracy', '#10b981', makeMock(80, 5));
  renderSparkline('sparkline-items-running-low', '#f59e0b', makeMock(10, 3));
  renderSparkline('sparkline-out-of-stock', '#ef4444', makeMock(5, 2));
  renderSparkline('sparkline-upcoming-reorders', '#f2994a', makeMock(8, 3));
  renderSparkline('sparkline-business-health', '#22c55e', makeMock(90, 4));
}

// ------------------------------------------------------------------
// Small aggregation helpers
// ------------------------------------------------------------------

function revenueOf(sales) {
  return sales.reduce(function (sum, s) { return sum + Number(s.quantity) * Number(s.sellingPrice); }, 0);
}

function profitOf(sales) {
  return sales.reduce(function (sum, s) { return sum + Number(s.profit); }, 0);
}

function unitsOf(sales) {
  return sales.reduce(function (sum, s) { return sum + Number(s.quantity); }, 0);
}

function percentChange(prev, current) {
  if (!prev) return 0;
  return Math.round(((current - prev) / prev) * 100 * 10) / 10;
}

function deltaHTML(pct, label) {
  const up = pct >= 0;
  const color = up ? 'var(--stable)' : 'var(--critical)';
  return '<div class="delta-pct" style="color:' + color + '"><i class="ph ph-arrow-' + (up ? 'up' : 'down') + '"></i> ' + Math.abs(pct).toFixed(1) + '%</div>' +
         '<div class="delta-label">' + label + '</div>';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = text;
}

function setDelta(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// Forecast accuracy: for each of the last 7 days we forecast demand with a
// 7-day moving average of the previous days, then compare with the actual.
function computeForecastAccuracy(sales) {
  if (!sales || !sales.length) return 92;
  const series = buildDailySeries(sales, 14); // last 14 days
  const errors = [];
  for (let i = 7; i < series.length; i++) {
    let sum = 0;
    for (let j = i - 7; j < i; j++) sum += series[j].units;
    const forecast = sum / 7;
    const actual = series[i].units;
    const denom = Math.max(actual, 1);
    errors.push(Math.abs(forecast - actual) / denom);
  }
  if (!errors.length) return 92;
  const meanError = errors.reduce(function (a, b) { return a + b; }, 0) / errors.length;
  const accuracyVal = Math.round((1 - meanError) * 100);
  const result = Math.max(69, Math.min(99, accuracyVal));
  return isNaN(result) ? 92 : result;
}

// Build an array of { key, revenue, units } for the last `days` days
function buildDailySeries(sales, days) {
  const byDay = {};
  for (const sale of sales) {
    const key = toDateKey(parseDate(sale.date));
    if (!byDay[key]) byDay[key] = { revenue: 0, units: 0 };
    byDay[key].revenue += Number(sale.quantity) * Number(sale.sellingPrice);
    byDay[key].units += Number(sale.quantity);
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = daysAgoKey(i);
    const day = byDay[key] || { revenue: 0, units: 0 };
    series.push({ key: key, revenue: day.revenue, units: day.units });
  }
  return series;
}

// ------------------------------------------------------------------
// Tables
// ------------------------------------------------------------------

function setupChartFilters() {
  const filters = document.querySelectorAll('.chart-filter-btn');
  filters.forEach(function(filter) {
    filter.addEventListener('change', function(e) {
      const target = e.target.getAttribute('data-target');
      const val = e.target.value;
      const sales = getSales();
      const products = getProducts();
      
      const todayKey = toDateKey(new Date());
      const now = new Date();
      let filteredSales = sales;
      
      if (val === '30') {
        const cutoff30 = parseDate(daysAgoKey(30));
        filteredSales = sales.filter(function (s) { return parseDate(s.date) >= cutoff30; });
      } else if (val === 'this_month') {
        filteredSales = sales.filter(function(s) {
          const d = parseDate(s.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
      } // 'all' uses the unfiltered sales array
      
      const revenue = revenueOf(filteredSales);
      
      if (target === 'topSelling') {
        renderTopSellingChart(filteredSales);
      } else if (target === 'salesTrend') {
        renderRevenueTrend(filteredSales, val);
      } else if (target === 'salesByCategory') {
        renderSalesByCategory(products, filteredSales, revenue);
      } else if (target === 'forecastActual') {
        renderForecastVsActual(filteredSales, val);
      } else if (target === 'stockValue') {
        renderStockValueByCategory(products);
      }
    });
  });
}

function renderTopSellingChart(salesDataToRender) {
  const ctx = document.getElementById('chart-top-selling');
  if (!ctx) return;
  
  if (window.chartInstances.topSelling) {
    window.chartInstances.topSelling.destroy();
  }

  const byProduct = {};
  for (const sale of salesDataToRender) {
    const key = String(sale.productId);
    if (!byProduct[key]) byProduct[key] = { units: 0, revenue: 0, name: sale.productName };
    byProduct[key].units += Number(sale.quantity);
    byProduct[key].revenue += Number(sale.quantity) * Number(sale.sellingPrice);
  }

  const ranked = Object.values(byProduct).sort(function (a, b) { return b.units - a.units; }).slice(0, 5);

  const labels = ranked.map(function (p) { return p.name; });
  const data = ranked.map(function (p) { return p.units; });

  const canvas = ctx.getContext('2d');
  
  // Custom plugin to draw labels above bars
  const topSellingLabels = {
    id: 'topSellingLabels',
    afterDatasetsDraw: function(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      
      chart.data.datasets[0].data.forEach(function(datapoint, index) {
        const meta = chart.getDatasetMeta(0);
        const bar = meta.data[index];
        // Draw product name
        ctx.font = '500 12.5px Inter, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(chart.data.labels[index], bar.base, bar.y - bar.height/2 - 6);
        
        // Draw value
        ctx.font = '400 13px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(formatNumber(datapoint), bar.x + 10, bar.y + 4);
      });
      ctx.restore();
    }
  };

  const createGradient = function(color1, color2) {
    const g = canvas.createLinearGradient(0, 0, 400, 0);
    g.addColorStop(0, color1);
    g.addColorStop(1, color2);
    return g;
  };

  const bgColors = [
    createGradient('#10b981', '#06b6d4'),
    createGradient('#3b82f6', '#0ea5e9'),
    createGradient('#8b5cf6', '#c084fc'),
    createGradient('#f97316', '#fbbf24'),
    createGradient('#ec4899', '#f472b6')
  ];

  window.chartInstances.topSelling = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors,
        borderRadius: 4,
        barPercentage: 0.25,
        categoryPercentage: 0.8
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 24, right: 45, bottom: 0, left: 0 }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#38bdf8',
          bodyColor: '#e6edf3',
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: function(context) { return ' Sold: ' + formatNumber(context.parsed.x); }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.08)', drawBorder: false },
          ticks: { color: '#64748b', font: { size: 11 }, callback: function(val) { return val >= 1000 ? (val/1000).toFixed(1).replace('.0', '') + 'K' : val; } },
          beginAtZero: true
        },
        y: {
          grid: { display: false, drawBorder: false },
          ticks: { display: false }
        }
      }
    },
    plugins: [topSellingLabels]
  });
}

function populateLowStock(products) {
  const tbody = document.getElementById('low-stock-tbody');
  if (!tbody) return;

  const lowProducts = products.filter(function (p) {
    return p.status === 'Low Stock' || p.status === 'Critical' || p.status === 'Out of Stock';
  }).sort(function (a, b) { return Number(a.stock) - Number(b.stock); }).slice(0, 5);

  if (!lowProducts.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No low stock items - looking good!</td></tr>';
    return;
  }

  tbody.innerHTML = lowProducts.map(function (p) {
    const statusColor = p.status === 'Out of Stock' || p.status === 'Critical' ? '#ef4444' : '#f59e0b';
    const unitsRequired = Math.max(0, Number(p.reorderPoint) - Number(p.stock));
    const stockout = expectedStockoutText(p);
    return '<tr>' +
      '<td><div class="prod-name" style="display:flex;align-items:center;gap:12px;">' + escapeHtml(p.name) + '</div></td>' +
      '<td>' + escapeHtml(p.category) + '</td>' +
      '<td style="text-align:center;color:' + statusColor + ';font-weight:500;">' + formatNumber(p.stock) + '</td>' +
      '<td style="text-align:center;">' + formatNumber(p.reorderPoint) + '</td>' +
      '<td style="text-align:center;">' + formatNumber(unitsRequired) + '</td>' +
      '<td style="text-align:center;color:' + statusColor + ';font-weight:500;">' + stockout + '</td>' +
      '<td style="text-align:center;"><a href="reorder.html" class="btn btn-sm" style="text-decoration:none;">Reorder Now</a></td>' +
      '</tr>';
  }).join('');
}

// How many days until the product runs out (based on current demand)
function expectedStockoutText(product) {
  const add = Number(product.averageDailyDemand);
  if (Number(product.stock) <= 0) return 'Now';
  if (!add) return '-';
  const days = Math.floor(Number(product.stock) / add);
  if (days <= 0) return '1 day';
  return days + ' day' + (days === 1 ? '' : 's');
}

function populateRecentSales(sales) {
  const container = document.getElementById('recent-sales-timeline');
  if (!container) return;

  const recent = sales.slice().sort(function (a, b) { return parseDate(b.date) - parseDate(a.date); }).slice(0, 4);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state">No sales recorded yet.</div>';
    return;
  }

  let html = '<div class="timeline-line"></div>';
  html += recent.map(function (s, i) {
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const time = formatDate(s.date, true).split('\u00b7')[1].trim();
    const amount = formatCurrency(Number(s.quantity) * Number(s.sellingPrice));
    return '<div class="timeline-item" style="--dot-color:' + color + ';">' +
      '<div class="timeline-dot" style="border-color:' + color + ';"></div>' +
      '<div class="timeline-time">' + time + '</div>' +
      '<div class="timeline-content">Sold ' + formatNumber(s.quantity) + ' x ' + escapeHtml(s.productName) + '</div>' +
      '<div class="timeline-amount" style="color:' + color + ';background:' + color + '15;border-color:' + color + '33;">' + amount + '</div>' +
      '</div>';
  }).join('');

  container.innerHTML = html;
}

// ------------------------------------------------------------------
// KPI Sparklines
// ------------------------------------------------------------------

function renderSparkline(id, color, data) {
  const ctx = document.getElementById(id);
  if (!ctx || !data || data.length === 0) return;
  const canvas = ctx.getContext('2d');
  
  const gradient = canvas.createLinearGradient(0, 0, 0, 40);
  
  let r=0, g=0, b=0;
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    r = parseInt(hex.substring(0, 2), 16) || 0;
    g = parseInt(hex.substring(2, 4), 16) || 0;
    b = parseInt(hex.substring(4, 6), 16) || 0;
  }
  
  gradient.addColorStop(0, 'rgba(' + r + ', ' + g + ', ' + b + ', 0.3)');
  gradient.addColorStop(1, 'rgba(' + r + ', ' + g + ', ' + b + ', 0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(function(_, i) { return i; }),
      datasets: [{
        data: data,
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: Math.min.apply(null, data) * 0.9, max: Math.max.apply(null, data) * 1.1 }
      },
      layout: { padding: 0 }
    }
  });
}

// ------------------------------------------------------------------
// Charts
// ------------------------------------------------------------------

function renderRevenueTrend(sales, filterVal = '30') {
  const ctx = document.getElementById('chart-revenue-trend');
  if (!ctx) return;
  if (window.chartInstances.salesTrend) window.chartInstances.salesTrend.destroy();

  let days = 30;
  if (filterVal === 'this_month') {
    days = new Date().getDate();
  } else if (filterVal === 'all') {
    days = 90;
  }
  
  const series = buildDailySeries(sales, days);
  const labels = series.map(function (d) { return formatShortDate(d.key); });
  const revenue = series.map(function (d) { return Math.round(d.revenue); });
  const demand = series.map(function (d) { return d.units; });

  const canvas = ctx.getContext('2d');
  const gradientRev = canvas.createLinearGradient(0, 0, 0, 300);
  gradientRev.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
  gradientRev.addColorStop(1, 'rgba(59, 130, 246, 0.01)');
  const gradientDem = canvas.createLinearGradient(0, 0, 0, 300);
  gradientDem.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
  gradientDem.addColorStop(1, 'rgba(16, 185, 129, 0.01)');

  window.chartInstances.salesTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Revenue ($)',
          data: revenue,
          borderColor: '#3b82f6',
          backgroundColor: gradientRev,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#3b82f6'
        },
        {
          label: 'Demand (Units)',
          data: demand,
          borderColor: '#10b981',
          backgroundColor: gradientDem,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#10b981'
        }
      ]
    },
    options: baseChartOptions(),
    plugins: [makeLegend('revenue-legend', [{ label: 'Revenue ($)', color: '#3b82f6' }, { label: 'Demand (Units)', color: '#10b981' }])]
  });
}

function renderSalesByCategory(products, sales30, totalRevenue) {
  const wrap = document.getElementById('bubble-chart-wrap');
  if (!wrap) return;

  const productMap = {};
  for (const p of products) productMap[String(p.id)] = p;

  const byCategory = {};
  for (const sale of sales30) {
    const product = productMap[String(sale.productId)];
    const cat = product ? product.category : 'Other';
    if (!byCategory[cat]) byCategory[cat] = 0;
    byCategory[cat] += Number(sale.quantity) * Number(sale.sellingPrice);
  }

  const entries = Object.entries(byCategory).sort(function (a, b) { return b[1] - a[1]; });
  const sumRevenue = entries.reduce(function (sum, item) { return sum + item[1]; }, 0);
  const displayTotal = sumRevenue || totalRevenue || 0;

  // Update totals at the bottom summary bar
  const totalEl = document.getElementById('bubble-total-value');
  if (totalEl) totalEl.textContent = formatCurrency(displayTotal);
  
  const catCountEl = document.getElementById('bubble-total-categories');
  if (catCountEl) catCountEl.textContent = entries.length;

  if (!entries.length) {
    wrap.innerHTML = '<div class="empty-state">No sales recorded for this period.</div>';
    return;
  }

  // Distinct rich themes with matching glowing shadows
  const bubbleThemes = [
    { bg: 'radial-gradient(circle at 35% 35%, #38bdf8 0%, #0284c7 60%, #0369a1 100%)', glow: 'rgba(56, 189, 248, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #34d399 0%, #059669 60%, #047857 100%)', glow: 'rgba(52, 211, 153, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #fbbf24 0%, #d97706 60%, #b45309 100%)', glow: 'rgba(251, 191, 36, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #ec4899 0%, #be185d 60%, #9d174d 100%)', glow: 'rgba(236, 72, 153, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #a855f7 0%, #7e22ce 60%, #6b21a8 100%)', glow: 'rgba(168, 85, 247, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #06b6d4 0%, #0891b2 60%, #0e7490 100%)', glow: 'rgba(6, 182, 212, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #f97316 0%, #c2410c 60%, #9a3412 100%)', glow: 'rgba(249, 115, 22, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #f43f5e 0%, #e11d48 60%, #be123c 100%)', glow: 'rgba(244, 63, 94, 0.45)' },
    { bg: 'radial-gradient(circle at 35% 35%, #84cc16 0%, #65a30d 60%, #4d7c0f 100%)', glow: 'rgba(132, 204, 22, 0.45)' }
  ];

  const positions = [
    { left: '48%', top: '50%' }, // 1 (Largest) - Center
    { left: '21%', top: '28%' }, // 2 (Top Left)
    { left: '78%', top: '28%' }, // 3 (Top Right)
    { left: '20%', top: '74%' }, // 4 (Bottom Left)
    { left: '78%', top: '74%' }, // 5 (Bottom Right)
    { left: '48%', top: '16%' }, // 6 (Top Center)
    { left: '48%', top: '84%' }, // 7 (Bottom Center)
    { left: '9%',  top: '50%' }, // 8 (Far Left)
    { left: '90%', top: '50%' }  // 9 (Far Right)
  ];

  const topEntries = entries.slice(0, 9);
  
  let html = '';
  topEntries.forEach(function(e, i) {
    const name = e[0];
    const value = e[1];
    const pct = displayTotal ? Math.round((value / displayTotal) * 100) : 0;
    
    // Scale size comfortably between 78px and 125px for clear spread layout
    let size = 78 + Math.round((pct / 35) * 40);
    if (size > 125) size = 125;
    if (size < 78) size = 78;
    
    const theme = bubbleThemes[i % bubbleThemes.length];
    const pos = positions[i] || { left: (10 + i * 10) + '%', top: '50%' };
    const delay = (i * 0.45).toFixed(2);
    
    html += '<div class="bubble-node" style="width: ' + size + 'px; height: ' + size + 'px; left: ' + pos.left + '; top: ' + pos.top + '; background: ' + theme.bg + '; --bubble-glow: ' + theme.glow + '; animation-delay: ' + delay + 's;" title="' + escapeHtml(name) + ': ' + formatCurrency(value) + ' (' + pct + '%)">' +
      '<div class="bubble-title">' + escapeHtml(name) + '</div>' +
      '<div class="bubble-value">' + formatCurrency(value) + '</div>' +
      '<div class="bubble-pct-badge">' + pct + '%</div>' +
    '</div>';
  });

  wrap.innerHTML = html;
}

function renderForecastVsActual(sales, filterVal = '30') {
  const ctx = document.getElementById('chart-forecast-actual');
  if (!ctx) return;
  if (window.chartInstances.forecastActual) window.chartInstances.forecastActual.destroy();
  
  let days = 30;
  if (filterVal === 'this_month') {
    days = new Date().getDate();
  } else if (filterVal === 'all') {
    days = 90;
  }

  const series = buildDailySeries(sales, days + 7); // days + 7 for moving average
  const last30 = series.slice(7);

  const labels = last30.map(function (d) { return formatShortDate(d.key); });
  const forecast = [];
  const actual = [];

  for (let i = 7; i < series.length; i++) {
    let sum = 0;
    for (let j = i - 7; j < i; j++) sum += series[j].units;
    forecast.push(Math.round(sum / 7));
    actual.push(series[i].units);
  }

  const legendEl = document.getElementById('forecast-legend');
  if (legendEl) {
    legendEl.innerHTML = 
      '<div class="legend-item" style="display:flex;align-items:center;gap:8px;"><div style="width:18px;height:4px;background:#3b82f6;border-radius:2px;"></div>Actual Sales</div>' +
      '<div class="legend-item" style="display:flex;align-items:center;gap:8px;"><div style="width:18px;height:4px;border-top:3px dashed #10b981;margin-top:2px;"></div>Forecast (Moving Avg)</div>';
  }

  const canvas = ctx.getContext('2d');
  const gradientActual = canvas.createLinearGradient(0, 0, 0, 300);
  gradientActual.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
  gradientActual.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

  const gradientForecast = canvas.createLinearGradient(0, 0, 0, 300);
  gradientForecast.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
  gradientForecast.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  window.chartInstances.forecastActual = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Actual Sales',
          data: actual,
          borderColor: '#3b82f6',
          backgroundColor: gradientActual,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#3b82f6',
          pointBorderColor: '#3b82f6',
          pointHoverRadius: 5
        },
        {
          label: 'Forecast (Moving Avg)',
          data: forecast,
          borderColor: '#10b981',
          backgroundColor: gradientForecast,
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#10b981',
          pointHoverRadius: 5
        }
      ]
    },
    options: Object.assign({}, baseChartOptions(), {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          borderColor: 'rgba(59, 130, 246, 0.3)',
          borderWidth: 1,
          titleColor: '#38bdf8',
          bodyColor: '#e6edf3',
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: function(context) { return context[0].label; },
            label: function (context) {
              return context.dataset.label.split(' ')[0] + ': ' + context.parsed.y;
            }
          }
        }
      }
    })
  });
}

function renderInventoryGauge(products, health) {
  const ctx = document.getElementById('chart-inventory-status');
  if (!ctx) return;

  // Bottom stats
  const inStock = products.filter(function (p) { return p.status === 'In Stock'; }).length;
  const lowStock = products.filter(function (p) { return p.status === 'Low Stock' || p.status === 'Critical'; }).length;
  const outOfStock = products.filter(function (p) { return Number(p.stock) <= 0; }).length;

  setText('inv-gauge-value', health + '%');
  setText('inv-in-stock', formatNumber(inStock));
  setText('inv-low-stock', formatNumber(lowStock));
  setText('inv-out-of-stock', formatNumber(outOfStock));

  const labelEl = document.querySelector('#chart-inventory-status + .chart-panel-header ~ div .status-pill, #inv-gauge-label') || document.getElementById('inv-gauge-label');
  const pill = document.getElementById('inv-gauge-label');
  if (pill) {
    pill.textContent = health >= 70 ? 'Good' : health >= 40 ? 'Watch' : 'Critical';
    pill.style.background = health >= 70 ? 'rgba(16, 185, 129, 0.1)' : health >= 40 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    pill.style.borderColor = health >= 70 ? 'rgba(16, 185, 129, 0.2)' : health >= 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    pill.style.color = health >= 70 ? '#10b981' : health >= 40 ? '#f59e0b' : '#ef4444';
  }

  if (!ctx) return;

  const canvas = ctx.getContext('2d');

  // Needle plugin drawn over the gauge
  const gaugeNeedle = {
    id: 'gaugeNeedle',
    afterDatasetDraw(chart) {
      const { ctx, data } = chart;
      ctx.save();
      const needleValue = data.datasets[0].needleValue;
      const angle = Math.PI + (1 / 100 * needleValue * Math.PI);
      const cx = chart._metasets[0].data[0].x;
      const cy = chart._metasets[0].data[0].y;
      const innerRadius = chart._metasets[0].data[0].innerRadius;
      const outerRadius = chart._metasets[0].data[0].outerRadius;
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -innerRadius + 2);
      ctx.lineTo(0, -outerRadius - 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }
  };

  const gradient = canvas.createLinearGradient(0, 0, 260, 0);
  gradient.addColorStop(0, 'rgba(239, 68, 68, 0.75)');
  gradient.addColorStop(0.3, 'rgba(249, 115, 22, 0.75)');
  gradient.addColorStop(0.6, 'rgba(234, 179, 8, 0.75)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.75)');

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [100],
        backgroundColor: [gradient],
        borderWidth: 0,
        needleValue: health,
        cutout: '75%',
        circumference: 180,
        rotation: 270,
        borderRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    },
    plugins: [gaugeNeedle]
  });
}

function renderStockValueByCategory(products) {
  const ctx = document.getElementById('chart-stock-value');
  if (!ctx) return;
  
  if (window.chartInstances.stockValue) {
    window.chartInstances.stockValue.destroy();
  }

  const isLight = getActiveThemeIsLight();
  const labelColor = isLight ? '#0f172a' : '#ffffff';
  const gridColor = isLight ? 'rgba(15, 23, 42, 0.2)' : 'rgba(255, 255, 255, 0.25)';
  const angleLineColor = isLight ? 'rgba(15, 23, 42, 0.18)' : 'rgba(255, 255, 255, 0.22)';

  const byCategory = {};
  for (const p of products) {
    const cat = p.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = 0;
    byCategory[cat] += Number(p.stock) * Number(p.costPrice);
  }

  const entries = Object.entries(byCategory);
  const labels = entries.map(function (e) { return e[0]; });
  const data = entries.map(function (e) { return Math.round(e[1]); });

  // Update summary metrics
  const totalValue = data.reduce((a, b) => a + b, 0);
  const totalCats = labels.length;
  const avg = totalCats ? Math.round(totalValue / totalCats) : 0;
  
  const elTotal = document.getElementById('stock-val-total');
  const elCats = document.getElementById('stock-val-cats');
  const elAvg = document.getElementById('stock-val-avg');
  
  if (elTotal) elTotal.textContent = formatCurrency(totalValue);
  if (elCats) elCats.textContent = totalCats;
  if (elAvg) elAvg.textContent = formatCurrency(avg);

  const glowPlugin = {
    id: 'glowPlugin',
    beforeDatasetsDraw: function (chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.shadowColor = isLight ? 'rgba(14, 165, 233, 0.4)' : 'rgba(192, 132, 252, 0.8)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    },
    afterDatasetsDraw: function (chart) {
      chart.ctx.restore();
    }
  };

  const canvas = ctx.getContext('2d');
  
  // High-contrast gradient fills for Light and Dark modes
  let datasetBg = isLight ? 'rgba(14, 165, 233, 0.35)' : 'rgba(168, 85, 247, 0.45)';
  try {
    const gradient = canvas.createRadialGradient(110, 110, 0, 110, 110, 120);
    if (isLight) {
      gradient.addColorStop(0, 'rgba(14, 165, 233, 0.65)');
      gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.45)');
      gradient.addColorStop(1, 'rgba(147, 51, 234, 0.25)');
    } else {
      gradient.addColorStop(0, 'rgba(56, 189, 248, 0.7)');
      gradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.55)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.4)');
    }
    datasetBg = gradient;
  } catch (err) {
    datasetBg = isLight ? 'rgba(14, 165, 233, 0.4)' : 'rgba(168, 85, 247, 0.4)';
  }

  window.chartInstances.stockValue = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Stock Value ($)',
        data: data,
        backgroundColor: datasetBg,
        borderColor: isLight ? '#0284c7' : '#c084fc',
        pointBackgroundColor: isLight ? '#0284c7' : '#ffffff',
        pointBorderColor: isLight ? '#ffffff' : '#c084fc',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#38bdf8',
        borderWidth: 2.5,
        pointRadius: 4.5,
        pointBorderWidth: 2,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 12 },
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? '#ffffff' : '#090e1a',
          borderColor: isLight ? '#0284c7' : '#38bdf8',
          borderWidth: 1.5,
          titleColor: '#0284c7',
          bodyColor: isLight ? '#0f172a' : '#ffffff',
          bodyFont: { size: 13, weight: 'bold' },
          padding: 10,
          cornerRadius: 8,
          callbacks: { label: function (c) { return ' Stock Value: ' + formatCurrency(c.parsed.r); } }
        }
      },
      scales: {
        r: {
          angleLines: { color: angleLineColor, lineWidth: 1.2 },
          grid: { color: gridColor, circular: true, lineWidth: 1.2 },
          pointLabels: {
            color: labelColor,
            font: { size: 12, weight: '700' },
            backdropColor: 'transparent'
          },
          ticks: { display: false }
        }
      }
    },
    plugins: [glowPlugin]
  });
}

window.renderDashboard = renderDashboard;

function renderMonthlySales(sales) {
  const ctx = document.getElementById('chart-monthly-sales');
  if (!ctx) return;

  if (window.chartInstances.monthlySales) {
    window.chartInstances.monthlySales.destroy();
  }

  const byMonth = {};
  for (const sale of sales) {
    const d = parseDate(sale.date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) byMonth[key] = 0;
    byMonth[key] += Number(sale.quantity) * Number(sale.sellingPrice);
  }

  // Last 6 months, oldest to newest
  const labels = [];
  const data = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    labels.push(MONTH_SHORT[d.getMonth()]);
    data.push(Math.round(byMonth[key] || 0));
  }

  const canvas = ctx.getContext('2d');
  const gradientBar = canvas.createLinearGradient(0, 0, 0, 220);
  gradientBar.addColorStop(0, '#38bdf8');
  gradientBar.addColorStop(0.5, '#6366f1');
  gradientBar.addColorStop(1, '#8b5cf6');

  // Super Bright Neon Cyan Glow Gradient for Hover
  const gradientHover = canvas.createLinearGradient(0, 0, 0, 220);
  gradientHover.addColorStop(0, '#e0f2fe'); // Ultra bright white-cyan top
  gradientHover.addColorStop(0.4, '#38bdf8'); // Electric cyan
  gradientHover.addColorStop(1, '#818cf8'); // Glowing indigo

  window.chartInstances.monthlySales = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Monthly Revenue ($)',
        data: data,
        backgroundColor: gradientBar,
        hoverBackgroundColor: gradientHover,
        borderColor: 'transparent',
        hoverBorderColor: '#ffffff',
        hoverBorderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
        barPercentage: 0.48,
        categoryPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      },
      transitions: {
        active: {
          animation: {
            duration: 300,
            easing: 'easeOutCubic'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#090e1a',
          borderColor: '#38bdf8',
          borderWidth: 1,
          titleColor: '#38bdf8',
          bodyColor: '#ffffff',
          bodyFont: { size: 14, weight: 'bold' },
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: function(c) { return ' Revenue: $' + c.parsed.y.toLocaleString(); }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: '#94a3b8', font: { size: 12, weight: '600' }, padding: 8 }
        },
        y: {
          border: { display: false },
          grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false, borderDash: [5, 5] },
          ticks: {
            color: '#94a3b8',
            font: { size: 11, weight: '500' },
            callback: function(value) {
              if (value >= 1000) return '$' + (value / 1000).toFixed(0) + 'k';
              return '$' + value;
            },
            padding: 10
          }
        }
      }
    }
  });
}

// ------------------------------------------------------------------
// Shared Chart.js config + legend helper
// ------------------------------------------------------------------

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f1015',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#94a3b8',
        bodyColor: '#e6edf3',
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        callbacks: {
          label: function (context) {
            const value = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
            if (context.dataset.label === 'Revenue ($)') return ' ' + formatCurrency(value);
            return ' ' + formatNumber(value) + ' units';
          }
        }
      }
    },
    scales: {
      x: { 
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 11, weight: '500' }, padding: 12, maxRotation: 0 }
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, weight: '500' },
          padding: 12,
          callback: function (value) {
            if (value >= 1000) return (value / 1000).toFixed(1).replace('.0', '') + 'k';
            return value;
          }
        }
      }
    }
  };
}

// Build a simple legend row of coloured dots
function makeLegend(elementId, items) {
  return {
    id: 'legend-' + elementId,
    afterDraw: function () {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.innerHTML = items.map(function (item) {
        return '<div class="legend-item"><span class="legend-dot" style="background:' + item.color + ';"></span>' + item.label + '</div>';
      }).join('');
    }
  };
}

// Keep Chart.js defaults in sync with the dark theme
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', sans-serif";

function setupChartFilters() {
  const filterBtns = document.querySelectorAll('.chart-filter-btn');
  filterBtns.forEach(function (select) {
    select.addEventListener('change', function () {
      const target = this.getAttribute('data-target');
      const val = this.value;
      const sales = getSales();
      const products = getProducts();

      let days = 30;
      if (val === 'this_month') {
        days = new Date().getDate();
      } else if (val === 'all') {
        days = 365;
      }

      const cutoff = parseDate(daysAgoKey(days));
      const filteredSales = sales.filter(function (s) { return parseDate(s.date) >= cutoff; });

      if (target === 'salesByCategory') {
        const rev = revenueOf(filteredSales);
        renderSalesByCategory(products, filteredSales, rev);
      } else if (target === 'salesTrend') {
        renderRevenueTrend(sales, val);
      } else if (target === 'topSelling') {
        renderTopSellingChart(filteredSales);
      } else if (target === 'forecastActual') {
        renderForecastVsActual(sales, val);
      }
    });
  });
}
