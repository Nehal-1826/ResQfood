document.addEventListener('DOMContentLoaded', async () => {

!app.isAuthenticated() && (window.location.href = '/auth.html');

  const params = new URLSearchParams(window.location.search);
  const requestId = params.get('id');

  if (!requestId) {
    app.showToast('No request ID provided', 'error');
    setTimeout(() => window.history.back(), 2000);
    return;
  }

  /* -------------------------------------------------------------------------- */
  /*                             LOAD TRACKING DATA                             */
  /* -------------------------------------------------------------------------- */
  try {
    // A bit of a workaround to get the single request info, we fetch all of the NGO's requests
    // and find the one that matches requestId. In a real app we'd have a GET /requests/:id endpoint.
    const res = await authFetch('/requests/my');
    const reqData = (res.data || []).find(r => r.request_id == requestId);

    if (!reqData) {
      throw new Error('Request not found or access denied.');
    }

    // Populate UI headers
    document.getElementById('foodName').textContent = reqData.food_name;
    document.getElementById('foodQuantity').textContent = `Qty: ${reqData.quantity}`;
    document.getElementById('foodExpiry').textContent = `Expires: ${app.formatDate(reqData.expiry_time, true)}`;
    document.getElementById('restaurantAddress').textContent = reqData.restaurant_address;
    document.getElementById('restaurantPhone').textContent = reqData.restaurant_phone;

    const imgWrap = document.getElementById('foodImgWrap');
    if (reqData.image_url) {
      imgWrap.innerHTML = `<img src="${reqData.image_url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      imgWrap.textContent = reqData.food_name.charAt(0);
    }

    const badge = document.getElementById('currentStatusBadge');
    badge.textContent = reqData.request_status;
    badge.className = `badge badge-${reqData.request_status.toLowerCase()}`;

    // Generate Timeline
    const timeline = document.getElementById('trackingTimeline');
    const status = reqData.request_status;
    
    // Status Logic hierarchy: Pending -> Accepted | Rejected -> Completed
    const isAccepted = ['accepted', 'volunteer_assigned', 'picked_up', 'on_the_way', 'delivered'].includes(status.toLowerCase());
    const isCompleted = status.toLowerCase() === 'delivered';
    const isRejected = status.toLowerCase() === 'rejected';

    let html = `
      <div class="tracking-item completed">
        <div class="tracking-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div class="tracking-content">
          <h5>Request Sent</h5>
          <p>You requested pickup for this food.</p>
          <span class="tracking-time">${app.formatDate(reqData.request_time, true)}</span>
        </div>
      </div>
    `;

    if (isRejected) {
      html += `
        <div class="tracking-item rejected">
          <div class="tracking-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <div class="tracking-content">
            <h5>Request Rejected</h5>
            <p>The restaurant was unable to accept your request at this time.</p>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="tracking-item ${isAccepted ? 'completed' : 'active'}">
          <div class="tracking-icon">
            ${isAccepted 
              ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>` 
              : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`}
          </div>
          <div class="tracking-content">
            <h5>Restaurant Approval</h5>
            <p>${isAccepted ? 'The restaurant has approved your pickup request!' : 'Waiting for the restaurant to review your request.'}</p>
          </div>
        </div>

        <div class="tracking-item ${isCompleted ? 'completed' : ''} ${!isCompleted && isAccepted ? 'active' : ''}">
          <div class="tracking-icon">
             ${isCompleted 
              ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>` 
              : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`}
          </div>
          <div class="tracking-content">
            <h5>Food Collected</h5>
            <p>${isCompleted ? 'You have successfully collected the food.' : 'Confirm once you have physically collected the food.'}</p>
            ${isCompleted ? `<span class="tracking-time">Donation Completed</span>` : ''}
          </div>
        </div>
      `;
    }

    timeline.innerHTML = html;

    // Show action area if Accepted
    if (status === 'Accepted') {
      document.getElementById('pickupActionArea').style.display = 'block';
      document.getElementById('goToConfirmBtn').onclick = () => {
        window.location.href = `/pickup-confirmation.html?id=${requestId}`;
      };
    }

  } catch (err) {
    document.getElementById('trackingTimeline').innerHTML = `<div class="empty-state" style="color:var(--red-500)">${err.message}</div>`;
    console.error(err);
  }

});
