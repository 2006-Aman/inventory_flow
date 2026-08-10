// sales-history.js - Sales history page.
// Lists every sale from LocalStorage with search, filters, sorting,
// pagination and CSV export.

const SALES_PAGE_SIZE = 15;

const salesState = {
  search: '',
  product: '',
  from: '',
  to: '',
  sortKey: 'date',
  sortDir: 'desc',
  page: 1
};

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();
  populateProductFilter();
  wireEvents();
  renderSalesTable();
  updateSidebarBadge();
});

function wireEvents() {
  document.getElementById('sales-search').addEventListener('input', function (e) {
    salesState.search = e.target.value.toLowerCase();
    salesState.page = 1;
    renderSalesTable();
  });

  document.getElementById('filter-product').addEventListener('change', function (e) {
    salesState.product = e.target.value;
    salesState.page = 1;
    renderSalesTable();
  });

  document.getElementById('filter-from').addEventListener('change', function (e) {
    salesState.from = e.target.value;
    salesState.page = 1;
    renderSalesTable();
  });

  document.getElementById('filter-to').addEventListener('change', function (e) {
    salesState.to = e.target.value;
    salesState.page = 1;
    renderSalesTable();
  });

  document.querySelectorAll('th.sortable').forEach(function (th) {
    th.addEventListener('click', function () {
      const key = th.dataset.sort;
      if (salesState.sortKey === key) {
        salesState.sortDir = salesState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        salesState.sortKey = key;
        salesState.sortDir = 'desc';
      }
      salesState.page = 1;
      renderSalesTable();
    });
  });

  document.getElementById('export-sales-btn').addEventListener('click', exportSalesCSV);
}

function populateProductFilter() {
  const select = document.getElementById('filter-product');
  const products = getProducts().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  select.innerHTML = '<option value="">All Products</option>' +
    products.map(function (p) { return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.name) + '</option>'; }).join('');
}

function getFilteredSales() {
  let sales = getSales();

  if (salesState.search) {
    sales = sales.filter(function (s) {
      return (s.productName || '').toLowerCase().indexOf(salesState.search) !== -1 ||
        (s.customer || '').toLowerCase().indexOf(salesState.search) !== -1 ||
        String(s.id).toLowerCase().indexOf(salesState.search) !== -1;
    });
  }
  if (salesState.product) {
    sales = sales.filter(function (s) { return String(s.productId) === String(salesState.product); });
  }
  if (salesState.from) {
    sales = sales.filter(function (s) { return toDateKey(parseDate(s.date)) >= salesState.from; });
  }
  if (salesState.to) {
    sales = sales.filter(function (s) { return toDateKey(parseDate(s.date)) <= salesState.to; });
  }

  const key = salesState.sortKey;
  const dir = salesState.sortDir === 'asc' ? 1 : -1;
  sales.sort(function (a, b) {
    if (key === 'date') return (parseDate(a.date) - parseDate(b.date)) * dir;
    const av = Number(a[key]);
    const bv = Number(b[key]);
    return (av - bv) * dir;
  });

  return sales;
}

function renderSalesTable() {
  const sales = getFilteredSales();
  const tbody = document.getElementById('sales-tbody');

  const totalPages = Math.max(1, Math.ceil(sales.length / SALES_PAGE_SIZE));
  if (salesState.page > totalPages) salesState.page = totalPages;
  const start = (salesState.page - 1) * SALES_PAGE_SIZE;
  const pageSales = sales.slice(start, start + SALES_PAGE_SIZE);

  if (!pageSales.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No sales match your filters.</td></tr>';
  } else {
    tbody.innerHTML = pageSales.map(function (s) {
      const total = Number(s.quantity) * Number(s.sellingPrice);
      const profitColor = Number(s.profit) >= 0 ? '#34d399' : '#ef4444';
      return '<tr>' +
        '<td><div>' + formatDate(s.date) + '</div><div class="sub-cell">' + formatDate(s.date, true).split('\u00b7')[1].trim() + '</div></td>' +
        '<td><div class="prod-name">' + escapeHtml(s.productName) + '</div><div class="prod-sku">' + escapeHtml(s.id) + '</div></td>' +
        '<td>' + escapeHtml(s.customer) + '</td>' +
        '<td class="num">' + formatNumber(s.quantity) + '</td>' +
        '<td class="num">' + formatCurrency(s.sellingPrice) + '</td>' +
        '<td class="num" style="color:' + profitColor + ';">' + formatCurrency(s.profit) + '</td>' +
        '<td class="num" style="font-weight:600;">' + formatCurrency(total) + '</td>' +
        '</tr>';
    }).join('');
  }

  // Pagination
  const pagination = document.getElementById('sales-pagination');
  let html = '<span class="page-info">' + sales.length + ' sale(s)</span>';
  html += '<button ' + (salesState.page === 1 ? 'disabled' : '') + ' data-page="prev">\u2039</button>';
  const startPage = Math.max(1, salesState.page - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  for (let i = startPage; i <= endPage; i++) {
    html += '<button class="' + (i === salesState.page ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
  }
  html += '<button ' + (salesState.page === totalPages ? 'disabled' : '') + ' data-page="next">\u203a</button>';
  pagination.innerHTML = html;

  pagination.querySelectorAll('button[data-page]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const value = btn.dataset.page;
      if (value === 'prev') salesState.page = Math.max(1, salesState.page - 1);
      else if (value === 'next') salesState.page = Math.min(totalPages, salesState.page + 1);
      else salesState.page = Number(value);
      renderSalesTable();
    });
  });
}

function exportSalesCSV() {
  const sales = getFilteredSales();
  if (!sales.length) {
    showToast('Nothing to export.', 'error');
    return;
  }
  const rows = sales.map(function (s) {
    return {
      ID: s.id,
      Product: s.productName,
      Quantity: s.quantity,
      SellingPrice: s.sellingPrice,
      CostPrice: s.costPrice,
      Profit: s.profit,
      Total: Number(s.quantity) * Number(s.sellingPrice),
      Customer: s.customer,
      Date: s.date
    };
  });
  downloadFile('sales-history.csv', toCSV(rows), 'text/csv;charset=utf-8');
  showToast('Sales CSV downloaded.', 'success');
}
