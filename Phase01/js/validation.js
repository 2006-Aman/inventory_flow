// validation.js - Form validation helpers.
// Validates product forms, sale forms and auth forms, and shows
// small red error messages under the offending inputs.

// Validate a product form.
// formData: an object with name, sku, barcode, category, supplier,
//           costPrice, sellingPrice, stock, safetyStock, leadTime
// ignoreId: the id of the product being edited (so its own SKU / barcode
//           are not treated as duplicates).
// Returns an object of { fieldName: errorMessage }.
function validateProductInput(formData, ignoreId) {
  const errors = {};

  // Required text fields
  if (!formData.name || !String(formData.name).trim()) errors.name = 'Product name is required.';
  if (!formData.category || !String(formData.category).trim()) errors.category = 'Category is required.';
  if (!formData.supplier || !String(formData.supplier).trim()) errors.supplier = 'Supplier is required.';

  // Prices must be positive and selling price must beat cost price
  const cost = Number(formData.costPrice);
  const selling = Number(formData.sellingPrice);
  if (formData.costPrice === '' || formData.costPrice == null || isNaN(cost) || cost <= 0) {
    errors.costPrice = 'Cost price must be a positive number.';
  }
  if (formData.sellingPrice === '' || formData.sellingPrice == null || isNaN(selling) || selling <= 0) {
    errors.sellingPrice = 'Selling price must be a positive number.';
  }
  if (!errors.costPrice && !errors.sellingPrice && selling <= cost) {
    errors.sellingPrice = 'Selling price must be higher than the cost price.';
  }

  // Stock and buffers cannot be negative
  const stock = Number(formData.stock);
  if (formData.stock === '' || formData.stock == null || isNaN(stock) || stock < 0) {
    errors.stock = 'Stock cannot be negative.';
  }
  const safety = Number(formData.safetyStock);
  if (formData.safetyStock === '' || formData.safetyStock == null || isNaN(safety) || safety < 0) {
    errors.safetyStock = 'Safety stock cannot be negative.';
  }
  const leadTime = Number(formData.leadTime);
  if (formData.leadTime === '' || formData.leadTime == null || isNaN(leadTime) || leadTime <= 0) {
    errors.leadTime = 'Lead time must be a positive number of days.';
  }

  // Duplicate SKU / barcode checks (SKU and barcode must be unique)
  const products = getProducts();
  if (formData.sku && String(formData.sku).trim()) {
    const skuTaken = products.some(function (p) {
      return String(p.sku).toLowerCase() === String(formData.sku).trim().toLowerCase() && String(p.id) !== String(ignoreId);
    });
    if (skuTaken) errors.sku = 'This SKU is already used by another product.';
  }
  if (formData.barcode && String(formData.barcode).trim()) {
    const barcodeTaken = products.some(function (p) {
      return String(p.barcode) === String(formData.barcode).trim() && String(p.id) !== String(ignoreId);
    });
    if (barcodeTaken) errors.barcode = 'This barcode is already used by another product.';
  }

  return errors;
}

// Validate a sale form. saleData = { productId, quantity }
function validateSaleInput(saleData) {
  const errors = {};
  if (!saleData.productId) errors.productId = 'Please choose a product.';
  const qty = Number(saleData.quantity);
  if (!saleData.quantity || isNaN(qty) || qty <= 0) {
    errors.quantity = 'Quantity must be greater than zero.';
  }
  return errors;
}

// Validate the signup form. userData = { name, email, password, confirm }
function validateSignupInput(userData) {
  const errors = {};
  if (!userData.name || !String(userData.name).trim()) errors.name = 'Name is required.';
  if (!userData.email || !isValidEmail(userData.email)) errors.email = 'Enter a valid email address.';
  if (!userData.password || String(userData.password).length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/[A-Z]/.test(userData.password)) errors.password = 'Password must contain at least one uppercase letter.';
  else if (!/[0-9]/.test(userData.password)) errors.password = 'Password must contain at least one numeric digit.';
  else if (!/[^A-Za-z0-9]/.test(userData.password)) errors.password = 'Password must contain at least one special character.';
  if (userData.password !== userData.confirm) errors.confirm = 'Passwords do not match.';

  // Email must not already exist in the users database
  if (!errors.email) {
    const taken = getUsers().some(function (u) {
      return String(u.email).toLowerCase() === String(userData.email).toLowerCase();
    });
    if (taken) errors.email = 'This email is already registered.';
  }
  return errors;
}

// Validate the login form. Returns an error message string or ''.
function validateLoginInput(loginData) {
  if (!loginData.email || !isValidEmail(loginData.email)) return 'Enter a valid email address.';
  if (!loginData.password) return 'Password is required.';
  return '';
}

// Simple email format check
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

// Show an error message under an input (or in a fallback spot)
function showFieldError(input, message) {
  if (!input) return;
  input.classList.add('input-error');
  let errorEl = input.closest('.field') ? input.closest('.field').querySelector('.field-error') : null;
  if (!errorEl) {
    errorEl = input.parentElement.querySelector('.field-error');
  }
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

// Remove the error styling from a single input
function clearFieldError(input) {
  if (!input) return;
  input.classList.remove('input-error');
  const errorEl = input.closest('.field') ? input.closest('.field').querySelector('.field-error') : null;
  if (errorEl) errorEl.style.display = 'none';
}

// Remove error styling from every input inside a form
function clearFormErrors(form) {
  if (!form) return;
  form.querySelectorAll('.input-error').forEach(function (el) { el.classList.remove('input-error'); });
  form.querySelectorAll('.field-error').forEach(function (el) { el.style.display = 'none'; });
}
