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
// In-memory cache & Initialisation
// ------------------------------------------------------------------

const _memCache = {
  products: null,
  sales: null,
  categories: null,
  users: null
};

function clearMemCache() {
  _memCache.products = null;
  _memCache.sales = null;
  _memCache.categories = null;
  _memCache.users = null;
}

let _initPromise = null;

// Seed LocalStorage from the JSON files (only the first time the app runs).
// Returns a Promise. Safe to call on every page load - reuses in-flight or completed Promise.
function initializeDatabase() {
  if (_initPromise) return _initPromise;

  _initPromise = (async function () {
    const missing = [];
    for (const key of Object.values(DB_KEYS)) {
      const val = localStorage.getItem(key);
      if (val === null || (key === DB_KEYS.sales && (val === '[]' || !JSON.parse(val || '[]').length))) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      for (const key of missing) {
        await loadJSON(key, true);
      }
      shiftSalesDatesToToday();
    }

    recalculateProductMetrics();
    return true;
  })();

  return _initPromise;
}

// Load a single JSON file into LocalStorage.
// If fetch() fails (e.g. the page is opened directly from file://),
// we fall back to data/seed.js which holds the same data as JavaScript.
async function loadJSON(key, forceReload = false) {
  if (!forceReload && localStorage.getItem(key) !== null && localStorage.getItem(key) !== '[]') return;

  // Fast path: if SEED_DATA is already present in window, use it synchronously
  if (typeof window.SEED_DATA !== 'undefined' && window.SEED_DATA[key]) {
    const seedVal = window.SEED_DATA[key];
    if (Array.isArray(seedVal) && seedVal.length > 0) {
      localStorage.setItem(key, JSON.stringify(seedVal));
      _memCache[key] = seedVal;
      return;
    }
  }

  try {
    const response = await fetch('data/' + key + '.json?nocache=' + new Date().getTime());
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    localStorage.setItem(key, JSON.stringify(data));
    _memCache[key] = data;
  } catch (error) {
    await loadSeedFallback(forceReload);
  }
}

// Load data/seed.js dynamically and write all datasets.
// Returns a Promise so callers can wait for it.
function loadSeedFallback(forceReload = false) {
  return new Promise(function (resolve) {
    function saveFromSeed() {
      if (typeof window.SEED_DATA !== 'undefined') {
        for (const key of Object.values(DB_KEYS)) {
          const val = localStorage.getItem(key);
          if (forceReload || val === null || val === '[]') {
            const seedVal = window.SEED_DATA[key];
            if (Array.isArray(seedVal) && seedVal.length > 0) {
              localStorage.setItem(key, JSON.stringify(seedVal));
              _memCache[key] = seedVal;
            }
          }
        }
      }
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
      resolve();
    };
    document.head.appendChild(script);
  });
}

// ------------------------------------------------------------------
// Simple getters / setters (with fast in-memory caching)
// ------------------------------------------------------------------

function getProducts() {
  if (_memCache.products !== null) return _memCache.products;
  _memCache.products = JSON.parse(localStorage.getItem(DB_KEYS.products) || '[]');
  return _memCache.products;
}

function saveProducts(products) {
  _memCache.products = products;
  localStorage.setItem(DB_KEYS.products, JSON.stringify(products));
}

function getSales() {
  if (_memCache.sales !== null) return _memCache.sales;
  _memCache.sales = JSON.parse(localStorage.getItem(DB_KEYS.sales) || '[]');
  return _memCache.sales;
}

function saveSales(sales) {
  _memCache.sales = sales;
  localStorage.setItem(DB_KEYS.sales, JSON.stringify(sales));
}

function getCategories() {
  if (_memCache.categories !== null) return _memCache.categories;
  _memCache.categories = JSON.parse(localStorage.getItem(DB_KEYS.categories) || '[]');
  return _memCache.categories;
}

function saveCategories(categories) {
  _memCache.categories = categories;
  localStorage.setItem(DB_KEYS.categories, JSON.stringify(categories));
}

function getUsers() {
  if (_memCache.users !== null) return _memCache.users;
  _memCache.users = JSON.parse(localStorage.getItem(DB_KEYS.users) || '[]');
  return _memCache.users;
}

function saveUsers(users) {
  _memCache.users = users;
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
  clearMemCache();
  _initPromise = null;
  localStorage.removeItem(DB_KEYS.products);
  localStorage.removeItem(DB_KEYS.sales);
  localStorage.removeItem(DB_KEYS.categories);
  localStorage.removeItem(DB_KEYS.users);
  await initializeDatabase();
  return true;
}

// Replace all data with imported JSON. Returns an array of errors (empty = ok).
function importDatabase(data) {
  clearMemCache();
  _initPromise = null;
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('The file does not contain valid JSON.');
    return errors;
  }
  if (Array.isArray(data.products)) saveProducts(data.products);
  else errors.push('Missing "products" array.');
  if (Array.isArray(data.sales)) saveSales(data.sales);
  else errors.push('Missing "sales" array.');
  if (Array.isArray(data.categories)) saveCategories(data.categories);
  else errors.push('Missing "categories" array.');
  if (Array.isArray(data.users)) saveUsers(data.users);
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
// Fast single pass O(S + P) instead of nested loops O(P * S).
function recalculateProductMetrics() {
  const products = getProducts();
  const sales = getSales();
  if (!products.length) return;

  const cutoffMs = parseDate(daysAgoKey(DEMAND_DAYS)).getTime();

  // Aggregate units sold per product in a single O(S) pass
  const salesUnitsMap = {};
  for (let i = 0; i < sales.length; i++) {
    const sale = sales[i];
    const saleDateMs = parseDate(sale.date).getTime();
    if (saleDateMs >= cutoffMs) {
      const pid = String(sale.productId);
      salesUnitsMap[pid] = (salesUnitsMap[pid] || 0) + Number(sale.quantity || 0);
    }
  }

  let changed = false;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const pid = String(product.id);
    const unitsSold = salesUnitsMap[pid] || 0;

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
