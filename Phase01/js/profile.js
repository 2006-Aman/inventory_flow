// profile.js - Profile page.
// Shows the currently signed-in user (or guest) and a sign out action.

document.addEventListener('DOMContentLoaded', async () => {
  await initializeDatabase();
  renderProfile();
  wireEvents();
  updateSidebarBadge();
});

function renderProfile() {
  const user = getCurrentUser();
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const avatarEl = document.getElementById('profile-avatar');

  if (user) {
    nameEl.textContent = user.name;
    emailEl.textContent = user.email;
    avatarEl.textContent = (user.name || '?').charAt(0).toUpperCase();
    document.getElementById('profile-role').textContent = user.role || 'user';
    document.getElementById('profile-row-name').textContent = user.name;
    document.getElementById('profile-row-email').textContent = user.email;
    document.getElementById('profile-row-role').textContent = user.role || 'user';
  } else {
    nameEl.textContent = 'Guest';
    emailEl.textContent = 'Not signed in';
    avatarEl.textContent = 'G';
    document.getElementById('profile-role').textContent = 'guest';
    document.getElementById('profile-row-name').textContent = '-';
    document.getElementById('profile-row-email').textContent = '-';
    document.getElementById('profile-row-role').textContent = '-';
  }
}

function wireEvents() {
  document.getElementById('profile-logout').addEventListener('click', function () {
    logoutUser();
    showToast('Signed out. Redirecting...', 'success');
    setTimeout(function () { window.location.href = 'login.html'; }, 500);
  });
}
