// sales.js - Sales entry page.
// Records a sale, decreases the product stock, stores the sale in
// LocalStorage. All other pages read from LocalStorage so they update
// automatically.

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();

  // Default the date field to right now
  const dateInput = document.getElementById('sale-date');
  const now = new Date();
  dateInput.value = now.toISOString().slice(0, 16);

  populateProductSelect();
  renderTodayStats();
  renderRecentSales();
  updateSidebarBadge();
  wireEvents();
});

function wireEvents() {
  // Show product info when a product is picked
  document.getElementById('sale-product').addEventListener('change', function (e) {
    if (e.target.value) {
      showProductInfo(e.target.value);
    } else {
      document.getElementById('product-info-card').style.display = 'none';
      document.getElementById('sale-total').style.display = 'none';
    }
  });

  // Live total
  document.getElementById('sale-quantity').addEventListener('input', updateSaleTotal);
  document.getElementById('sale-product').addEventListener('change', updateSaleTotal);

  // Clear errors while typing
  document.getElementById('sale-quantity').addEventListener('input', function (e) { clearFieldError(e.target); });

  // Save
  document.getElementById('sale-save').addEventListener('click', saveSale);
}

// Fill the product dropdown from LocalStorage
function populateProductSelect() {
  const select = document.getElementById('sale-product');
  const products = getProducts().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

  select.innerHTML = '<option value="">-- Select a product --</option>' +
    products.map(function (p) {
      const stockNote = Number(p.stock) <= 0 ? ' (out of stock)' : ' (' + p.stock + ' in stock)';
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + stockNote + '</option>';
    }).join('');
}

function showProductInfo(productId) {
  const product = getProductById(productId);
  if (!product) return;

  const unitProfit = Number(product.sellingPrice) - Number(product.costPrice);
  document.getElementById('info-price').textContent = formatCurrency(product.sellingPrice);
  document.getElementById('info-stock').textContent = formatNumber(product.stock);
  document.getElementById('info-profit').textContent = formatCurrency(unitProfit);

  const statusEl = document.getElementById('info-status');
  statusEl.textContent = product.status;
  const statusClass = product.status === 'In Stock' ? 'ok' : (product.status === 'Low Stock' ? 'warn' : 'danger');
  statusEl.style.color = statusClass === 'ok' ? '#10b981' : statusClass === 'warn' ? '#f59e0b' : '#ef4444';

  document.getElementById('product-info-card').style.display = 'block';
  updateSaleTotal();
}

// Recompute the sale total and profit preview
function updateSaleTotal() {
  const productId = document.getElementById('sale-product').value;
  const quantity = Number(document.getElementById('sale-quantity').value);
  const totalEl = document.getElementById('sale-total');

  if (!productId || !quantity || quantity <= 0) {
    totalEl.style.display = 'none';
    return;
  }

  const product = getProductById(productId);
  if (!product) return;

  const total = Number(product.sellingPrice) * quantity;
  const profit = (Number(product.sellingPrice) - Number(product.costPrice)) * quantity;
  document.getElementById('sale-total-amount').textContent = formatCurrency(total);
  document.getElementById('sale-total-profit').textContent = 'Profit ' + formatCurrency(profit);
  totalEl.style.display = 'flex';
}

// Validate and record the sale
function saveSale() {
  const productId = document.getElementById('sale-product').value;
  const quantity = document.getElementById('sale-quantity').value;
  const customer = document.getElementById('sale-customer').value.trim() || 'Walk-in Customer';
  const dateValue = document.getElementById('sale-date').value;

  const errors = validateSaleInput({ productId: productId, quantity: quantity });
  if (Object.keys(errors).length) {
    if (errors.productId) showFieldError(document.getElementById('sale-product'), errors.productId);
    if (errors.quantity) showFieldError(document.getElementById('sale-quantity'), errors.quantity);
    showToast('Please choose a product and a valid quantity.', 'error');
    return;
  }

  // Convert the datetime-local value into our "YYYY-MM-DD HH:mm" format
  let dateString = todayNowString();
  if (dateValue) {
    const d = new Date(dateValue);
    dateString = toDateKey(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  const result = addSale({
    productId: productId,
    quantity: quantity,
    customer: customer,
    date: dateString
  });

  if (!result.ok) {
    showToast(result.error, 'error');
    return;
  }

  // Reset the form and refresh everything
  document.getElementById('sale-quantity').value = 1;
  document.getElementById('sale-customer').value = '';
  populateProductSelect();
  document.getElementById('sale-product').value = '';
  document.getElementById('product-info-card').style.display = 'none';
  document.getElementById('sale-total').style.display = 'none';
  clearFormErrors(document.querySelector('.sales-form-panel'));

  renderTodayStats();
  renderRecentSales();
  updateSidebarBadge();
  showToast('Sale saved - stock updated.', 'success');
}

// ------------------------------------------------------------------
// Right panel
// ------------------------------------------------------------------

function renderTodayStats() {
  const sales = getSales();
  const todayKey = toDateKey(new Date());
  const todays = sales.filter(function (s) { return toDateKey(parseDate(s.date)) === todayKey; });

  let revenue = 0;
  let profit = 0;
  for (const sale of todays) {
    revenue += Number(sale.quantity) * Number(sale.sellingPrice);
    profit += Number(sale.profit);
  }

  document.getElementById('today-orders').textContent = formatNumber(todays.length);
  document.getElementById('today-revenue').textContent = formatCurrency(revenue);
  document.getElementById('today-profit').textContent = formatCurrency(profit);
}

function renderRecentSales() {
  const container = document.getElementById('recent-sales-list');
  const recent = getSales().slice().sort(function (a, b) { return parseDate(b.date) - parseDate(a.date); }).slice(0, 10);

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state">No sales yet. Record your first sale!</div>';
    return;
  }

  container.innerHTML = recent.map(function (s) {
    return '<div class="recent-sale-item">' +
      '<div class="rs-name">' + escapeHtml(s.productName) + '</div>' +
      '<div class="rs-meta">' + formatNumber(s.quantity) + ' pcs &middot; ' + escapeHtml(s.customer) + '</div>' +
      '<div class="rs-amount">' + formatCurrency(Number(s.quantity) * Number(s.sellingPrice)) + '</div>' +
      '</div>';
  }).join('');
}
