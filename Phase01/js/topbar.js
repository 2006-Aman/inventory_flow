// topbar.js - Premium global topbar (shared across every page).
// Greeting + page title, search, calendar date, live clock, notification
// bell, theme toggle and a user avatar/name dropdown.

const topbarHTML = `
<header class="global-topbar">
    <div class="topbar-left">
        <button class="icon-btn menu-btn" id="menu-toggle" title="Toggle menu" aria-label="Toggle menu"><i class="ph ph-list"></i></button>
        <div class="page-title">
            <p class="greeting-line"><span id="greeting-text">Good morning</span> &middot; <span id="greeting-name">there</span></p>
            <h1 id="dynamic-page-title">Operations Dashboard</h1>
        </div>
    </div>

    <div class="topbar-right">
        <div class="search-box">
            <i class="ph ph-magnifying-glass"></i>
            <input id="global-search" type="text" placeholder="Search or jump to...">
        </div>

        <div class="date-chip" title="Today's date">
            <i class="ph ph-calendar-dots"></i>
            <span id="current-date">--</span>
        </div>

        <div class="time-display" id="time-display">--:--:--</div>

        <button class="icon-btn theme-toggle" id="theme-toggle" title="Toggle theme"><i class="ph ph-sun"></i></button>

        <button class="icon-btn" id="bell-btn" title="Notifications">
            <i class="ph ph-bell"></i>
            <div class="badge-dot" id="bell-badge" style="display:none;">0</div>
        </button>

        <div class="user-menu" id="user-menu">
            <button class="user-trigger" id="user-trigger" title="Account">
                <div class="avatar-top" id="avatar-top">G</div>
                <span class="user-name" id="user-name">Guest</span>
                <i class="ph ph-caret-down"></i>
            </button>
            <div class="user-dropdown" id="user-dropdown">
                <div class="user-dropdown-head">
                    <strong id="dd-name">Guest</strong>
                    <span id="dd-email">not signed in</span>
                </div>
                <a href="profile.html"><i class="ph ph-user-circle"></i> Profile</a>
                <a href="settings.html"><i class="ph ph-gear"></i> Settings</a>
                <a href="help.html"><i class="ph ph-question"></i> Help</a>
                <button id="user-signout"><i class="ph ph-sign-out"></i> Sign out</button>
            </div>
        </div>
    </div>
</header>
`;

class AppTopbar extends HTMLElement {
    connectedCallback() {
        this.innerHTML = topbarHTML;

        // Use the page's own <title> for the topbar heading
        if (document.title) {
            this.querySelector('#dynamic-page-title').innerText = document.title;
        }

        this.renderGreeting();
        this.renderDate();
        this.startClock();
        this.applySavedTheme();
        this.setupThemeToggle();
        this.setupSearch();
        this.setupUserMenu();
        this.setupMobileNav();
        this.refreshBadges();

        document.addEventListener('DOMContentLoaded', () => {
            this.renderGreeting();
            this.refreshBadges();
        });
    }

    // "Good morning / afternoon / evening" based on the time of day
    renderGreeting() {
        const hour = new Date().getHours();
        const text = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        const greetingText = this.querySelector('#greeting-text');
        const greetingName = this.querySelector('#greeting-name');
        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (greetingText) greetingText.textContent = text;
        if (greetingName) greetingName.textContent = user ? user.name.split(' ')[0] : 'there';
    }

    renderDate() {
        const el = this.querySelector('#current-date');
        if (!el) return;
        const d = new Date();
        const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        el.textContent = d.toLocaleDateString('en-GB', options);
    }

    // Live clock
    startClock() {
        const el = this.querySelector('#time-display');
        const tick = () => {
            const d = new Date();
            el.textContent = d.toLocaleTimeString('en-GB', { hour12: false });
        };
        tick();
        setInterval(tick, 1000);
    }

    // Apply the saved theme (light/dark) stored in LocalStorage
    applySavedTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        document.body.classList.toggle('theme-light', theme === 'light');
        this.syncThemeIcon(theme === 'light');
    }

    setupThemeToggle() {
        const btn = this.querySelector('#theme-toggle');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('theme-light');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            this.syncThemeIcon(isLight);
            if (typeof window.renderDashboard === 'function') {
                window.renderDashboard();
            }
            if (typeof window.renderAll === 'function') {
                window.renderAll();
            }
        });
    }

    syncThemeIcon(isLight) {
        const icon = this.querySelector('#theme-toggle i');
        if (icon) icon.className = isLight ? 'ph ph-moon' : 'ph ph-sun';
    }

    // Topbar search: Enter jumps to the inventory page with the query
    setupSearch() {
        const input = this.querySelector('#global-search');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                window.location.href = 'inventory.html?q=' + encodeURIComponent(input.value.trim());
            }
        });
    }

    // Mobile: hamburger toggles the off-canvas sidebar
    setupMobileNav() {
        const btn = this.querySelector('#menu-toggle');
        if (!btn) return;

        const toggle = (open) => {
            document.body.classList.toggle('sidebar-open', open);
            const icon = btn.querySelector('i');
            if (icon) icon.className = open ? 'ph ph-x' : 'ph ph-list';
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        };

        btn.addEventListener('click', () => toggle(!document.body.classList.contains('sidebar-open')));

        // Close when tapping a nav link or anywhere outside the sidebar
        document.addEventListener('click', (e) => {
            if (!document.body.classList.contains('sidebar-open')) return;
            const insideSidebar = e.target.closest('app-sidebar, .sidebar');
            const insideToggle = e.target.closest('#menu-toggle');
            if (insideSidebar && !e.target.closest('.sidebar-nav a')) return;
            if (!insideSidebar && !insideToggle) toggle(false);
        });
    }

    // User avatar + dropdown menu
    setupUserMenu() {
        const menu = this.querySelector('#user-menu');
        const trigger = this.querySelector('#user-trigger');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
        });

        // Close when clicking anywhere else
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) menu.classList.remove('open');
        });

        const signout = this.querySelector('#user-signout');
        if (signout) {
            signout.addEventListener('click', () => {
                if (typeof logoutUser === 'function') logoutUser();
                window.location.href = 'login.html';
            });
        }
    }

    // Bell badge = products needing reorder; avatar = signed-in user
    refreshBadges() {
        if (typeof initializeDatabase !== 'function') return;
        initializeDatabase().then(() => {
            const badge = this.querySelector('#bell-badge');
            if (badge) {
                const count = countProductsNeedingReorder();
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }

            const user = getCurrentUser();
            const avatar = this.querySelector('#avatar-top');
            const userName = this.querySelector('#user-name');
            const ddName = this.querySelector('#dd-name');
            const ddEmail = this.querySelector('#dd-email');

            if (user) {
                const initial = (user.name || 'U').charAt(0).toUpperCase();
                if (avatar) avatar.textContent = initial;
                if (userName) userName.textContent = user.name.split(' ')[0];
                if (ddName) ddName.textContent = user.name;
                if (ddEmail) ddEmail.textContent = user.email;
            } else {
                if (avatar) avatar.textContent = 'G';
                if (userName) userName.textContent = 'Guest';
                if (ddName) ddName.textContent = 'Guest';
                if (ddEmail) ddEmail.textContent = 'not signed in';
            }
        });
    }
}

customElements.define('app-topbar', AppTopbar);
