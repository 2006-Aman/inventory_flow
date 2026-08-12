// sidebar.js - Premium navigation sidebar (shared across every page).
// Renders the logo, main menu, live reorder badge, the "Forecast Engine"
// card with a circular progress ring and a refresh countdown, and a
// compact signed-in user footer.

// GLOBAL AUTH GUARD
// If the user is not signed in, instantly kick them to the login screen.
if (typeof getCurrentUser === 'function' && !getCurrentUser()) {
    window.location.replace('login.html');
}

const sidebarHTML = `
<aside class="sidebar">
    <div class="sidebar-logo">
        <a href="dashboard.html" class="sidebar-logo-link" style="display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit;">
            <div class="logo-icon" title="InventoryIQ">
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="iq-grad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stop-color="#38bdf8"/>
                            <stop offset="0.5" stop-color="#0ea5e9"/>
                            <stop offset="1" stop-color="#6366f1"/>
                        </linearGradient>
                    </defs>
                    <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#iq-grad)"/>
                    <rect x="2.5" y="2.5" width="35" height="35" rx="10.5" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1"/>
                    <rect x="9.5" y="21" width="4.5" height="8" rx="1.5" fill="#ffffff" fill-opacity="0.5"/>
                    <rect x="17" y="16" width="4.5" height="13" rx="1.5" fill="#ffffff" fill-opacity="0.8"/>
                    <rect x="24.5" y="10" width="4.5" height="19" rx="1.5" fill="#ffffff"/>
                    <path d="M 8.5 25 Q 16 19 24.5 13 T 32 8" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                    <circle cx="32" cy="8" r="2.8" fill="#38bdf8" stroke="#ffffff" stroke-width="1.2"/>
                </svg>
            </div>
            <div class="logo-text">
                <h2>Inventory<span>IQ</span></h2>
                <p>Forecast &middot; Reorder &middot; Grow</p>
            </div>
        </a>
        <button class="icon-btn mobile-close-btn" id="sidebar-close-btn" aria-label="Close menu" style="display: none; margin-left: auto; border: none; font-size: 20px;"><i class="ph ph-x"></i></button>
    </div>

    <nav class="sidebar-nav">
        <a href="dashboard.html" data-name="Dashboard"><i class="ph ph-squares-four"></i><span>Dashboard</span></a>
        <a href="inventory.html" data-name="Inventory"><i class="ph ph-cube"></i><span>Inventory</span></a>
        <a href="add-product.html" data-name="Add Product"><i class="ph ph-package"></i><span>Add Product</span></a>
        <a href="sales.html" data-name="Sales"><i class="ph ph-shopping-cart-simple"></i><span>Sales</span></a>
        <a href="sales-history.html" data-name="Sales History"><i class="ph ph-clock-counter-clockwise"></i><span>Sales History</span></a>
        <a href="reorder.html" data-name="Reorder Alerts"><i class="ph ph-bell"></i><span>Reorder Alerts</span><span class="badge" id="sidebar-reorder-badge" style="display:none;">0</span></a>
        <a href="forecast.html" data-name="Demand Forecast"><i class="ph ph-chart-line"></i><span>Demand Forecast</span></a>
        <a href="analytics.html" data-name="Analytics"><i class="ph ph-chart-bar"></i><span>Analytics</span></a>
        <a href="reports.html" data-name="Reports"><i class="ph ph-file-text"></i><span>Reports</span></a>
        <a href="settings.html" data-name="Settings"><i class="ph ph-sliders-horizontal"></i><span>Settings</span></a>
    </nav>

    <div class="sidebar-footer">
        <div class="engine-card">
            <div class="engine-top">
                <span class="engine-status"><span class="engine-dot"></span> Running</span>
                <a class="engine-link" href="forecast.html">View</a>
            </div>
            <div class="engine-body">
                <div class="engine-ring" id="engine-ring">
                    <div class="engine-ring-inner"><span id="engine-ring-value">0%</span></div>
                </div>
                <div class="engine-info">
                    <h4>Forecast Engine</h4>
                    <p>Moving Average &middot; 7d</p>
                    <p class="engine-next">Next refresh in <span id="engine-countdown">--:--:--</span></p>
                </div>
            </div>
        </div>
    </div>
</aside>
`;

class AppSidebar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = sidebarHTML;
        this.updateActiveLink();
        this.refreshBadge();
        this.initEngineCard();
        this.setupMobileClose();
        document.addEventListener('DOMContentLoaded', () => this.refreshBadge());
    }

    setupMobileClose() {
        const closeBtn = this.querySelector('#sidebar-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.classList.remove('sidebar-open');
                const topbarBtn = document.querySelector('#menu-toggle');
                if (topbarBtn) {
                    const icon = topbarBtn.querySelector('i');
                    if (icon) icon.className = 'ph ph-list';
                    topbarBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }
    }

    // Highlight the link matching the current page
    updateActiveLink(path) {
        const currentPath = path || window.location.pathname.split('/').pop() || 'dashboard.html';
        const links = this.querySelectorAll('.sidebar-nav a');
        links.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('active');
            }
        });
    }

    // Keep the reorder notification badge in sync with LocalStorage
    refreshBadge() {
        const badge = this.querySelector('#sidebar-reorder-badge');
        if (!badge) return;
        if (typeof initializeDatabase === 'function') {
            initializeDatabase().then(() => {
                const count = countProductsNeedingReorder();
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            });
        }
    }

    // Forecast Engine card: circular progress = stock health, countdown to
    // midnight when the moving average forecast is recalculated.
    initEngineCard() {
        if (typeof initializeDatabase !== 'function') return;
        initializeDatabase().then(() => {
            const ring = this.querySelector('#engine-ring');
            const ringValue = this.querySelector('#engine-ring-value');
            if (ring && ringValue) {
                const products = getProducts();
                const health = products.length
                    ? Math.round((products.filter(p => p.status === 'In Stock').length / products.length) * 100)
                    : 0;
                ring.style.setProperty('--pct', (health * 3.6) + 'deg');
                ringValue.textContent = health + '%';
            }
            this.startCountdown();
        });
    }

    // Counts down to the next forecast refresh (midnight).
    startCountdown() {
        const el = this.querySelector('#engine-countdown');
        if (!el) return;
        const tick = () => {
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
            let diff = Math.floor((midnight - now) / 1000);
            if (diff < 0) diff = 0;
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            el.textContent = h + ':' + m + ':' + s;
        };
        tick();
        setInterval(tick, 1000);
    }
}

customElements.define('app-sidebar', AppSidebar);
