// storage.js - The main database manager for the whole app.
// -----------------------------------------------------------
// LocalStorage is the ONLY source of truth after the first visit.
// On the very first visit the JSON files in the data/ folder are
// loaded and saved into LocalStorage under these keys:
//
//   products, sales, categories, users
//
// Every page should read and write through the functions below.

const DB_KEYS = {
  products: 'products',
  sales: 'sales',
  categories: 'categories',
  users: 'users'
};

// Number of days of sales history we use for demand calculations
const DEMAND_DAYS = 90;

// ------------------------------------------------------------------
// Initialisation
// ------------------------------------------------------------------

// Seed LocalStorage from the JSON files (only the first time the app runs).
// Returns a Promise. Safe to call on every page load - it does nothing
// if the data is already stored.
async function initializeDatabase() {
  const missing = [];
  for (const key of Object.values(DB_KEYS)) {
    if (localStorage.getItem(key) === null) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    for (const key of missing) {
      await loadJSON(key);
    }
    // Keep the demo alive: shift sale dates so the newest sale is "today"
    shiftSalesDatesToToday();
  }

  // Always keep the computed fields (demand, reorder point, status) fresh
  recalculateProductMetrics();
  return true;
}

// Load a single JSON file into LocalStorage.
// If fetch() fails (e.g. the page is opened directly from file://),
// we fall back to data/seed.js which holds the same data as JavaScript.
async function loadJSON(key) {
  if (localStorage.getItem(key) !== null) return; // already stored

  try {
    const response = await fetch('data/' + key + '.json?nocache=' + new Date().getTime());
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    await loadSeedFallback();
  }
}

// Load data/seed.js dynamically and write all four datasets.
// Returns a Promise so callers can wait for it.
function loadSeedFallback() {
  return new Promise(function (resolve) {
    function saveFromSeed() {
      localStorage.setItem(DB_KEYS.products, JSON.stringify(window.SEED_DATA.products || []));
      localStorage.setItem(DB_KEYS.sales, JSON.stringify(window.SEED_DATA.sales || []));
      localStorage.setItem(DB_KEYS.categories, JSON.stringify(window.SEED_DATA.categories || []));
      localStorage.setItem(DB_KEYS.users, JSON.stringify(window.SEED_DATA.users || []));
      resolve();
    }
    if (typeof window.SEED_DATA !== 'undefined') {
      saveFromSeed();
      return;
    }
    const script = document.createElement('script');
    script.src = 'data/seed.js';
    script.onload = saveFromSeed;
    script.onerror = function () {
      alert('Could not load the initial database. Please open this project through a local server (for example the Live Server extension in VS Code).');
      resolve();
    };
    document.head.appendChild(script);
  });
}

// ------------------------------------------------------------------
// Simple getters / setters
// ------------------------------------------------------------------

function getProducts() {
  return JSON.parse(localStorage.getItem(DB_KEYS.products) || '[]');
}

function saveProducts(products) {
  localStorage.setItem(DB_KEYS.products, JSON.stringify(products));
}

function getSales() {
  return JSON.parse(localStorage.getItem(DB_KEYS.sales) || '[]');
}

function saveSales(sales) {
  localStorage.setItem(DB_KEYS.sales, JSON.stringify(sales));
}

function getCategories() {
  return JSON.parse(localStorage.getItem(DB_KEYS.categories) || '[]');
}

function saveCategories(categories) {
  localStorage.setItem(DB_KEYS.categories, JSON.stringify(categories));
}

function getUsers() {
  return JSON.parse(localStorage.getItem(DB_KEYS.users) || '[]');
}

function saveUsers(users) {
  localStorage.setItem(DB_KEYS.users, JSON.stringify(users));
}

// ------------------------------------------------------------------
// Users / session
// ------------------------------------------------------------------

function getCurrentUser() {
  return JSON.parse(localStorage.getItem('currentUser') || 'null');
}

function setCurrentUser(user) {
  localStorage.setItem('currentUser', JSON.stringify(user));
}

function logoutUser() {
  localStorage.removeItem('currentUser');
}

// ------------------------------------------------------------------
// Products
// ------------------------------------------------------------------

