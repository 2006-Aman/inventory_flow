/* ==========================================================================
   InventoryIQ - Landing Page Interactive Logic & Simulator Widgets
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {
  // Initialize Database state if storage.js is loaded
  if (typeof initializeDatabase === 'function') {
    await initializeDatabase();
  }

  initSessionAuthButtons();
  initMobileNav();
});

/* --------------------------------------------------------------------------
   1. Session Auth Detection & Dynamic Buttons
   -------------------------------------------------------------------------- */
function initSessionAuthButtons() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const navActions = document.getElementById('lp-nav-actions');
  const heroCTA = document.getElementById('hero-cta-main');

  if (user) {
    // User is logged in! Update landing page CTA buttons to Dashboard
    const firstName = user.name ? user.name.split(' ')[0] : 'User';
    
    if (navActions) {
      navActions.innerHTML = `
        <a href="dashboard.html" class="btn-lp btn-lp-primary" style="padding: 10px 22px; font-size: 14px;">
          <i class="ph ph-squares-four"></i> Open Dashboard (${firstName})
        </a>
      `;
    }

    if (heroCTA) {
      heroCTA.innerHTML = `
        <a href="dashboard.html" class="btn-lp btn-lp-primary" style="font-size: 16px; padding: 16px 36px;">
          <i class="ph ph-squares-four"></i> Launch Dashboard (${firstName})
        </a>
        <a href="inventory.html" class="btn-lp btn-lp-glass" style="font-size: 16px; padding: 16px 32px;">
          <i class="ph ph-cube"></i> Manage Products
        </a>
      `;
    }
  } else {
    // User is NOT logged in: Show Sign In and Sign Up buttons
    if (navActions) {
      navActions.innerHTML = `
        <a href="login.html" class="btn-lp btn-lp-glass" style="padding: 10px 20px; font-size: 14px;">Sign In</a>
        <a href="signup.html" class="btn-lp btn-lp-primary" style="padding: 10px 22px; font-size: 14px;">
          <i class="ph ph-user-plus"></i> Sign Up
        </a>
      `;
    }
  }
}

// Redirect to login if user clicks Launch Dashboard without being signed in
window.handleLaunchDashboard = function () {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  if (user) {
    window.location.href = 'dashboard.html';
  } else {
    if (typeof showToast === 'function') {
      showToast('Please sign in to access the Live Dashboard.', 'info');
    }
    setTimeout(function () {
      window.location.href = 'login.html';
    }, 300);
  }
};



/* --------------------------------------------------------------------------
   7. Mobile Navigation Menu Toggle
   -------------------------------------------------------------------------- */
function initMobileNav() {
  const toggleBtn = document.getElementById('lp-mobile-nav-toggle');
  const linksContainer = document.getElementById('lp-nav-links');

  if (toggleBtn && linksContainer) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', !isExpanded);
      linksContainer.style.display = isExpanded ? 'none' : 'flex';
      linksContainer.style.flexDirection = 'column';
      linksContainer.style.position = 'absolute';
      linksContainer.style.top = '80px';
      linksContainer.style.left = '0';
      linksContainer.style.right = '0';
      linksContainer.style.background = '#040711';
      linksContainer.style.padding = '20px';
      linksContainer.style.borderBottom = '1px solid rgba(56, 189, 248, 0.2)';
    });
  }
}
