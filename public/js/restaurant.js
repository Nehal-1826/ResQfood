document.addEventListener('DOMContentLoaded', () => {

!app.isAuthenticated() && (window.location.href = '/auth.html');

  /* -------------------------------------------------------------------------- */
  /*                                LOAD OVERVIEW                               */
  /* -------------------------------------------------------------------------- */
  async function loadOverviewStats() {
    try {
      const res = await authFetch('/pickups/stats/restaurant');
      if (res && res.success) {
        document.getElementById('statActive').textContent = res.data.active_listings || 0;
        document.getElementById('statPending').textContent = res.data.pending_requests || 0;
        document.getElementById('statCompleted').textContent = res.data.completed_donations || 0;
        
        // Update nav badge
        const badge = document.getElementById('navReqBadge');
        if (res.data.pending_requests > 0) {
          badge.textContent = res.data.pending_requests;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                PRICE HELPER                                */
  /* -------------------------------------------------------------------------- */
  function formatPrice(food) {
    if (food.original_price == null && food.selling_price == null) return '<span style="color:var(--gray-400)">--</span>';
    const orig = food.original_price != null ? parseFloat(food.original_price) : null;
    const sell = food.selling_price != null ? parseFloat(food.selling_price) : null;
    if (sell === 0) {
      return `<span style="color:var(--green-600);font-weight:700">Free</span>` + (orig ? ` <span style="text-decoration:line-through;color:var(--gray-400);font-size:0.75rem">₹${orig.toFixed(0)}/serving</span>` : '');
    }
    let html = '';
    if (sell != null) html += `<span style="color:var(--green-700);font-weight:700">₹${sell.toFixed(0)}/serving</span>`;
    if (orig != null) html += ` <span style="text-decoration:line-through;color:var(--gray-400);font-size:0.75rem">₹${orig.toFixed(0)}</span>`;
    return html || '<span style="color:var(--gray-400)">--</span>';
  }

  /* -------------------------------------------------------------------------- */
  /*                                MY LISTINGS                                 */
  /* -------------------------------------------------------------------------- */
  async function loadMyListings() {
    const tableBody = document.getElementById('fullListingsTable');
    const overviewBody = document.getElementById('overviewListingsTable');
    
    try {
      const res = await authFetch('/foods/my');
      
      const rowsHTML = (res.data || []).map(food => `
        <tr>
          <td>
            <div class="food-thumb-row">
              ${food.image_url 
                ? `<img src="${food.image_url}" class="food-thumb" alt="${food.food_name}">` 
                : `<div class="food-thumb-placeholder">${food.food_name.charAt(0)}</div>`}
              <span style="font-weight: 500">${food.food_name}</span>
            </div>
          </td>
          <td>${food.quantity}</td>
          <td>${formatPrice(food)}</td>
          <td>
            <div style="font-size: 0.75rem; color:var(--gray-500)">Exp: <span style="font-weight:600;color:var(--gray-800)">${food.actual_expiry_time ? app.formatIST(food.actual_expiry_time) : '--'}</span></div>
            <div style="font-size: 0.75rem; color:var(--gray-500)">Pick: <span style="font-weight:600;color:var(--gray-800)">${app.formatIST(food.expiry_time)}</span></div>
            ${new Date(food.expiry_time) < new Date() ? '<span style="color:var(--red-500);font-size:0.7rem;">Expired</span>' : ''}
          </td>
          <td>
            ${food.pending_requests > 0 
              ? `<span style="background:var(--orange-100);color:var(--orange-600);padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:600;">${food.pending_requests} pending</span>` 
              : `<span style="color:var(--gray-400)">None</span>`}
          </td>
          <td><span class="badge badge-${food.status.toLowerCase()}">${food.status}</span></td>
          <td>
            ${food.status === 'available' 
              ? `<button class="btn btn-outline btn-sm delete-btn" data-id="${food.food_id}">Delete</button>` 
              : `<span class="form-hint">Locked</span>`}
          </td>
        </tr>
      `).join('');

      tableBody.innerHTML = rowsHTML || '<tr><td colspan="7" class="empty-state">No listings found. Post some surplus food!</td></tr>';
      
      // Overview table (limit to 3)
      const recent = (res.data || []).slice(0, 3);
      overviewBody.innerHTML = recent.map(food => `
        <tr>
          <td>
            <div class="food-thumb-row" style="gap:0.5rem;">
              <div class="food-thumb-placeholder" style="width:28px;height:28px;font-size:0.9rem;">${food.food_name.charAt(0)}</div>
              <span style="font-size:0.85rem">${food.food_name}</span>
            </div>
          </td>
          <td>${food.quantity}</td>
          <td>
            <div style="font-size: 0.7rem; color:var(--gray-500)">Exp: <span style="font-weight:600;color:var(--gray-800)">${food.actual_expiry_time ? app.formatIST(food.actual_expiry_time) : '--'}</span></div>
            <div style="font-size: 0.7rem; color:var(--gray-500)">Pick: <span style="font-weight:600;color:var(--gray-800)">${app.formatIST(food.expiry_time)}</span></div>
          </td>
          <td><span class="badge badge-${food.status.toLowerCase()}" style="font-size:0.6rem;padding:0.1rem 0.4rem;">${food.status}</span></td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="empty-state" style="padding:1rem;">No recent listings.</td></tr>';

      // Attach delete listeners
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if(confirm('Are you sure you want to delete this listing?')) {
            const id = e.target.getAttribute('data-id');
            await authFetch(`/foods/${id}`, { method: 'DELETE' });
            app.showToast('Listing deleted successfully');
            initDashboard();
          }
        });
      });

    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--red-500)">Failed to load listings.</td></tr>`;
      overviewBody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color:var(--red-500)">Error loading data.</td></tr>`;
      console.error(err);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                INCOMING REQ                                */
  /* -------------------------------------------------------------------------- */
  async function loadIncomingRequests() {
    const listBody = document.getElementById('fullRequestsList');
    const overviewBody = document.getElementById('overviewRequestsList');
    
    try {
      const res = await authFetch('/requests/incoming');
      
      const reqsHTML = (res.data || []).map(req => `
        <div class="request-item">
          <div class="request-org-avatar">${req.organization_name.charAt(0)}</div>
          <div class="request-info">
            <h5>${req.organization_name}</h5>
            <p>Requested: <span style="font-weight:600">${req.food_name}</span> (${req.quantity})</p>
            <div class="request-meta">
              <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> ${req.organization_phone}</span>
              &bull;
              <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> ${req.organization_email}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--gray-400); margin-top:0.4rem;">Requested on: ${app.formatDate(req.request_time, true)}</div>
            ${req.volunteer_name ? `
              <div style="margin-top:0.8rem; background:var(--blue-50); border:1px solid var(--blue-100); padding:0.75rem; border-radius:6px; font-size:0.85rem;">
                <Strong style="color:var(--blue-800); display:block; margin-bottom:0.25rem;">Assigned Volunteer</strong>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  ${req.profile_photo_path ? `<img src="${req.profile_photo_path}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">` : `<div style="width:32px;height:32px;border-radius:50%;background:var(--blue-200);display:flex;align-items:center;justify-content:center;color:var(--blue-700);font-weight:bold;">${req.volunteer_name.charAt(0)}</div>`}
                  <div>
                    <div style="font-weight:600; color:var(--gray-800);">${req.volunteer_name} (${req.volunteer_phone})</div>
                    <div style="color:var(--gray-600); font-size:0.75rem;">${req.vehicle_type} - ${req.vehicle_number}</div>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>
          <div class="request-actions">
            ${req.request_status === 'pending' ? `
              <button class="btn btn-success btn-sm handle-req-btn" data-id="${req.request_id}" data-action="accepted">Accept</button>
              <button class="btn btn-outline btn-sm handle-req-btn" data-id="${req.request_id}" data-action="rejected" style="color:var(--gray-500);border-color:var(--gray-300)">Reject</button>
            ` : `
              <span class="badge badge-${req.request_status.toLowerCase()}">${req.request_status}</span>
              ${['accepted', 'volunteer_assigned', 'delivered'].includes(req.request_status) ? `<a href="/delivery-tracking.html?id=${req.request_id}&type=request" class="btn btn-outline btn-sm" style="margin-left: 0.5rem">Track Delivery</a>` : ''}
            `}
          </div>
        </div>
      `).join('');

      listBody.innerHTML = reqsHTML || '<div class="empty-state">No incoming requests.</div>';
      
      // Overview (Pending Only, limit 3)
      const pending = (res.data || []).filter(r => r.request_status === 'pending').slice(0, 3);
      overviewBody.innerHTML = pending.length ? pending.map(req => `
        <div class="request-item" style="padding:0.75rem;">
          <div class="request-info">
            <h5 style="font-size:0.85rem">${req.organization_name}</h5>
            <p style="font-size:0.75rem">${req.food_name}</p>
          </div>
          <div class="request-actions">
            <button class="btn btn-success handle-req-btn" data-id="${req.request_id}" data-action="accepted" style="padding:0.2rem 0.5rem;font-size:0.75rem">Accept</button>
          </div>
        </div>
      `).join('') : '<div class="empty-state" style="padding:1rem;">You are all caught up!</div>';

      // Attach Handlers
      document.querySelectorAll('.handle-req-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.target.getAttribute('data-id');
          const action = e.target.getAttribute('data-action');
          
          try {
            await authFetch(`/requests/${id}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: action })
            });
            app.showToast(`Request ${action.toLowerCase()}!`, 'success');
            initDashboard();
          } catch(err) {
            app.showToast(err.message, 'error');
          }
        });
      });

    } catch (err) {
      listBody.innerHTML = `<div class="empty-state" style="color:var(--red-500)">Failed to load requests.</div>`;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          PRICE LIVE VALIDATION                             */
  /* -------------------------------------------------------------------------- */
  const origPriceInput = document.getElementById('originalPriceInput');
  const sellPriceInput = document.getElementById('sellingPriceInput');
  const priceHint = document.getElementById('priceHint');

  if (origPriceInput && sellPriceInput) {
    origPriceInput.addEventListener('input', () => {
      const orig = parseFloat(origPriceInput.value);
      if (!isNaN(orig) && orig >= 0) {
        const maxSell = (orig * 0.5).toFixed(2);
        sellPriceInput.max = maxSell;
        priceHint.innerHTML = `Allowed range: <strong>₹0</strong> (free) to <strong>₹${maxSell}</strong> (50% of ₹${orig.toFixed(2)})`;
        priceHint.style.color = 'var(--green-600)';
        // Clamp if current value exceeds
        if (parseFloat(sellPriceInput.value) > parseFloat(maxSell)) {
          sellPriceInput.value = maxSell;
        }
      } else {
        sellPriceInput.removeAttribute('max');
        priceHint.textContent = 'Set between ₹0 (free) and 50% of the original price per serving.';
        priceHint.style.color = '';
      }
    });

    sellPriceInput.addEventListener('input', () => {
      const orig = parseFloat(origPriceInput.value);
      const sell = parseFloat(sellPriceInput.value);
      if (!isNaN(orig) && !isNaN(sell) && orig > 0) {
        const maxSell = orig * 0.5;
        if (sell > maxSell) {
          priceHint.innerHTML = `<span style="color:var(--red-500)">⚠ Max allowed: ₹${maxSell.toFixed(2)} (50% of ₹${orig.toFixed(2)})</span>`;
        } else if (sell === 0) {
          priceHint.innerHTML = `<span style="color:var(--green-600)">✓ This food will be offered for <strong>free</strong></span>`;
        } else {
          const discount = (((orig - sell) / orig) * 100).toFixed(0);
          priceHint.innerHTML = `<span style="color:var(--green-600)">✓ ${discount}% off per serving — ₹${sell.toFixed(2)} of ₹${orig.toFixed(2)}</span>`;
        }
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                                POST FOOD                                   */
  /* -------------------------------------------------------------------------- */
  const postForm = document.getElementById('postFoodForm');
  if (postForm) {
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Client-side price validation
      const origVal = parseFloat(origPriceInput?.value);
      const sellVal = parseFloat(sellPriceInput?.value);
      if (!isNaN(origVal) && !isNaN(sellVal) && sellVal > origVal * 0.5) {
        app.showToast(`Selling price cannot exceed 50% of original price (max ₹${(origVal * 0.5).toFixed(2)})`, 'error');
        return;
      }

      const btn = document.getElementById('postFoodBtn');
      btn.classList.add('loading');
      btn.disabled = true;

      const formData = new FormData(postForm);
      
      // Helper function to convert "hh:mm AM" and an base date to a datetime string
      const parseTimeStrToDateTime = (timeStr, dateStr = null) => {
        if (!timeStr) return null;
        const [time, period] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        hours = parseInt(hours, 10);
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        let targetDate;
        if (dateStr) {
          targetDate = new Date(`${dateStr}T00:00:00`);
          targetDate.setHours(hours, minutes, 0, 0);
        } else {
          const now = new Date();
          targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
          
          // If the time has already passed today, assume tomorrow
          if (targetDate < now) {
            targetDate.setDate(targetDate.getDate() + 1);
          }
        }
        
        // Format as YYYY-MM-DD HH:mm:ss for MySQL
        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const hh = String(targetDate.getHours()).padStart(2, '0');
        const min = String(targetDate.getMinutes()).padStart(2, '0');
        const ss = String(targetDate.getSeconds()).padStart(2, '0');
        
        return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
      };

      try {
        const actualExpiryStr = formData.get('actual_expiry_time');
        const actualExpiryDate = formData.get('actual_expiry_date');
        const expiryStr = formData.get('expiry_time');
        const expiryDate = formData.get('expiry_date');
        
        if (actualExpiryStr) {
          formData.set('actual_expiry_time', parseTimeStrToDateTime(actualExpiryStr, actualExpiryDate));
        }
        if (expiryStr) {
          formData.set('expiry_time', parseTimeStrToDateTime(expiryStr, expiryDate));
        }
        
        formData.delete('actual_expiry_date');
        formData.delete('expiry_date');

        const res = await authFetch('/foods', {
          method: 'POST',
          body: formData
        });
        
        if (res && res.success) {
          app.showToast('Surplus food successfully posted!', 'success');
          const postedName = postForm.food_name.value;
          postForm.reset();
          // Reset price hint
          if (priceHint) {
            priceHint.textContent = 'Set between ₹0 (free) and 50% of the original price per serving.';
            priceHint.style.color = '';
          }
          // Show success banner with Add More option
          const banner = document.getElementById('postSuccessBanner');
          const nameEl = document.getElementById('successItemName');
          if (banner) {
            nameEl.textContent = `“${postedName}” posted successfully!`;
            banner.style.display = 'block';
            banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          initDashboard(); // Reload data in background
        }
      } catch (err) {
        app.showToast(err.message, 'error');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }

  // "Add Another Item" button handler
  const addMoreBtn = document.getElementById('addMoreBtn');
  if (addMoreBtn) {
    addMoreBtn.addEventListener('click', () => {
      const banner = document.getElementById('postSuccessBanner');
      if (banner) banner.style.display = 'none';
      // Scroll to top of form and focus first field
      const formEl = document.getElementById('postFoodForm');
      if (formEl) {
        formEl.querySelector('input[name="food_name"]')?.focus();
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /*                             PROFILE SETTINGS                               */
  /* -------------------------------------------------------------------------- */
  async function loadProfileSettings() {
    try {
      const res = await authFetch('/profile/restaurant');
      if (res && res.success) {
        const form = document.getElementById('profileSettingsForm');
        if (form) {
          form.name.value = res.data.name || '';
          form.email.value = res.data.email || '';
          form.phone.value = res.data.phone || '';
          form.address.value = res.data.address || '';
          form.working_hours.value = res.data.working_hours || '';
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
        working_hours: profileForm.working_hours.value
      };

      try {
        const res = await authFetch('/profile/restaurant', {
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

  /* -------------------------------------------------------------------------- */
  /*                                INIT CHORE                                  */
  /* -------------------------------------------------------------------------- */
  function initDashboard() {
    loadOverviewStats();
    loadMyListings();
    loadIncomingRequests();
    loadProfileSettings();
  }

  initDashboard();

  /* -------------------------------------------------------------------------- */
  /*                             LIVE UPDATES                                   */
  /* -------------------------------------------------------------------------- */
  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('new_food_request', () => {
      app.showToast('New food request received!', 'success');
      loadIncomingRequests();
      loadOverviewStats();
    });
    socket.on('delivery_status_update', () => {
      loadIncomingRequests();
    });
  }

});