function getProductById(id) {
  return getProducts().find(function (p) { return String(p.id) === String(id); });
}

// Edit an existing product. The computed fields (averageDailyDemand,
// reorderPoint, forecastDemand, status) are recalculated afterwards.
function updateProduct(id, updatedData) {
  const products = getProducts();
  const index = products.findIndex(function (p) { return String(p.id) === String(id); });
  if (index === -1) return false;
  products[index] = Object.assign({}, products[index], updatedData, {
    updatedAt: todayNowString()
  });
  saveProducts(products);
  recalculateProductMetrics();
  return true;
}

// Delete a product and every sale linked to it
function deleteProduct(id) {
  const products = getProducts().filter(function (p) { return String(p.id) !== String(id); });
  saveProducts(products);
  const sales = getSales().filter(function (s) { return String(s.productId) !== String(id); });
  saveSales(sales);
  return true;
}

// Set the stock level of a product directly (never negative)
function updateStock(productId, newStock) {
  const products = getProducts();
  const product = products.find(function (p) { return String(p.id) === String(productId); });
  if (!product) return false;
  product.stock = Math.max(0, Number(newStock) || 0);
  product.updatedAt = todayNowString();
  saveProducts(products);
  recalculateProductMetrics();
  return true;
}

// Add / remove a quantity from a product's stock
function adjustStock(productId, delta) {
  const product = getProductById(productId);
  if (!product) return false;
  return updateStock(productId, Number(product.stock) + Number(delta));
}

// ------------------------------------------------------------------
// Sales
// ------------------------------------------------------------------

// Record a sale: checks stock, stores the sale, decreases the stock.
// saleData = { productId, quantity, customer, date }
// Returns { ok: true, sale } on success or { ok: false, error } on failure.
function addSale(saleData) {
  const products = getProducts();
  const product = products.find(function (p) { return String(p.id) === String(saleData.productId); });
  if (!product) return { ok: false, error: 'Product not found.' };

  const quantity = Number(saleData.quantity);
  if (!quantity || quantity <= 0) return { ok: false, error: 'Quantity must be greater than zero.' };
  if (quantity > Number(product.stock)) return { ok: false, error: 'Not enough stock available (' + product.stock + ' in stock).' };

  const sellingPrice = Number(product.sellingPrice);
  const costPrice = Number(product.costPrice);

  const sale = {
    id: generateId(),
    productId: product.id,
    productName: product.name,
    quantity: quantity,
    sellingPrice: sellingPrice,
    costPrice: costPrice,
    profit: Math.round((sellingPrice - costPrice) * quantity * 100) / 100,
    customer: saleData.customer || 'Walk-in Customer',
    date: saleData.date || todayNowString()
  };

  // Decrease stock and save both collections
  product.stock = Number(product.stock) - quantity;
  product.updatedAt = todayNowString();
  saveProducts(products);

  const sales = getSales();
  sales.push(sale);
  saveSales(sales);

  recalculateProductMetrics();
  return { ok: true, sale: sale };
}

// ------------------------------------------------------------------
// Reset / import
// ------------------------------------------------------------------

// Clear every LocalStorage key, then re-seed from the JSON files.
async function resetDatabase() {
  localStorage.removeItem(DB_KEYS.products);
  localStorage.removeItem(DB_KEYS.sales);
  localStorage.removeItem(DB_KEYS.categories);
  localStorage.removeItem(DB_KEYS.users);
  await initializeDatabase();
  return true;
}

// Replace all data with imported JSON. Returns an array of errors (empty = ok).
function importDatabase(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('The file does not contain valid JSON.');
    return errors;
  }
  if (Array.isArray(data.products)) localStorage.setItem(DB_KEYS.products, JSON.stringify(data.products));
  else errors.push('Missing "products" array.');
  if (Array.isArray(data.sales)) localStorage.setItem(DB_KEYS.sales, JSON.stringify(data.sales));
  else errors.push('Missing "sales" array.');
  if (Array.isArray(data.categories)) localStorage.setItem(DB_KEYS.categories, JSON.stringify(data.categories));
  else errors.push('Missing "categories" array.');
  if (Array.isArray(data.users)) localStorage.setItem(DB_KEYS.users, JSON.stringify(data.users));
  else errors.push('Missing "users" array.');

  if (errors.length === 0) {
    shiftSalesDatesToToday();
    recalculateProductMetrics();
  }
  return errors;
}

