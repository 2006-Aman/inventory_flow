/* ==========================================================================
   InventoryIQ - Landing Page Interactive Logic & Simulator Widgets
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {
  // Initialize Database state if storage.js is loaded
  if (typeof initializeDatabase === 'function') {
    await initializeDatabase();
  }

  initSessionAuthButtons();
  initROICalculator();
  initForecastSandbox();
  initFAQAccordion();
  initStatsCounter();
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
   2. Quick One-Click Demo Login
   -------------------------------------------------------------------------- */
window.quickDemoLogin = function (role) {
  if (typeof getUsers !== 'function' || typeof setCurrentUser !== 'function') {
    window.location.href = 'login.html';
    return;
  }

  const users = getUsers();
  let user = null;

  if (role === 'admin') {
    user = users.find(u => u.role === 'admin' || u.email.includes('admin')) || users[0];
  } else if (role === 'manager') {
    user = users.find(u => u.role === 'manager' || u.email.includes('manager')) || users[1] || users[0];
  } else {
    user = users[0];
  }

  if (user) {
    setCurrentUser(user);
    if (typeof showToast === 'function') {
      showToast(`Welcome! Logged in as ${user.name}`, 'success');
    }
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 300);
  } else {
    window.location.href = 'login.html';
  }
};

/* --------------------------------------------------------------------------
   3. Interactive ROI & Savings Calculator Widget
   -------------------------------------------------------------------------- */
function initROICalculator() {
  const slider = document.getElementById('calc-spend-slider');
  const spendValDisplay = document.getElementById('calc-spend-val');
  const freqSelect = document.getElementById('calc-freq-select');
  const savingsDisplay = document.getElementById('calc-res-savings');
  const hoursDisplay = document.getElementById('calc-res-hours');
  const stockoutDisplay = document.getElementById('calc-res-stockout');

  if (!slider || !spendValDisplay || !savingsDisplay) return;

  function calculate() {
    const monthlySpend = parseInt(slider.value, 10) || 15000;
    const freqMultiplier = parseFloat(freqSelect ? freqSelect.value : 1.5);

    // Format formatted spend
    spendValDisplay.textContent = '$' + monthlySpend.toLocaleString();

    // Algorithm: estimated 12% to 22% annual inventory waste & carrying cost reduction
    const annualSpend = monthlySpend * 12;
    const estimatedSavings = Math.round(annualSpend * (0.14 * freqMultiplier));
    const estimatedHours = Math.round(8 * freqMultiplier * (monthlySpend / 10000 + 1));
    const stockoutReduction = Math.min(96, Math.round(75 + freqMultiplier * 10));

    // Smooth count update
    animateValue(savingsDisplay, getNumericalValue(savingsDisplay.textContent), estimatedSavings, '$');
    if (hoursDisplay) hoursDisplay.textContent = estimatedHours + ' hrs/wk';
    if (stockoutDisplay) stockoutDisplay.textContent = stockoutReduction + '%';
  }

  slider.addEventListener('input', calculate);
  if (freqSelect) freqSelect.addEventListener('change', calculate);

  // Initial run
  calculate();
}

function getNumericalValue(str) {
  return parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
}

function animateValue(obj, start, end, prefix = '') {
  let startTimestamp = null;
  const duration = 600;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const current = Math.floor(progress * (end - start) + start);
    obj.textContent = prefix + current.toLocaleString();
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

/* --------------------------------------------------------------------------
   4. Interactive Forecast Engine Sandbox Widget
   -------------------------------------------------------------------------- */
function initForecastSandbox() {
  const tabBtns = document.querySelectorAll('.algo-tab-btn');
  const chartPath = document.getElementById('sandbox-chart-path');
  const areaPath = document.getElementById('sandbox-area-path');
  const algoTitle = document.getElementById('sandbox-algo-title');
  const algoDesc = document.getElementById('sandbox-algo-desc');

  if (!tabBtns.length || !chartPath) return;

  const curves = {
    ma: {
      title: '7-Day Moving Average Algorithm',
      desc: 'Smooths out short-term demand fluctuations using trailing 7-day average sales.',
      path: 'M 20 180 Q 90 140 160 160 T 300 120 T 440 90 T 580 40',
      area: 'M 20 180 Q 90 140 160 160 T 300 120 T 440 90 T 580 40 L 580 240 L 20 240 Z',
      stroke: '#38bdf8'
    },
    exp: {
      title: 'Exponential Smoothing Engine',
      desc: 'Applies exponentially decreasing weights to older sales data for high sensitivity.',
      path: 'M 20 190 Q 90 120 160 170 T 300 90 T 440 130 T 580 30',
      area: 'M 20 190 Q 90 120 160 170 T 300 90 T 440 130 T 580 30 L 580 240 L 20 240 Z',
      stroke: '#34d399'
    },
    lr: {
      title: 'Linear Trend Regression',
      desc: 'Fits a linear mathematical trend line to project long-term demand trajectory.',
      path: 'M 20 200 L 160 160 L 300 120 L 440 80 L 580 40',
      area: 'M 20 200 L 160 160 L 300 120 L 440 80 L 580 40 L 580 240 L 20 240 Z',
      stroke: '#fbbf24'
    }
  };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const algo = btn.getAttribute('data-algo');
      const data = curves[algo];
      if (data) {
        chartPath.setAttribute('d', data.path);
        chartPath.setAttribute('stroke', data.stroke);
        if (areaPath) areaPath.setAttribute('d', data.area);
        if (algoTitle) algoTitle.textContent = data.title;
        if (algoDesc) algoDesc.textContent = data.desc;
      }
    });
  });
}

/* --------------------------------------------------------------------------
   5. Interactive FAQ Accordion
   -------------------------------------------------------------------------- */
function initFAQAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

/* --------------------------------------------------------------------------
   6. Animated Scroll Stats
   -------------------------------------------------------------------------- */
function initStatsCounter() {
  const statElements = document.querySelectorAll('.stat-number[data-target]');
  if (!statElements.length) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.getAttribute('data-target'));
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';
        
        let start = 0;
        const duration = 1200;
        const startTime = performance.now();

        function update(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const val = (progress * target).toFixed(target % 1 === 0 ? 0 : 1);
          el.textContent = `${prefix}${val}${suffix}`;
          if (progress < 1) {
            requestAnimationFrame(update);
          }
        }
        requestAnimationFrame(update);
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  statElements.forEach(el => observer.observe(el));
}

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
