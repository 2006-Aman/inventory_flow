// reorder.js - Reorder management page.
// Ranks every product against its reorder point and lets you restock
// from the page. All numbers come from LocalStorage.

let restockProductId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();

  renderKpis();
  renderReorderTable();
  updateSidebarBadge();
  wireEvents();
});

function wireEvents() {
  document.getElementById('reorder-export-btn').addEventListener('click', exportReorderCSV);

  document.getElementById('restock-save').addEventListener('click', restockSave);
  document.getElementById('restock-quantity').addEventListener('input', function (e) { clearFieldError(e.target); });

  // Modal close via backdrop or data-close buttons
  document.querySelectorAll('[data-close="restock-modal"]').forEach(function (el) {
    el.addEventListener('click', closeRestockModal);
  });
  document.getElementById('restock-modal').addEventListener('click', function (e) {
    if (e.target === this) closeRestockModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeRestockModal();
  });
}

function renderKpis() {
  const products = getProducts();
  let safe = 0, low = 0, critical = 0, out = 0;
  for (const p of products) {
    if (p.status === 'In Stock') safe++;
    else if (p.status === 'Low Stock') low++;
    else if (p.status === 'Out of Stock') out++;
    else critical++;
  }
  document.getElementById('kpi-safe').textContent = formatNumber(safe);
  document.getElementById('kpi-low').textContent = formatNumber(low);
  document.getElementById('kpi-critical').textContent = formatNumber(critical);
  document.getElementById('kpi-out').textContent = formatNumber(out);
}

function renderReorderTable() {
  const tbody = document.getElementById('reorder-tbody');
  const products = getProducts()
    .slice()
    .sort(function (a, b) {
      const order = { 'Out of Stock': 0, 'Critical': 1, 'Low Stock': 2, 'In Stock': 3 };
      return order[a.status] - order[b.status] || Number(a.stock) - Number(b.stock);
    });

  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No products yet.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(function (p) {
    const stock = Number(p.stock);
    const rop = Number(p.reorderPoint);
    const avg = Number(p.averageDailyDemand || 0);
    const lead = Number(p.leadTime || 0);
    const safety = Number(p.safetyStock || 0);
    const status = p.status;
    const statusClass = status === 'In Stock' ? 'ok' : status === 'Low Stock' ? 'warn' : 'danger';

    let actionBtn = '';
    if (status === 'Out of Stock' || status === 'Critical' || status === 'Low Stock') {
      actionBtn = '<button class="btn btn-sm" data-restock="' + escapeHtml(p.id) + '"><i class="ph ph-plus"></i> Restock</button>';
    } else {
      actionBtn = '<button class="btn btn-sm btn-ghost" data-restock="' + escapeHtml(p.id) + '"><i class="ph ph-plus"></i> Restock</button>';
    }

    const stockColor = stock <= 0 ? '#ef4444' : stock <= rop ? '#f59e0b' : '#10b981';
    const ropBadge = stock <= rop
      ? '<div class="reorder-item">needs reorder</div>'
      : '<div class="restock-qty">margin of ' + formatNumber(Math.max(0, stock - rop)) + '</div>';

    return '<tr>' +
      '<td><div class="prod-name">' + escapeHtml(p.name) + '</div><div class="prod-sku">' + escapeHtml(p.sku) + '</div></td>' +
      '<td class="num" style="color:' + stockColor + ';font-weight:600;">' + formatNumber(stock) + '</td>' +
      '<td class="num">' + formatNumber(rop) + '</td>' +
      '<td class="num">' + avg.toFixed(1) + '</td>' +
      '<td class="num">' + formatNumber(lead) + ' days</td>' +
      '<td class="num">' + formatNumber(safety) + '</td>' +
      '<td class="num" style="font-weight:600;color:#38bdf8;">' + formatNumber(recommendedOrderQuantity(p)) + '</td>' +
      '<td><span class="status-pill ' + statusClass + '">' + status + '</span>' + ropBadge + '</td>' +
      '<td class="actions-col">' + actionBtn + '</td>' +
      '</tr>';
  }).join('');

  // Bind restock buttons
  tbody.querySelectorAll('[data-restock]').forEach(function (btn) {
    btn.addEventListener('click', function () { openRestockModal(btn.dataset.restock); });
  });
}

// ------------------------------------------------------------------
// Restock modal
// ------------------------------------------------------------------

function openRestockModal(productId) {
  const product = getProductById(productId);
  if (!product) return;

  restockProductId = productId;
  const rec = recommendedOrderQuantity(product);
  document.getElementById('restock-product-info').textContent =
    product.name + ' - currently ' + formatNumber(product.stock) + ' in stock, recommended order ' + formatNumber(rec) + '.';
  document.getElementById('restock-quantity').value = rec || '';
  clearFormErrors(document.getElementById('restock-modal'));
  document.getElementById('restock-modal').classList.add('show');
}

function closeRestockModal() {
  document.getElementById('restock-modal').classList.remove('show');
  restockProductId = null;
}

function restockSave() {
  if (!restockProductId) return;
  const quantity = document.getElementById('restock-quantity').value;
  const qty = Number(quantity);

  if (!qty || qty <= 0) {
    showFieldError(document.getElementById('restock-quantity'), 'Enter a quantity of at least 1.');
    return;
  }

  adjustStock(restockProductId, qty);
  closeRestockModal();
  renderKpis();
  renderReorderTable();
  updateSidebarBadge();
  showToast('Stock updated.', 'success');
}

function exportReorderCSV() {
  const products = getProducts();
  if (!products.length) {
    showToast('Nothing to export.', 'error');
    return;
  }
  const rows = products.map(function (p) {
    return {
      SKU: p.sku,
      Product: p.name,
      CurrentStock: p.stock,
      ReorderPoint: p.reorderPoint,
      AvgDailyDemand: Number(p.averageDailyDemand || 0),
      LeadTimeDays: p.leadTime,
      SafetyStock: p.safetyStock,
      RecommendedOrder: recommendedOrderQuantity(p),
      Status: p.status
    };
  });
  downloadFile('reorder-list.csv', toCSV(rows), 'text/csv;charset=utf-8');
  showToast('Reorder CSV downloaded.', 'success');
}