// ------------------------------------------------------------------
// Computed product metrics (demand, reorder point, forecast, status)
// ------------------------------------------------------------------

// Move the sale dates forward/backward so the newest sale lands on today.
// This keeps the demo charts and KPIs alive no matter when the app opens.
function shiftSalesDatesToToday() {
  const sales = getSales();
  if (!sales.length) return;

  let newest = null;
  for (const sale of sales) {
    if (newest === null || parseDate(sale.date) > parseDate(newest)) newest = sale.date;
  }

  const newestDate = parseDate(newest);
  newestDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - newestDate) / 86400000);
  if (diffDays === 0) return;

  for (const sale of sales) {
    sale.date = shiftDate(sale.date, diffDays);
  }
  saveSales(sales);
}

// Recalculate averageDailyDemand, reorderPoint, forecastDemand and status
// for every product, based on the sales in LocalStorage.
// Reorder Point = Lead Time x Average Daily Demand + Safety Stock
function recalculateProductMetrics() {
  const products = getProducts();
  const sales = getSales();
  if (!products.length) return;

  const cutoff = parseDate(daysAgoKey(DEMAND_DAYS));
  let changed = false;

  for (const product of products) {
    // Units sold for this product over the last DEMAND_DAYS days
    let unitsSold = 0;
    for (const sale of sales) {
      if (String(sale.productId) !== String(product.id)) continue;
      const saleDate = parseDate(sale.date);
      if (saleDate < cutoff) continue;
      unitsSold += Number(sale.quantity);
    }

    const averageDailyDemand = Math.round((unitsSold / DEMAND_DAYS) * 10) / 10;
    const leadTime = Number(product.leadTime) || 0;
    const safetyStock = Number(product.safetyStock) || 0;
    const reorderPoint = Math.ceil(leadTime * averageDailyDemand + safetyStock);
    const forecastDemand = Math.round(averageDailyDemand * 7); // next 7 days
    const status = getProductStatus(Number(product.stock), reorderPoint, safetyStock);

    if (
      product.averageDailyDemand !== averageDailyDemand ||
      product.reorderPoint !== reorderPoint ||
      product.forecastDemand !== forecastDemand ||
      product.status !== status
    ) {
      product.averageDailyDemand = averageDailyDemand;
      product.reorderPoint = reorderPoint;
      product.forecastDemand = forecastDemand;
      product.status = status;
      product.updatedAt = todayNowString();
      changed = true;
    }
  }

  if (changed) saveProducts(products);
}

// Decide the status of a product from its stock level
function getProductStatus(stock, reorderPoint, safetyStock) {
  stock = Number(stock) || 0;
  if (stock <= 0) return 'Out of Stock';
  if (stock <= Number(safetyStock)) return 'Critical';
  if (stock <= Number(reorderPoint)) return 'Low Stock';
  return 'In Stock';
}

// The recommended order quantity: enough to cover the lead time plus a buffer
function recommendedOrderQuantity(product) {
  const add = Number(product.averageDailyDemand) || 0;
  const leadTime = Number(product.leadTime) || 0;
  const safetyStock = Number(product.safetyStock) || 0;
  const reorderPoint = Number(product.reorderPoint) || 0;
  return Math.max(0, Math.ceil(reorderPoint + add * leadTime) - Number(product.stock));
}

// ------------------------------------------------------------------
// Sidebar / topbar badges (low stock count)
// ------------------------------------------------------------------

function countProductsNeedingReorder() {
  return getProducts().filter(function (p) {
    return p.status === 'Low Stock' || p.status === 'Critical' || p.status === 'Out of Stock';
  }).length;
}

function updateSidebarBadge() {
  const badge = document.getElementById('sidebar-reorder-badge');
  if (badge) {
    const count = countProductsNeedingReorder();
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}
