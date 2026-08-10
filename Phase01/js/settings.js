// settings.js - Settings page.
// Theme toggle, database export/import/reset and system stats.

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();
  initThemeToggle();
  initDataActions();
  renderStats();
  updateSidebarBadge();
});

function initThemeToggle() {
  const toggle = document.getElementById('settings-theme-toggle');
  const label = document.getElementById('settings-theme-label');

  // Match the current theme (topbar toggle writes this key too)
  const current = localStorage.getItem('theme');
  const isLight = current === 'light';
  toggle.checked = isLight;
  label.textContent = isLight ? 'Light' : 'Dark';

  toggle.addEventListener('change', function () {
    if (toggle.checked) {
      document.body.classList.add('theme-light');
      localStorage.setItem('theme', 'light');
      label.textContent = 'Light';
    } else {
      document.body.classList.remove('theme-light');
      localStorage.setItem('theme', 'dark');
      label.textContent = 'Dark';
    }
  });
}

function initDataActions() {
  // Export
  document.getElementById('settings-export').addEventListener('click', function () {
    const data = {
      exportedAt: todayNowString(),
      products: getProducts(),
      sales: getSales(),
      categories: getCategories(),
      users: getUsers()
    };
    downloadFile('inventoryiq-backup.json', JSON.stringify(data, null, 2), 'application/json');
    showToast('Backup downloaded.', 'success');
  });

  // Import
  const fileInput = document.getElementById('settings-import-file');
  document.getElementById('settings-import').addEventListener('click', function () {
    fileInput.click();
  });
  fileInput.addEventListener('change', function () {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        const errors = importDatabase(data);
        if (errors.length) {
          showToast(errors[0], 'error');
          return;
        }
        renderStats();
        updateSidebarBadge();
        showToast('Database imported.', 'success');
      } catch (err) {
        showToast('Invalid JSON file.', 'error');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  // Reset (with confirmation modal)
  document.querySelectorAll('[data-close="reset-modal"]').forEach(function (el) {
    el.addEventListener('click', function () {
      document.getElementById('reset-modal').classList.remove('show');
    });
  });
  document.getElementById('reset-modal').addEventListener('click', function (e) {
    if (e.target === this) this.classList.remove('show');
  });
  document.getElementById('settings-reset').addEventListener('click', function () {
    document.getElementById('reset-modal').classList.add('show');
  });
  document.getElementById('reset-confirm').addEventListener('click', async function () {
    await resetDatabase();
    document.getElementById('reset-modal').classList.remove('show');
    renderStats();
    updateSidebarBadge();
    showToast('Database reset to demo data.', 'success');
  });
}

function renderStats() {
  const products = getProducts();
  const sales = getSales();
  let units = 0;
  for (const s of sales) units += Number(s.quantity);

  document.getElementById('settings-stats').textContent =
    formatNumber(products.length) + ' products \u00b7 ' +
    formatNumber(sales.length) + ' sales \u00b7 ' +
    formatNumber(units) + ' units \u00b7 ' +
    formatCurrency(products.reduce(function (sum, p) { return sum + Number(p.stock) * Number(p.costPrice); }, 0)) + ' inventory value';
}
