// ==========================================
// GLOBALS & UTILITIES
// ==========================================

const app = {
  // Check if user is logged in
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },

  // Get current user info from token payload
  getUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  // Logout function
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth.html';
  },

  // Format date to local readable string
  formatDate: (dateString, includeTime = true) => {
    if (!dateString) return '--';
    const d = new Date(dateString);
    const dateOpts = { year: 'numeric', month: 'short', day: 'numeric' };
    const timeOpts = includeTime ? { hour: '2-digit', minute: '2-digit' } : {};
    return d.toLocaleDateString(undefined, { ...dateOpts, ...timeOpts });
  },

  // Format date/time in IST with AM/PM — used for expiry deadlines & timestamps
  formatIST: (dateString) => {
    if (!dateString) return '--';
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).replace(',', '') + ' IST';
  },

  // Switch between views (dashboard)
  switchTab: (targetId) => {
    // Update nav buttons
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.nav-item[data-target="${targetId}"]`);
    if(btn) btn.classList.add('active');

    // Update views
    document.querySelectorAll('.view-section').forEach(sec => sec.style.display = 'none');
    const view = document.getElementById(`view-${targetId}`);
    if(view) view.style.display = 'block';

    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
      const titles = {
        'overview': 'Dashboard Overview',
        'available-requests': 'Available Deliveries',
        'my-deliveries': 'My Deliveries',
        'my-profile': 'My Profile Settings',
        'my-listings': 'My Food Listings',
        'incoming-requests': 'Incoming Pickup Requests',
        'post-food': 'Post New Surplus Food'
      };
      pageTitle.textContent = titles[targetId] || 'Dashboard';
    }

    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(sidebar && sidebar.classList.contains('open')){
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    }

    // Scroll top
    window.scrollTo(0, 0);
  },

  // Show Toast Notification
  showToast: (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon based on type
    let icon = '';
    if (type === 'success') {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }

    toast.innerHTML = `
      ${icon}
      <span style="flex:1;">${message}</span>
    `;

    container.appendChild(toast);

    // Remove after animation completes (3s total)
    setTimeout(() => {
      if (container.contains(toast)) {
        container.removeChild(toast);
      }
    }, 3000);
  }
};

// ==========================================
// DOMContentLoaded
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Current Date in Topbar
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Mobile Sidebar Toggle
  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (toggleBtn && sidebar && overlay) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    });
  }

  // Nav Item Clicks (Dashboard Tabs)
  document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget.getAttribute('data-target');
      app.switchTab(target);
    });
  });

  // Logout Button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', app.logout);
  }

  // Restrict Dashboard Access
  const isDash = window.location.pathname.includes('dashboard');
  if (isDash && !app.isAuthenticated()) {
    window.location.href = '/auth.html';
  }

  // Set User Info in Sidebar
  if (isDash && app.isAuthenticated()) {
    const user = app.getUser();
    
    // Check correct role for correct dashboard
    const isRestDash = window.location.pathname.includes('restaurant');
    const isNgoDash = window.location.pathname.includes('ngo');
    const isAdminDash = window.location.pathname.includes('admin');
    const isVolDash = window.location.pathname.includes('volunteer');

    if (isRestDash && user.role !== 'restaurant') {
      window.location.href = user.role === 'organization' ? '/ngo-dashboard' : (user.role === 'volunteer' ? '/volunteer-dashboard' : '/admin-dashboard');
    } else if (isNgoDash && user.role !== 'organization') {
      window.location.href = user.role === 'restaurant' ? '/restaurant-dashboard' : (user.role === 'volunteer' ? '/volunteer-dashboard' : '/admin-dashboard');
    } else if (isAdminDash && user.role !== 'administrator') {
      window.location.href = user.role === 'restaurant' ? '/restaurant-dashboard' : (user.role === 'organization' ? '/ngo-dashboard' : '/volunteer-dashboard');
    } else if (isVolDash && user.role !== 'volunteer') {
      window.location.href = user.role === 'restaurant' ? '/restaurant-dashboard' : (user.role === 'organization' ? '/ngo-dashboard' : '/admin-dashboard');
    }

    const nameEl = document.getElementById('userName');
    const loadEl = document.getElementById('userNameLoading');
    const initEl = document.getElementById('userInitial');
    
    if (nameEl && loadEl && initEl && user) {
      loadEl.style.display = 'none';
      nameEl.style.display = 'block';
      nameEl.textContent = user.name;
      initEl.textContent = user.name.charAt(0).toUpperCase();
    }
  }
});
