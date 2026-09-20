document.addEventListener('DOMContentLoaded', async () => {

!app.isAuthenticated() && (window.location.href = '/auth.html');

  const params = new URLSearchParams(window.location.search);
  const requestId = params.get('id');

  if (!requestId) {
    app.showToast('No request ID provided', 'error');
    setTimeout(() => window.location.href = '/ngo-dashboard.html', 2000);
    return;
  }

  // Pre-fill confirm screen
  document.getElementById('currentDate').textContent = app.formatDate(new Date(), false);

  try {
    const res = await authFetch('/requests/my');
    const reqData = (res.data || []).find(r => r.request_id == requestId);

    if (!reqData || reqData.request_status !== 'Accepted') {
      throw new Error('Valid accepted request not found.');
    }

    document.getElementById('foodName').textContent = reqData.food_name;
    document.getElementById('restaurantName').textContent = reqData.restaurant_name;

  } catch (err) {
    app.showToast(err.message, 'error');
    document.getElementById('confirmBtn').disabled = true;
  }

  /* -------------------------------------------------------------------------- */
  /*                                CONFIRM PICKUP                              */
  /* -------------------------------------------------------------------------- */
  document.getElementById('confirmBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const btnText = btn.querySelector('.btn-text');
    
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const res = await authFetch('/pickups', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId })
      });

      if (res && res.success) {
        btnText.textContent = 'Confirmed!';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        
        // Show success msg
        setTimeout(() => {
          btn.style.display = 'none';
          document.getElementById('successMsg').style.display = 'block';
        }, 800);
      }
    } catch (err) {
      app.showToast(err.message, 'error');
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });

});
