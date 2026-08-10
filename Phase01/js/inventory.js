// inventory.js - Inventory page: search, filter, sort, pagination,
// edit, update stock and delete. Everything reads/writes LocalStorage.

const PAGE_SIZE = 10;

// Current view state
const state = {
  search: '',
  category: '',
  supplier: '',
  status: '',
  sortKey: 'name',
  sortDir: 'asc',
  page: 1
};

// Which product is being edited / restocked
let editingId = null;
let stockingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();

  // Support the topbar search: inventory.html?q=...
  const params = new URLSearchParams(window.location.search);
  if (params.get('q')) {
    state.search = params.get('q').toLowerCase();
    document.getElementById('inv-search').value = params.get('q');
  }

  populateFilterOptions();
  wireEvents();
  renderTable();
  updateSidebarBadge();
});

// ------------------------------------------------------------------
// Events
// ------------------------------------------------------------------

function wireEvents() {
  // Search
  document.getElementById('inv-search').addEventListener('input', function (e) {
    state.search = e.target.value.toLowerCase();
    state.page = 1;
    renderTable();
  });

  // Filters
  document.getElementById('filter-category').addEventListener('change', function (e) {
    state.category = e.target.value;
    state.page = 1;
    renderTable();
  });
  document.getElementById('filter-supplier').addEventListener('change', function (e) {
    state.supplier = e.target.value;
    state.page = 1;
    renderTable();
  });
  document.getElementById('filter-status').addEventListener('change', function (e) {
    state.status = e.target.value;
    state.page = 1;
    renderTable();
  });

  // Sortable column headers
  document.querySelectorAll('th.sortable').forEach(function (th) {
    th.addEventListener('click', function () {
      const key = th.dataset.sort;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      state.page = 1;
      renderTable();
    });
  });

  // Export CSV
  document.getElementById('export-btn').addEventListener('click', exportProductsCSV);

  // Modals
  document.querySelectorAll('.modal-close, [data-close]').forEach(function (btn) {
    btn.addEventListener('click', function () { closeModals(); });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModals();
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModals();
  });

  // Edit modal save
  document.getElementById('edit-save').addEventListener('click', saveEditModal);

  // Stock modal save
  document.getElementById('stock-save').addEventListener('click', saveStockModal);
}

// ------------------------------------------------------------------
// Data helpers
// ------------------------------------------------------------------

function getFilteredProducts() {
  let products = getProducts();

  if (state.search) {
    products = products.filter(function (p) {
      return (p.name || '').toLowerCase().indexOf(state.search) !== -1 ||
        (p.sku || '').toLowerCase().indexOf(state.search) !== -1 ||
        (p.barcode || '').toLowerCase().indexOf(state.search) !== -1 ||
        (p.category || '').toLowerCase().indexOf(state.search) !== -1;
    });
  }
  if (state.category) {
    products = products.filter(function (p) { return p.category === state.category; });
  }
  if (state.supplier) {
    products = products.filter(function (p) { return p.supplier === state.supplier; });
  }
  if (state.status) {
    products = products.filter(function (p) { return p.status === state.status; });
  }

  // Sort
  const key = state.sortKey;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  products.sort(function (a, b) {
    let av = a[key];
    let bv = b[key];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
    av = Number(av);
    bv = Number(bv);
    if (isNaN(av) || isNaN(bv)) {
      av = String(a[key] || '');
      bv = String(b[key] || '');
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    }
    return (av - bv) * dir;
  });

  return products;
}

