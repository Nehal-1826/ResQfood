document.addEventListener('DOMContentLoaded', () => {

  const container = document.getElementById('listingsContainer');
  const loader = document.getElementById('listingsLoader');
  const navActions = document.getElementById('navActions');
  const backBtn = document.getElementById('backToDashBtn');

  const user = app.getUser();
  const isNGO = user && user.role === 'organization';

  // Setup UI based on auth
  if (user) {
    backBtn.style.display = 'inline-flex';
    backBtn.href = user.role === 'restaurant' ? '/restaurant-dashboard.html' : '/ngo-dashboard.html';
    navActions.innerHTML = `
      <div style="display:flex; align-items:center; gap:1rem;">
        <span style="font-size:0.9rem; font-weight:500; color:var(--gray-600)">Hi, ${user.name}</span>
        <button id="logoutBtn" class="btn btn-outline btn-sm">Sign Out</button>
      </div>
    `;
    document.getElementById('logoutBtn').addEventListener('click', app.logout);
  } else {
    navActions.innerHTML = `
      <a href="/auth.html" class="btn btn-outline btn-sm">Sign In</a>
      <a href="/auth.html" class="btn btn-primary btn-sm">Join as NGO</a>
    `;
  }

  /* -------------------------------------------------------------------------- */
  /*                                LOAD LISTINGS                               */
  /* -------------------------------------------------------------------------- */
  async function loadListings() {
    try {
      const res = await authFetch('/foods'); // Public endpoint logic
      
      const cardsHTML = (res.data || []).map(food => `
        <div class="food-card">
          <div class="food-card__badge">${food.quantity}</div>
          <div class="food-card__img-wrap">
            ${food.image_url 
              ? `<img src="${food.image_url}" class="food-card__img" alt="${food.food_name}">` 
              : `<div class="food-card__placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                 </div>`}
          </div>
          <div class="food-card__body">
            <h3 class="food-card__title">${food.food_name}</h3>
            ${food.description ? `<p class="food-card__desc">${food.description}</p>` : ''}
            
            <div class="food-card__meta">
              <div class="food-meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Expires: <span class="food-meta-value" style="color:var(--red-500)">${food.actual_expiry_time ? app.formatIST(food.actual_expiry_time) : '--'}</span></span>
              </div>
              <div class="food-meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Pickup By: <span class="food-meta-value" style="color:var(--orange-600)">${app.formatIST(food.expiry_time)}</span></span>
              </div>
              <div class="food-meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/></svg>
                <span>Pick up at: <span class="food-meta-value">${food.restaurant_address}</span></span>
              </div>
              ${(food.original_price != null || food.selling_price != null) ? `
              <div class="food-meta-item" style="margin-top:0.25rem; padding-top:0.5rem; border-top:1px dashed var(--gray-200);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                <span>Price per Serving: ${
                  parseFloat(food.selling_price) === 0 
                    ? '<span style="color:var(--green-600);font-weight:700;font-size:1rem">Free</span>' + (food.original_price ? ' <span style="text-decoration:line-through;color:var(--gray-400);font-size:0.8rem">₹' + parseFloat(food.original_price).toFixed(0) + '</span>' : '')
                    : (food.selling_price != null ? '<span style="color:var(--green-700);font-weight:700;font-size:1rem">₹' + parseFloat(food.selling_price).toFixed(0) + '/serving</span>' : '') + (food.original_price ? ' <span style="text-decoration:line-through;color:var(--gray-400);font-size:0.8rem">₹' + parseFloat(food.original_price).toFixed(0) + '</span>' : '')
                }</span>
              </div>
              ` : ''}
            </div>

            <div class="food-card__footer">
              <div class="food-card__restaurant">
                <div style="width:24px;height:24px;background:var(--gray-200);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--gray-600);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg></div>
                ${food.restaurant_name}
              </div>

              ${isNGO 
                ? `<button class="btn btn-primary btn-sm req-btn" data-id="${food.food_id}"><span class="btn-text">Request</span><div class="spinner"></div></button>` 
                : `<a href="/auth.html" class="btn btn-outline btn-sm">Login to Request</a>`}
            </div>
          </div>
        </div>
      `).join('');

      loader.style.display = 'none';
      if(cardsHTML) {
        container.innerHTML = cardsHTML;
        container.style.display = 'grid';
        attachRequestHandlers();
      } else {
        container.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1; padding: 6rem 0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <h4>No food available right now</h4>
            <p>Please check back later to see new surplus donations from restaurants.</p>
          </div>`;
        container.style.display = 'block';
      }

    } catch (err) {
      loader.style.display = 'none';
      container.innerHTML = `<div class="empty-state" style="color:var(--red-500)">Failed to load food listings. Please try again later.</div>`;
      container.style.display = 'block';
      console.error(err);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                             REQUEST HANDLER                                */
  /* -------------------------------------------------------------------------- */
  function attachRequestHandlers() {
    document.querySelectorAll('.req-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const foodId = e.currentTarget.getAttribute('data-id');
        const originalBtnText = btn.innerHTML;
        
        btn.classList.add('loading');
        btn.disabled = true;

        try {
          const res = await authFetch('/requests', {
            method: 'POST',
            body: JSON.stringify({ food_id: foodId })
          });

          if (res && res.success) {
            app.showToast('Request sent successfully!', 'success');
            // Re-fetch to remove from available list
            container.style.display = 'none';
            loader.style.display = 'block';
            setTimeout(loadListings, 800);
          }
        } catch (err) {
          app.showToast(err.message, 'error');
          btn.classList.remove('loading');
          btn.disabled = false;
        }
      });
    });
  }

  loadListings();

  /* -------------------------------------------------------------------------- */
  /*                             LIVE UPDATES                                   */
  /* -------------------------------------------------------------------------- */
  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('new_food_listing', (newFood) => {
      // Refresh the list seamlessly when there's a new posted item
      app.showToast('New food dropped! Refreshing...', 'success');
      loadListings();
    });
  }

});
