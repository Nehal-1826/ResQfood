document.addEventListener('DOMContentLoaded', () => {

  // Enforce Admin access only
  if (!app.isAuthenticated()) {
    window.location.href = '/auth.html';
    return;
  }
  
  const user = app.getUser();
  if (!user || user.role !== 'administrator') {
    app.logout();
    return;
  }

  /* -------------------------------------------------------------------------- */
  /*                                LOAD USERS                                  */
  /* -------------------------------------------------------------------------- */
  async function loadUsers() {
    const restTable = document.getElementById('restaurantsTable');
    const orgTable = document.getElementById('organizationsTable');
    const volTable = document.getElementById('volunteersTable');

    try {
      const res = await authFetch('/admin/users');
      
      if (res && res.success) {
        const { restaurants, organizations, volunteers } = res.data;

        // Render Restaurants
        restTable.innerHTML = restaurants.length ? restaurants.map(r => `
          <tr>
            <td><span style="font-family:monospace; color:var(--gray-500)">#${r.id.toString().padStart(4, '0')}</span></td>
            <td style="font-weight: 500">${r.name}</td>
            <td>${r.email}</td>
            <td>${r.phone}</td>
            <td>
              ${r.email_verified
                ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;">✅ Verified</span>'
                : '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;">⏳ Unverified</span>'}
            </td>
            <td>${app.formatDate(r.created_at, false)}</td>
            <td>
              <button class="btn btn-outline btn-sm delete-btn" data-role="restaurant" data-id="${r.id}" style="color: var(--red-500); border-color: var(--red-100);">
                Delete
              </button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="7" class="empty-state">No restaurants registered yet.</td></tr>';

        // Render Organizations
        orgTable.innerHTML = organizations.length ? organizations.map(o => `
          <tr>
            <td><span style="font-family:monospace; color:var(--gray-500)">#${o.id.toString().padStart(4, '0')}</span></td>
            <td style="font-weight: 500">${o.name}</td>
            <td>${o.email}</td>
            <td>${o.phone}</td>
            <td>
              ${o.email_verified
                ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;">✅ Verified</span>'
                : '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;">⏳ Unverified</span>'}
            </td>
            <td>${app.formatDate(o.created_at, false)}</td>
            <td>
              <button class="btn btn-outline btn-sm delete-btn" data-role="organization" data-id="${o.id}" style="color: var(--red-500); border-color: var(--red-100);">
                Delete
              </button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="7" class="empty-state">No organizations registered yet.</td></tr>';

        // Render Volunteers
        volTable.innerHTML = volunteers.length ? volunteers.map(v => `
          <tr>
            <td><span style="font-family:monospace; color:var(--gray-500)">#${v.id.toString().padStart(4, '0')}</span></td>
            <td style="font-weight: 500">${v.name}</td>
            <td>${v.email}</td>
            <td>${v.phone}</td>
            <td>
              ${v.email_verified
                ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;">✅ Verified</span>'
                : '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:0.72rem;font-weight:600;">⏳ Unverified</span>'}
            </td>
            <td>${app.formatDate(v.created_at, false)}</td>
            <td>
              <button class="btn btn-outline btn-sm delete-btn" data-role="volunteer" data-id="${v.id}" style="color: var(--red-500); border-color: var(--red-100);">
                Delete
              </button>
            </td>
          </tr>
        `).join('') : '<tr><td colspan="7" class="empty-state">No volunteers registered yet.</td></tr>';

        // Add event listeners for delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
          btn.onclick = async () => {
            const role = btn.getAttribute('data-role');
            const id = btn.getAttribute('data-id');
            const name = btn.closest('tr').querySelector('td:nth-child(2)').textContent;

            if (confirm(`Are you sure you want to PERMANENTLY remove the ${role} "${name}"? This action cannot be undone.`)) {
              btn.disabled = true;
              btn.textContent = '...';
              try {
                const res = await authFetch(`/admin/users/${role}/${id}`, { method: 'DELETE' });
                if (res && res.success) {
                  app.showToast(res.message, 'success');
                  loadUsers(); // Refresh list
                } else {
                  app.showToast(res.message || 'Deletion failed', 'error');
                  btn.disabled = false;
                  btn.textContent = 'Delete';
                }
              } catch (err) {
                app.showToast(err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Delete';
              }
            }
          };
        });
      }
    } catch (err) {
      restTable.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--red-500)">Failed to load data.</td></tr>`;
      orgTable.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--red-500)">Failed to load data.</td></tr>`;
      volTable.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--red-500)">Failed to load data.</td></tr>`;
      app.showToast(err.message, 'error');
    }
  }

  loadUsers();

});
