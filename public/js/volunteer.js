document.addEventListener('DOMContentLoaded', () => {

  // Auto redirect if not logged in or wrong role
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  if (!token || !userStr) {
    window.location.href = '/auth.html';
    return;
  }
  
  const user = JSON.parse(userStr);
  if (user.role !== 'volunteer') {
    app.logout();
    return;
  }

  // Set Profile UI
  document.getElementById('userNameLoading').style.display = 'none';
  document.getElementById('userName').style.display = 'block';
  document.getElementById('userName').textContent = user.full_name || user.name;
  document.getElementById('userInitial').textContent = (user.full_name || user.name).charAt(0).toUpperCase();

  // Navigation Logic
  const navItems = document.querySelectorAll('.sidebar__nav .nav-item');
  const viewSections = document.querySelectorAll('.view-section');

  // Override app.switchTab globally so HTML onclick works
  app.switchTab = (targetId) => {
    navItems.forEach(n => {
      if (n.getAttribute('data-target') === targetId) n.classList.add('active');
      else n.classList.remove('active');
    });

    viewSections.forEach(v => {
      v.style.display = v.id === `view-${targetId}` ? 'block' : 'none';
    });

    // Handle mobile sidebar auto-close
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar.classList.contains('active')) {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    }

    // Refresh data on tab switch
    if (targetId === 'overview') {
      loadOverview();
    } else if (targetId === 'available-requests') {
      loadAvailableRequests();
    } else if (targetId === 'my-deliveries') {
      loadMyDeliveries();
    } else if (targetId === 'my-profile') {
      loadMyProfile();
    }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      app.switchTab(item.getAttribute('data-target'));
    });
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => app.logout());


  /* -------------------------------------------------------------------------- */
  /*                             DATA FETCHING                                  */
  /* -------------------------------------------------------------------------- */

  async function loadOverview() {
    try {
      // 1. Check for available requests (only care about count here)
      const availRes = await authFetch('/deliveries/volunteer/available');
      const available = availRes.data || [];
      
      document.getElementById('statPending').textContent = available.length;
      if (available.length > 0) {
        document.getElementById('navReqBadge').style.display = 'inline-flex';
        document.getElementById('navReqBadge').textContent = available.length;
      } else {
        document.getElementById('navReqBadge').style.display = 'none';
      }

      // Render a few requests in overview
      const overviewContainer = document.getElementById('overviewRequestsList');
      if (overviewContainer) {
        overviewContainer.innerHTML = '';
        if (available.length === 0) {
           overviewContainer.innerHTML = '<div class="empty-state">No available deliveries at the moment.</div>';
        } else {
           available.slice(0, 3).forEach(req => renderAvailableCard(req, overviewContainer));
        }
      }

      // 2. Fetch volunteer's own stats
      const statsRes = await authFetch(`/deliveries/volunteer/stats?volunteer_id=${user.id}`);
      if (statsRes.success) {
        const stats = statsRes.data;
        document.getElementById('statCompleted').textContent = stats.completed || 0;
        document.getElementById('statActive').textContent = stats.active || 0;
        // If there's a total stat, update it too
        const statTotal = document.getElementById('statTotal');
        if (statTotal) statTotal.textContent = stats.total || 0;
      }

    } catch (error) {
       console.error("Error loading overview:", error);
       app.showToast('Failed to load dashboard data', 'error');
    }
  }

  async function loadAvailableRequests() {
    const listContainer = document.getElementById('fullRequestsList');
    listContainer.innerHTML = '<div style="text-align:center; padding: 2rem;"><div class="spinner" style="border-top-color:var(--primary); margin:0 auto; display:block;"></div></div>';
    
    try {
      const res = await authFetch('/deliveries/volunteer/available');
      if (res.success) {
        listContainer.innerHTML = '';
        const requests = res.data || [];
        
        if (requests.length === 0) {
          listContainer.innerHTML = `
            <div class="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--gray-300); margin-bottom:1rem"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              <p>No delivery requests available right now.</p>
              <p style="font-size:0.875rem; color:var(--gray-400); margin-top:0.5rem">Check back later when restaurants post new surplus food.</p>
            </div>
          `;
          return;
        }

        requests.forEach(req => renderAvailableCard(req, listContainer));
      }
    } catch (error) {
      listContainer.innerHTML = '<div class="empty-state">Error loading requests.</div>';
    }
  }

  async function loadMyDeliveries(statsOnly = false) {
    if (statsOnly) return;

    const listContainer = document.getElementById('myDeliveriesList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="text-align:center; padding: 2rem;"><div class="spinner" style="border-top-color:var(--primary); margin:0 auto; display:block;"></div></div>';
    
    try {
      const res = await authFetch(`/deliveries/volunteer/my-deliveries?volunteer_id=${user.id}`);
      if (res.success) {
        listContainer.innerHTML = '';
        const deliveries = res.data || [];
        
        if (deliveries.length === 0) {
          listContainer.innerHTML = `
            <div class="empty-state">
              <p>You haven't accepted any deliveries yet.</p>
            </div>
          `;
          return;
        }

        deliveries.forEach(del => renderDeliveryCard(del, listContainer));
      }
    } catch (error) {
       console.error("Error loading my deliveries:", error);
       listContainer.innerHTML = '<div class="empty-state">Error loading your deliveries.</div>';
    }
  }

  function renderDeliveryCard(del, container) {
    const card = document.createElement('div');
    card.style.cssText = 'border: 1px solid var(--gray-200); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;';
    
    let statusClass = 'badge-info';
    if (del.delivery_status === 'delivered') statusClass = 'badge-success';
    if (del.delivery_status === 'rejected') statusClass = 'badge-danger';
    if (del.delivery_status === 'volunteer_assigned') statusClass = 'badge-warning';

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
        <div>
          <h5 style="margin:0 0 0.25rem 0; font-size:1.1rem">${del.food_name || 'Food Delivery'}</h5>
          <p style="margin:0; font-size:0.875rem; color:var(--gray-500)">Quantity: <strong>${del.quantity || 'N/A'}</strong></p>
        </div>
        <span class="badge ${statusClass}">${del.delivery_status.replace('_', ' ')}</span>
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem; background:var(--gray-50); padding:1rem; border-radius:6px;">
        <div>
          <strong style="display:block; font-size:0.75rem; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.25rem">Pickup</strong>
          <span style="font-weight:600; font-size:0.9rem">${del.restaurant_name}</span>
        </div>
        <div>
          <strong style="display:block; font-size:0.75rem; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.25rem">Dropoff</strong>
          <span style="font-weight:600; font-size:0.9rem">${del.ngo_name}</span>
        </div>
      </div>
      
      <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <button class="btn btn-outline" onclick="window.location.href='/volunteer-tracking.html?id=${del.delivery_id}'">View Tracking</button>
      </div>
    `;
    container.appendChild(card);
  }

  function renderAvailableCard(req, container) {
    const card = document.createElement('div');
    card.style.cssText = 'border: 1px solid var(--gray-200); border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
        <div>
          <h5 style="margin:0 0 0.25rem 0; font-size:1.1rem">${req.food_name}</h5>
          <p style="margin:0; font-size:0.875rem; color:var(--gray-500)">Quantity: <strong>${req.quantity}</strong> | Deadline: <strong>${app.formatDate(req.expiry_time, true)}</strong></p>
        </div>
        <span class="badge badge-warning">Available</span>
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1.5rem; background:var(--gray-50); padding:1rem; border-radius:6px;">
        <div>
          <strong style="display:block; font-size:0.75rem; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.25rem">Pickup (Restaurant)</strong>
          <span style="font-weight:600; font-size:0.9rem">${req.restaurant_name}</span>
          <p style="margin:0; font-size:0.8rem; color:var(--gray-600)">${req.restaurant_address}</p>
        </div>
        <div>
          <strong style="display:block; font-size:0.75rem; color:var(--gray-500); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.25rem">Dropoff (Organization)</strong>
          <span style="font-weight:600; font-size:0.9rem">${req.ngo_name}</span>
          <p style="margin:0; font-size:0.8rem; color:var(--gray-600)">${req.ngo_address}</p>
        </div>
      </div>
      
      <div style="display:flex; justify-content:flex-end;">
        <button class="btn btn-primary" onclick="acceptDelivery(${req.request_id})">Accept Delivery</button>
      </div>
    `;
    container.appendChild(card);
  }

  // Bind to window so inline onclick works
  window.acceptDelivery = async (requestId) => {
    if (!confirm('Are you sure you want to accept this delivery? You will be responsible for completing it.')) return;
    
    try {
      const res = await authFetch('/deliveries/start', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId, volunteer_id: user.id })
      });
      
      if (res.success) {
        app.showToast('Delivery accepted! Redirecting to tracking...', 'success');
        setTimeout(() => {
          window.location.href = `/volunteer-tracking.html?id=${res.delivery_id}`;
        }, 1500);
      }
    } catch (err) {
      if (err.message.includes('another volunteer')) {
        app.showToast('Sorry, this request was just accepted by another volunteer.', 'error');
        loadAvailableRequests(); // Refresh
      } else {
        app.showToast(err.message, 'error');
      }
    }
  };

  // --------------------------------------------------------------------------
  // PROFILE MANAGEMENT
  // --------------------------------------------------------------------------
  async function loadMyProfile() {
    const loading = document.getElementById('profileLoading');
    const form = document.getElementById('profileForm');
    
    loading.style.display = 'block';
    form.style.display = 'none';

    try {
      const res = await authFetch('/profile/volunteer');
      if (res.success && res.data) {
        const d = res.data;
        form.name.value = d.name || '';
        form.email.value = d.email || '';
        form.phone.value = d.phone || '';
        form.age.value = d.age || '';
        form.gender.value = d.gender || '';
        form.vehicle_type.value = d.vehicle_type || '';
        form.vehicle_number.value = d.vehicle_number || '';
        form.government_id.value = d.government_id || '';
        form.address.value = d.address || '';
        form.working_hours_start.value = d.working_hours_start || '';
        form.working_hours_end.value = d.working_hours_end || '';
        form.emergency_contact.value = d.emergency_contact || '';
        
        loading.style.display = 'none';
        form.style.display = 'block';
      }
    } catch (err) {
      loading.innerHTML = '<div class="empty-state">Failed to load profile data.</div>';
      app.showToast('Could not load your profile.', 'error');
    }
  }

  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveProfileBtn');
    btn.classList.add('loading');
    btn.disabled = true;

    const payload = {
      name: e.target.name.value,
      phone: e.target.phone.value,
      age: e.target.age.value,
      gender: e.target.gender.value,
      vehicle_type: e.target.vehicle_type.value,
      vehicle_number: e.target.vehicle_number.value,
      government_id: e.target.government_id.value,
      address: e.target.address.value,
      working_hours_start: e.target.working_hours_start.value,
      working_hours_end: e.target.working_hours_end.value,
      emergency_contact: e.target.emergency_contact.value
    };

    try {
      const res = await authFetch('/profile/volunteer', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (res.success) {
        app.showToast('Profile updated successfully!', 'success');
        // Update sidebar name
        document.getElementById('userName').textContent = payload.name;
        document.getElementById('userInitial').textContent = payload.name.charAt(0).toUpperCase();
        user.full_name = payload.name;
        localStorage.setItem('user', JSON.stringify(user));
      }
    } catch (err) {
      app.showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });

  // Initial load
  loadOverview();

  /* -------------------------------------------------------------------------- */
  /*                             LIVE UPDATES                                   */
  /* -------------------------------------------------------------------------- */
  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('new_delivery_available', () => {
      app.showToast('New delivery available!', 'success');
      loadOverview();
      loadAvailableRequests();
    });
    socket.on('delivery_status_update', () => {
      loadOverview();
      loadAvailableRequests();
    });
  }

});
