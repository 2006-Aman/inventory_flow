// auth.js - Login / signup logic.
// Uses the users collection in LocalStorage and the currentUser session.
// - login page: initLoginPage()
// - signup page: initSignupPage()

async function initLoginPage() {
  await initializeDatabase();

  // Already signed in? Go straight to the app.
  if (getCurrentUser()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('login-form');
  const banner = document.getElementById('auth-error');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    banner.classList.remove('show');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const message = validateLoginInput({ email: email, password: password });
    if (message) {
      showBanner(banner, message);
      return;
    }

    const user = getUsers().find(function (u) {
      return String(u.email).toLowerCase() === email.toLowerCase() && String(u.password) === password;
    });

    if (!user) {
      showBanner(banner, 'Invalid email or password.');
      return;
    }

    setCurrentUser(user);
    showToast('Welcome back, ' + user.name + '!', 'success');
    setTimeout(function () { window.location.href = 'dashboard.html'; }, 400);
  });
}

async function initSignupPage() {
  await initializeDatabase();

  if (getCurrentUser()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('signup-form');
  const banner = document.getElementById('auth-error');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    banner.classList.remove('show');

    const data = {
      name: document.getElementById('signup-name').value.trim(),
      email: document.getElementById('signup-email').value.trim(),
      password: document.getElementById('signup-password').value,
      confirm: document.getElementById('signup-confirm').value
    };

    const errors = validateSignupInput(data);
    if (Object.keys(errors).length) {
      const first = Object.keys(errors)[0];
      showBanner(banner, errors[first]);
      return;
    }

    const users = getUsers();
    const user = {
      id: 'USR-' + generateId(),
      name: data.name,
      email: data.email.toLowerCase(),
      password: data.password,
      role: 'user'
    };
    users.push(user);
    saveUsers(users);

    setCurrentUser(user);
    showToast('Account created. Welcome, ' + user.name + '!', 'success');
    setTimeout(function () { window.location.href = 'dashboard.html'; }, 400);
  });
}

function showBanner(banner, message) {
  banner.textContent = message;
  banner.classList.add('show');
}

// ── Eye toggle: show / hide password ──
function initPasswordToggles() {
  document.querySelectorAll('.eye-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetId = btn.getAttribute('data-target');
      var input = document.getElementById(targetId);
      if (!input) return;

      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      var icon = btn.querySelector('i');
      icon.className = isPassword ? 'ph ph-eye-slash' : 'ph ph-eye';

      btn.classList.toggle('active', isPassword);

      // bounce animation
      icon.style.transform = 'scale(0.7)';
      setTimeout(function () { icon.style.transform = ''; }, 150);
    });
  });
}

// ── Live password requirements checker (signup only) ──
function initPasswordRequirements() {
  var passwordInput = document.getElementById('signup-password');
  var reqList = document.getElementById('pw-requirements');
  if (!passwordInput || !reqList) return;

  var rules = [
    { id: 'req-length',  test: function (v) { return v.length >= 8; } },
    { id: 'req-upper',   test: function (v) { return /[A-Z]/.test(v); } },
    { id: 'req-number',  test: function (v) { return /[0-9]/.test(v); } },
    { id: 'req-special', test: function (v) { return /[^A-Za-z0-9]/.test(v); } }
  ];

  passwordInput.addEventListener('input', function () {
    var val = passwordInput.value;
    rules.forEach(function (rule) {
      var li = document.getElementById(rule.id);
      if (!li) return;
      var met = rule.test(val);
      li.classList.toggle('met', met);
      var icon = li.querySelector('i');
      if (icon) {
        icon.className = met ? 'ph ph-check-circle' : 'ph ph-circle';
      }
    });
  });
}
