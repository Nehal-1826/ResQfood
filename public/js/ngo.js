document.addEventListener('DOMContentLoaded', () => {

!app.isAuthenticated() && (window.location.href = '/auth.html');

  /* -------------------------------------------------------------------------- */
  /*                                LOAD OVERVIEW                               */
  /* -------------------------------------------------------------------------- */
  async function loadOverviewStats() {
    try {
      const res = await authFetch('/pickups/stats/organization');
      if (res && res.success) {
        document.getElementById('statTotal').textContent = res.data.total_requests || 0;
        document.getElementById('statAccepted').textContent = res.data.accepted_requests || 0;
        document.getElementById('statCompleted').textContent = res.data.completed_pickups || 0;
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                MY REQUESTS                                 */
  /* -------------------------------------------------------------------------- */
  async function loadMyRequests() {
    const tableBody = document.getElementById('fullRequestsTable');
    const overviewBody = document.getElementById('overviewRequestsTable');
    
    try {
      const res = await authFetch('/requests/my');
      
      const rowsHTML = (res.data || []).map(req => `
        <tr>
          <td><span style="font-family:monospace; color:var(--gray-500)">#${req.food_id.toString().padStart(4, '0')}</span></td>
          <td>
            <div style="font-weight: 600; color:var(--gray-900)">${req.food_name}</div>
            <div style="font-size: 0.8rem; color:var(--gray-500)">Qty: ${req.quantity}</div>
          </td>
          <td>
            <div style="font-weight: 500">${req.restaurant_name}</div>
            <div style="font-size: 0.8rem; color:var(--gray-500)">${req.restaurant_phone}</div>
          </td>
          <td>${app.formatDate(req.request_time, true)}</td>
          <td>
            <span class="badge badge-${req.request_status.toLowerCase()}">${req.request_status}</span>
            ${req.volunteer_name ? `
              <div style="margin-top:0.4rem; font-size:0.75rem; color:var(--blue-700); background:var(--blue-50); padding:0.3rem; border-radius:4px; border:1px solid var(--blue-100);">
                <strong>${req.volunteer_name}</strong><br>
                ${req.volunteer_phone}
              </div>
            ` : ''}
          </td>
          <td>
            <a href="${['accepted', 'volunteer_assigned', 'delivered'].includes(req.request_status) ? '/delivery-tracking.html' : '/request-tracking.html'}?id=${req.request_id}${['accepted', 'volunteer_assigned', 'delivered'].includes(req.request_status) ? '&type=request' : ''}" class="btn btn-outline btn-sm">Track</a>
          </td>
        </tr>
      `).join('');

      tableBody.innerHTML = rowsHTML || '<tr><td colspan="6" class="empty-state">No requests yet. Browse food to start!</td></tr>';
      
      // Overview table (limit to 3)
      const recent = (res.data || []).slice(0, 4);
      overviewBody.innerHTML = recent.map(req => `
        <tr>
          <td><span style="font-weight:500; font-size:0.85rem">${req.food_name}</span></td>
          <td>${req.restaurant_name}</td>
          <td>${app.formatDate(req.request_time, false)}</td>
          <td><span class="badge badge-${req.request_status.toLowerCase()}" style="font-size:0.6rem;padding:0.1rem 0.4rem;">${req.request_status}</span></td>
          <td><a href="${['accepted', 'volunteer_assigned', 'delivered'].includes(req.request_status) ? '/delivery-tracking.html' : '/request-tracking.html'}?id=${req.request_id}${['accepted', 'volunteer_assigned', 'delivered'].includes(req.request_status) ? '&type=request' : ''}" style="color:var(--primary); font-size:0.8rem; font-weight:600">Track &rarr;</a></td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty-state" style="padding:1rem;">No history yet.</td></tr>';

    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--red-500)">Failed to load requests.</td></tr>`;
      overviewBody.innerHTML = `<tr><td colspan="5" class="empty-state" style="color:var(--red-500)">Error loading data.</td></tr>`;
      console.error(err);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             PROFILE SETTINGS                               */
  /* -------------------------------------------------------------------------- */
  async function loadProfileSettings() {
    try {
      const res = await authFetch('/profile/organization');
      if (res && res.success) {
        const form = document.getElementById('profileSettingsForm');
        if (form) {
          form.name.value = res.data.name || '';
          form.email.value = res.data.email || '';
          form.phone.value = res.data.phone || '';
          form.address.value = res.data.address || '';
          form.org_type.value = res.data.org_type || '';
          form.sector.value = res.data.sector || '';
          form.people_count.value = res.data.people_count || '';
        }
        
        // Update sidebar name
        document.getElementById('userName').textContent = res.data.name;
        document.getElementById('userInitial').textContent = res.data.name.charAt(0).toUpperCase();
        
        // Update user data in local storage safely
        const user = app.getUser();
        if (user) {
          user.name = res.data.name;
          localStorage.setItem('user', JSON.stringify(user));
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }

  const profileForm = document.getElementById('profileSettingsForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('saveProfileBtn');
      btn.classList.add('loading');
      btn.disabled = true;

      const payload = {
        name: profileForm.name.value,
        phone: profileForm.phone.value,
        address: profileForm.address.value,
        org_type: profileForm.org_type.value,
        sector: profileForm.sector.value,
        people_count: profileForm.people_count.value
      };

      try {
        const res = await authFetch('/profile/organization', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          app.showToast('Profile updated successfully!', 'success');
          // Update local UI immediately
          document.getElementById('userName').textContent = payload.name;
          document.getElementById('userInitial').textContent = payload.name.charAt(0).toUpperCase();

          const user = app.getUser();
          if (user) {
            user.name = payload.name;
            localStorage.setItem('user', JSON.stringify(user));
          }
        }
      } catch (err) {
        app.showToast(err.message, 'error');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }

  function initDashboard() {
    loadOverviewStats();
    loadMyRequests();
    loadProfileSettings();
  }

  initDashboard();

  /* -------------------------------------------------------------------------- */
  /*                             LIVE UPDATES                                   */
  /* -------------------------------------------------------------------------- */
  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('request_status_update', () => {
      app.showToast('Your food request status was updated!', 'success');
      loadMyRequests();
      loadOverviewStats();
    });
    socket.on('delivery_status_update', () => {
      loadMyRequests();
    });
  }

});
