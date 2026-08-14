// utils.js - Small helper functions used across the whole app.
// Currency, dates, ids, SKUs, barcodes, toasts and safe HTML escaping.

// Format a number as currency: 1234.5 -> "$1,234.50"
function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Format a number with thousands separators: 12345 -> "12,345"
function formatNumber(number) {
  return (Number(number) || 0).toLocaleString('en-US');
}

// Convert a stored date string like "2026-08-10 14:32" or "2026-08-10T14:32" into a Date object.
// We parse it manually so it works the same in every browser.
const _dateTsCache = {};
function parseDate(dateString) {
  if (dateString instanceof Date) return dateString;
  const str = String(dateString || '').trim();
  if (!str) return new Date(0);
  if (_dateTsCache[str] !== undefined) {
    return new Date(_dateTsCache[str]);
  }
  const normalized = str.replace('T', ' ');
  const parts = normalized.split(' ');
  const datePart = (parts[0] || '').split('-');   // [year, month, day]
  const timePart = (parts[1] || '00:00').split(':'); // [hour, minute]
  const year = Number(datePart[0]) || 1970;
  const month = (Number(datePart[1]) || 1) - 1;
  const day = parseInt(datePart[2], 10) || 1;
  const hour = Number(timePart[0]) || 0;
  const minute = Number(timePart[1]) || 0;
  const second = Number(timePart[2]) || 0;

  const d = new Date(year, month, day, hour, minute, second);
  _dateTsCache[str] = d.getTime();
  return d;
}

// Short month names for labels
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Format a date string into a friendly label: "10 Aug 2026" or "10 Aug 2026 · 2:30 PM"
function formatDate(dateString, includeTime) {
  if (!dateString) return '-';
  const d = parseDate(dateString);
  let out = d.getDate() + ' ' + MONTH_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  if (includeTime) {
    let h = d.getHours();
    let m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    out += ' \u00b7 ' + h + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }
  return out;
}

// Short label for charts: "2026-08-10" -> "Aug 10"
function formatShortDate(dateString) {
  const d = parseDate(dateString);
  return MONTH_SHORT[d.getMonth()] + ' ' + d.getDate();
}

// Convert any date into a "YYYY-MM-DD" key (used for comparisons)
function toDateKey(date) {
  const d = date instanceof Date ? date : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// The key for "N days ago" (0 = today)
function daysAgoKey(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateKey(d);
}

// Add/subtract days from a "YYYY-MM-DD HH:mm" string, keeping the time
function shiftDate(dateString, daysToShift) {
  const d = parseDate(dateString);
  d.setDate(d.getDate() + daysToShift);
  return toDateKey(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Current date + time as a "YYYY-MM-DD HH:mm" string
function todayNowString() {
  const d = new Date();
  return toDateKey(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Generate a unique id: timestamp + random suffix
function generateId() {
  return 'ID-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

// Generate an SKU from a category name: "Electronics" -> "ELEC-A4F2B7"
function generateSKU(category) {
  const words = String(category || 'GEN').trim().split(/\s+/);
  let prefix = '';
  for (const word of words) {
    prefix += word.charAt(0).toUpperCase();
    if (prefix.length >= 4) break;
  }
  prefix = prefix || 'GEN';
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return prefix + '-' + randomPart;
}

// Generate a 13 digit EAN style barcode with a valid-looking check digit
function generateBarcode() {
  let barcode = '';
  for (let i = 0; i < 12; i++) {
    barcode += Math.floor(Math.random() * 10);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return barcode + checkDigit;
}

// Escape text so user input can't break the HTML
function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Store a toast message in sessionStorage so it can survive page navigation
function setPendingToast(message, type) {
  try {
    sessionStorage.setItem('pendingToast', JSON.stringify({ message: message, type: type, time: Date.now() }));
  } catch (e) {}
}

function checkPendingToast() {
  try {
    const pending = sessionStorage.getItem('pendingToast');
    if (pending) {
      sessionStorage.removeItem('pendingToast');
      const data = JSON.parse(pending);
      if (data && data.message && (Date.now() - (data.time || 0) < 10000)) {
        showToast(data.message, data.type || 'info', true);
      }
    }
  } catch (e) {}
}

// Show a small toast notification at the bottom of the page
function showToast(message, type, skipSave) {
  if (!skipSave) {
    setPendingToast(message, type);
    setTimeout(function () {
      try {
        const pending = sessionStorage.getItem('pendingToast');
        if (pending) {
          const data = JSON.parse(pending);
          if (data && data.message === message) {
            sessionStorage.removeItem('pendingToast');
          }
        }
      } catch (e) {}
    }, 1500);
  }

  let toastWrap = document.querySelector('.toast-wrap');
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    document.body.appendChild(toastWrap);
  }
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : 'toast-info');
  toast.textContent = message;
  toastWrap.appendChild(toast);
  setTimeout(function () {
    toast.classList.add('show');
  }, 10);
  setTimeout(function () {
    toast.classList.remove('show');
    setTimeout(function () { toast.remove(); }, 300);
  }, 3200);
}

// Download a text file with a given name (used for CSV and JSON export)
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Convert an array of objects into CSV text
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const cells = headers.map(function (h) {
      let value = row[h];
      if (value == null) value = '';
      value = String(value);
      // Escape commas, quotes and newlines
      if (/[",\n]/.test(value)) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    });
    lines.push(cells.join(','));
  }
  return lines.join('\r\n');
}

// Global helper: automatically open native calendar dialog when clicking on any <input type="date">
document.addEventListener('DOMContentLoaded', function () {
  checkPendingToast();
  document.querySelectorAll('input[type="date"]').forEach(function (input) {
    input.style.cursor = 'pointer';
    input.addEventListener('click', function (e) {
      try {
        if (typeof e.target.showPicker === 'function') {
          e.target.showPicker();
        }
      } catch (err) {
        // Ignored
      }
    });
  });
});