function populateFilterOptions() {
  const products = getProducts();
  const categories = getCategories();
  const catSelect = document.getElementById('filter-category');
  const supSelect = document.getElementById('filter-supplier');
  const statusSelect = document.getElementById('filter-status');

  // Categories from the categories collection (kept in a sensible order)
  const catNames = categories.map(function (c) { return c.name; });
  products.forEach(function (p) {
    if (catNames.indexOf(p.category) === -1 && p.category) catNames.push(p.category);
  });
  catSelect.innerHTML = '<option value="">All Categories</option>' +
    catNames.map(function (c) { return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; }).join('');

  // Suppliers
  const suppliers = [];
  products.forEach(function (p) {
    if (p.supplier && suppliers.indexOf(p.supplier) === -1) suppliers.push(p.supplier);
  });
  suppliers.sort();
  supSelect.innerHTML = '<option value="">All Suppliers</option>' +
    suppliers.map(function (s) { return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>'; }).join('');

  // Statuses
  const statuses = ['In Stock', 'Low Stock', 'Critical', 'Out of Stock'];
  statusSelect.innerHTML = '<option value="">All Status</option>' +
    statuses.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');

  // Datalist for the edit modal
  document.getElementById('category-list').innerHTML =
    catNames.map(function (c) { return '<option value="' + escapeHtml(c) + '"></option>'; }).join('');
}

// ------------------------------------------------------------------
// Rendering
// ------------------------------------------------------------------

function renderTable() {
  const products = getFilteredProducts();
  const tbody = document.getElementById('inv-tbody');

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * PAGE_SIZE;
  const pageProducts = products.slice(start, start + PAGE_SIZE);

  if (!pageProducts.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No products match your filters.</td></tr>';
  } else {
    tbody.innerHTML = pageProducts.map(function (p) {
      const statusClass = p.status === 'In Stock' ? 'ok' : (p.status === 'Low Stock' ? 'warn' : 'danger');
      const stockClass = Number(p.stock) <= Number(p.reorderPoint) ? 'stock-cell' : '';
      return '<tr>' +
        '<td><div class="prod-name">' + escapeHtml(p.name) + '</div><div class="prod-sku">' + escapeHtml(p.sku) + ' &middot; ' + escapeHtml(p.barcode) + '</div></td>' +
        '<td>' + escapeHtml(p.category) + '</td>' +
        '<td>' + escapeHtml(p.supplier) + '</td>' +
        '<td class="num">' + formatCurrency(p.costPrice) + '</td>' +
        '<td class="num">' + formatCurrency(p.sellingPrice) + '</td>' +
        '<td class="num ' + stockClass + '">' + formatNumber(p.stock) + '</td>' +
        '<td class="num">' + formatNumber(p.reorderPoint) + '</td>' +
        '<td><span class="status-pill ' + statusClass + '">' + escapeHtml(p.status) + '</span></td>' +
        '<td><div class="row-actions">' +
        '<button class="icon-action edit" title="Edit" data-action="edit" data-id="' + escapeHtml(p.id) + '"><i class="ph ph-pencil-simple"></i></button>' +
        '<button class="icon-action stock" title="Update stock" data-action="stock" data-id="' + escapeHtml(p.id) + '"><i class="ph ph-package"></i></button>' +
        '<button class="icon-action delete" title="Delete" data-action="delete" data-id="' + escapeHtml(p.id) + '"><i class="ph ph-trash"></i></button>' +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  renderPagination(products.length, totalPages);
  attachRowActionHandlers();
}

function renderPagination(totalItems, totalPages) {
  const pagination = document.getElementById('inv-pagination');
  let html = '<span class="page-info">' + totalItems + ' product(s)</span>';

  html += '<button ' + (state.page === 1 ? 'disabled' : '') + ' data-page="prev">\u2039</button>';

  const startPage = Math.max(1, state.page - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  for (let i = startPage; i <= endPage; i++) {
    html += '<button class="' + (i === state.page ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
  }

  html += '<button ' + (state.page === totalPages ? 'disabled' : '') + ' data-page="next">\u203a</button>';
  pagination.innerHTML = html;

  pagination.querySelectorAll('button[data-page]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const value = btn.dataset.page;
      if (value === 'prev') state.page = Math.max(1, state.page - 1);
      else if (value === 'next') state.page = Math.min(totalPages, state.page + 1);
      else state.page = Number(value);
      renderTable();
    });
  });
}

// Wire up the Edit / Stock / Delete buttons on each row
function attachRowActionHandlers() {
  document.querySelectorAll('#inv-tbody button[data-action]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') openEditModal(id);
      else if (action === 'stock') openStockModal(id);
      else if (action === 'delete') deleteProductConfirm(id);
    });
  });
}

// ------------------------------------------------------------------
// Modals
// ------------------------------------------------------------------

function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop.show').forEach(function (m) {
    m.classList.remove('show');
  });
}

