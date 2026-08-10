// add-product.js - Creates a new product and saves it to LocalStorage.
// The dashboard, inventory, forecast and reorder pages all read the same
// LocalStorage, so they update automatically.

// These two are generated automatically so every product gets a unique code.
let currentSKU = '';
let currentBarcode = '';

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();

  // Build the category suggestions from LocalStorage
  populateCategoryList();

  // Auto-generate SKU and barcode
  currentSKU = generateSKU(document.getElementById('category').value || 'GEN');
  currentBarcode = generateBarcode();
  document.getElementById('sku').value = currentSKU;
  updateCodePreview();

  // --- Live preview updates ---
  document.getElementById('product-name').addEventListener('input', function (e) {
    document.getElementById('preview-title').textContent = e.target.value || 'Your product name';
  });
  document.getElementById('category').addEventListener('input', function (e) {
    document.getElementById('preview-category').textContent = e.target.value || '\u2014';
    // Refresh the SKU prefix when the category changes (only if untouched)
    currentSKU = generateSKU(e.target.value || 'GEN');
    document.getElementById('sku').value = currentSKU;
    updateCodePreview();
  });
  document.getElementById('supplier').addEventListener('input', function (e) {
    document.getElementById('preview-supplier').textContent = e.target.value || 'Unassigned';
  });

  ['cost-price', 'selling-price', 'opening-stock', 'safety-stock', 'lead-time'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', updatePreviewStats);
  });
  updatePreviewStats();

  // --- Buttons ---
  document.getElementById('save-product-btn').addEventListener('click', saveProduct);
  document.getElementById('cancel-btn').addEventListener('click', function () {
    window.location.href = 'inventory.html';
  });

  // Clear errors while the user types again
  const formFields = document.querySelectorAll('.left-column input');
  formFields.forEach(function (input) {
    input.addEventListener('input', function () { clearFieldError(input); });
  });
});

// Fill the category datalist from LocalStorage
function populateCategoryList() {
  const list = document.getElementById('category-list');
  const categories = getCategories();
  list.innerHTML = categories.map(function (c) {
    return '<option value="' + escapeHtml(c.name) + '"></option>';
  }).join('');
}

// Show the generated SKU and barcode in the "Codes" panel
function updateCodePreview() {
  document.getElementById('preview-sku').textContent = currentSKU;
  document.getElementById('preview-barcode').textContent = currentBarcode;
}

// Recalculate the live preview numbers
function updatePreviewStats() {
  const cost = Number(document.getElementById('cost-price').value) || 0;
  const selling = Number(document.getElementById('selling-price').value) || 0;
  const stock = Number(document.getElementById('opening-stock').value) || 0;
  const safety = Number(document.getElementById('safety-stock').value) || 0;
  const leadTime = Number(document.getElementById('lead-time').value) || 0;

  const profit = selling - cost;
  const margin = selling > 0 ? (profit / selling) * 100 : 0;
  const stockValue = stock * cost;

  // Estimate demand from the average demand of existing products
  const products = getProducts();
  const avgADD = products.length
    ? products.reduce(function (sum, p) { return sum + (Number(p.averageDailyDemand) || 0); }, 0) / products.length
    : 1;
  const rop = Math.ceil(leadTime * avgADD + safety);

  document.getElementById('preview-profit').textContent = formatCurrency(Math.max(0, profit));
  document.getElementById('preview-margin').textContent = margin.toFixed(1) + '%';
  document.getElementById('preview-stock-value').textContent = formatCurrency(stockValue);
  document.getElementById('preview-rop').textContent = rop + ' units';
}

// Validate the form, build the product object and save it
function saveProduct() {
  clearFormErrors(document.querySelector('.left-column'));

  const formData = {
    name: document.getElementById('product-name').value.trim(),
    sku: document.getElementById('sku').value.trim() || currentSKU,
    barcode: currentBarcode,
    category: document.getElementById('category').value.trim(),
    supplier: document.getElementById('supplier').value.trim(),
    costPrice: Number(document.getElementById('cost-price').value),
    sellingPrice: Number(document.getElementById('selling-price').value),
    stock: Number(document.getElementById('opening-stock').value),
    safetyStock: Number(document.getElementById('safety-stock').value),
    leadTime: Number(document.getElementById('lead-time').value),
    description: document.getElementById('description').value.trim()
  };

  const errors = validateProductInput(formData);
  if (Object.keys(errors).length) {
    // Show each error under its field
    for (const [field, message] of Object.entries(errors)) {
      const inputMap = {
        name: 'product-name', sku: 'sku', category: 'category', supplier: 'supplier',
        costPrice: 'cost-price', sellingPrice: 'selling-price', stock: 'opening-stock',
        safetyStock: 'safety-stock', leadTime: 'lead-time'
      };
      showFieldError(document.getElementById(inputMap[field]), message);
    }
    showToast('Please fix the highlighted fields.', 'error');
    return;
  }

  // Build the full product object
  const now = todayNowString();
  const product = {
    id: generateId(),
    sku: formData.sku,
    barcode: formData.barcode,
    name: formData.name,
    description: formData.description || '',
    category: formData.category,
    supplier: formData.supplier,
    costPrice: formData.costPrice,
    sellingPrice: formData.sellingPrice,
    stock: formData.stock,
    minimumStock: formData.safetyStock,
    safetyStock: formData.safetyStock,
    leadTime: formData.leadTime,
    averageDailyDemand: 0,
    reorderPoint: Math.ceil(formData.leadTime * 1 + formData.safetyStock),
    forecastDemand: Math.round(1 * 7),
    status: 'In Stock',
    createdAt: now,
    updatedAt: now
  };

  const products = getProducts();
  products.push(product);
  saveProducts(products);
  recalculateProductMetrics();

  showToast('Product "' + product.name + '" saved to inventory.', 'success');
  setTimeout(function () {
    window.location.href = 'inventory.html';
  }, 800);
}