function openEditModal(id) {
  const product = getProductById(id);
  if (!product) return;
  editingId = id;

  document.getElementById('edit-name').value = product.name || '';
  document.getElementById('edit-sku').value = product.sku || '';
  document.getElementById('edit-barcode').value = product.barcode || '';
  document.getElementById('edit-category').value = product.category || '';
  document.getElementById('edit-supplier').value = product.supplier || '';
  document.getElementById('edit-cost').value = product.costPrice;
  document.getElementById('edit-selling').value = product.sellingPrice;
  document.getElementById('edit-stock').value = product.stock;
  document.getElementById('edit-safety').value = product.safetyStock;
  document.getElementById('edit-lead').value = product.leadTime;
  document.getElementById('edit-description').value = product.description || '';

  clearFormErrors(document.getElementById('edit-modal'));
  openModal('edit-modal');
}

function saveEditModal() {
  const modal = document.getElementById('edit-modal');
  clearFormErrors(modal);

  const formData = {
    name: document.getElementById('edit-name').value.trim(),
    sku: document.getElementById('edit-sku').value.trim(),
    barcode: document.getElementById('edit-barcode').value.trim(),
    category: document.getElementById('edit-category').value.trim(),
    supplier: document.getElementById('edit-supplier').value.trim(),
    costPrice: Number(document.getElementById('edit-cost').value),
    sellingPrice: Number(document.getElementById('edit-selling').value),
    stock: Number(document.getElementById('edit-stock').value),
    safetyStock: Number(document.getElementById('edit-safety').value),
    leadTime: Number(document.getElementById('edit-lead').value),
    description: document.getElementById('edit-description').value.trim()
  };

  const errors = validateProductInput(formData, editingId);
  if (Object.keys(errors).length) {
    const inputMap = {
      name: 'edit-name', sku: 'edit-sku', barcode: 'edit-barcode', category: 'edit-category',
      supplier: 'edit-supplier', costPrice: 'edit-cost', sellingPrice: 'edit-selling',
      stock: 'edit-stock', safetyStock: 'edit-safety', leadTime: 'edit-lead'
    };
    for (const [field, message] of Object.entries(errors)) {
      showFieldError(document.getElementById(inputMap[field]), message);
    }
    showToast('Please fix the highlighted fields.', 'error');
    return;
  }

  updateProduct(editingId, formData);
  closeModals();
  renderTable();
  updateSidebarBadge();
  showToast('Product updated successfully.', 'success');
}

function openStockModal(id) {
  const product = getProductById(id);
  if (!product) return;
  stockingId = id;
  document.getElementById('stock-product-name').textContent = product.name + ' - currently ' + product.stock + ' in stock (reorder point ' + product.reorderPoint + ')';
  document.getElementById('stock-new-value').value = product.stock;
  clearFormErrors(document.getElementById('stock-modal'));
  openModal('stock-modal');
}

function saveStockModal() {
  const input = document.getElementById('stock-new-value');
  const newStock = Number(input.value);

  if (isNaN(newStock) || newStock < 0) {
    showFieldError(input, 'Stock cannot be negative.');
    return;
  }

  updateStock(stockingId, newStock);
  closeModals();
  renderTable();
  updateSidebarBadge();
  showToast('Stock updated successfully.', 'success');
}

function deleteProductConfirm(id) {
  const product = getProductById(id);
  if (!product) return;
  const confirmed = confirm('Delete "' + product.name + '"? Its sales history will also be removed.');
  if (!confirmed) return;

  deleteProduct(id);
  renderTable();
  updateSidebarBadge();
  showToast('Product deleted.', 'success');
}

// ------------------------------------------------------------------
// CSV export
// ------------------------------------------------------------------

function exportProductsCSV() {
  const products = getFilteredProducts();
  if (!products.length) {
    showToast('Nothing to export.', 'error');
    return;
  }
  const rows = products.map(function (p) {
    return {
      SKU: p.sku,
      Barcode: p.barcode,
      Name: p.name,
      Category: p.category,
      Supplier: p.supplier,
      CostPrice: p.costPrice,
      SellingPrice: p.sellingPrice,
      Stock: p.stock,
      SafetyStock: p.safetyStock,
      LeadTimeDays: p.leadTime,
      AvgDailyDemand: p.averageDailyDemand,
      ReorderPoint: p.reorderPoint,
      Status: p.status
    };
  });
  downloadFile('inventory-export.csv', toCSV(rows), 'text/csv;charset=utf-8');
  showToast('Inventory CSV downloaded.', 'success');
}
