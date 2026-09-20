document.addEventListener('DOMContentLoaded', () => {

  /* -------------------------------------------------------------------------- */
  /*                        EMAIL VERIFICATION FLASH                            */
  /* -------------------------------------------------------------------------- */
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('verified') === '1') {
    // Small delay to let the page render first
    setTimeout(() => app.showToast('✅ Email verified successfully! You can now log in.', 'success'), 400);
    // Clean up the URL without reloading
    window.history.replaceState({}, '', '/auth.html');
  }

  // Auto-select role based on URL param
  const roleParam = urlParams.get('role');
  if (roleParam && ['restaurant', 'organization', 'volunteer', 'administrator'].includes(roleParam)) {
    setTimeout(() => {
      const tab = document.querySelector(`.role-tab[data-role="${roleParam}"]`);
      if (tab) tab.click();
    }, 100);
  }


  /* -------------------------------------------------------------------------- */
  /*                             STATE & ELEMENTS                               */
  /* -------------------------------------------------------------------------- */
  let currentRole = 'restaurant';
  let currentAction = 'login'; // 'login' or 'register'

  const roleTabs = document.querySelectorAll('.role-tab');
  const actionTabs = document.querySelectorAll('.action-tab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const pwInput = document.getElementById('regPassword');
  const regSubmitBtn = document.getElementById('regSubmitBtn');

  /* -------------------------------------------------------------------------- */
  /*                               ROLE SWITCHING                               */
  /* -------------------------------------------------------------------------- */
  roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      roleTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentRole = tab.getAttribute('data-role');

      // Hide "Forgot Password?" for administrators (password reset not allowed)
      const forgotLink = loginForm.querySelector('a[href="/forgot-password"]');
      if (forgotLink) {
        forgotLink.style.visibility = currentRole === 'administrator' ? 'hidden' : 'visible';
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                              ACTION SWITCHING                              */
  /* -------------------------------------------------------------------------- */
  actionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      actionTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentAction = tab.getAttribute('data-action');

      if (currentAction === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
      } else {
        // Admins cannot register here
        if (currentRole === 'administrator') {
          app.showToast('Administrators cannot register.', 'error');
          return;
        }
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
      }
    });
  });

  // Hide Register tab if Administrator is selected
  roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      if (currentRole === 'administrator') {
        document.querySelector('.action-tab[data-action="register"]').style.display = 'none';
        document.querySelector('.action-tab[data-action="login"]').click(); // Force login view
      } else {
        document.querySelector('.action-tab[data-action="register"]').style.display = 'inline-block';
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                             PASSWORD VALIDATION                            */
  /* -------------------------------------------------------------------------- */
  const rules = {
    length: (v) => v.length >= 8,
    upper: (v) => /[A-Z]/.test(v),
    lower: (v) => /[a-z]/.test(v),
    number: (v) => /[0-9]/.test(v),
    special: (v) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(v)
  };

  pwInput.addEventListener('input', (e) => {
    const v = e.target.value;
    let allValid = true;

    for (const [rule, testFn] of Object.entries(rules)) {
      const el = document.getElementById(`rule-${rule}`);
      const valid = testFn(v);
      if (valid) {
        el.classList.add('valid');
        el.querySelector('.rule-icon').textContent = '✓';
      } else {
        el.classList.remove('valid');
        el.querySelector('.rule-icon').textContent = '〇';
        allValid = false;
      }
    }

    regSubmitBtn.disabled = !allValid;
  });

  /* -------------------------------------------------------------------------- */
  /*                                 SUBMIT LOGIN                               */
  /* -------------------------------------------------------------------------- */
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.classList.add('loading');
    btn.disabled = true;

    const email = loginForm.email.value;
    const password = loginForm.password.value;

    try {
      const apiRoleRoute = currentRole === 'administrator' ? 'admin' : currentRole;
      const res = await authFetch(`/auth/${apiRoleRoute}/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (res && res.success) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(res.user));
        app.showToast('Login successful! Redirecting...', 'success');
        
        setTimeout(() => {
          if (currentRole === 'administrator') window.location.href = '/admin-dashboard.html';
          else if (currentRole === 'restaurant') window.location.href = '/restaurant-dashboard.html';
          else if (currentRole === 'organization') window.location.href = '/ngo-dashboard.html';
          else window.location.href = '/volunteer-dashboard.html';
        }, 1000);
      }
    } catch (err) {
      // Special handling: email not verified
      if (err.message && err.message.toLowerCase().includes('verify your email')) {
        // Show a persistent notice with a resend option
        const container = document.getElementById('toast-container');
        const notice = document.createElement('div');
        notice.className = 'toast toast-warning';
        notice.style.cssText = 'max-width:380px; flex-direction:column; align-items:flex-start; gap:0.5rem;';
        notice.innerHTML = `
          <span>📧 <strong>Email not verified.</strong> Check your inbox for the verification link.</span>
          <button id="resendVerifyBtn" style="background:#d97706;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">
            Resend Verification Email
          </button>
        `;
        container.appendChild(notice);
        setTimeout(() => { if (container.contains(notice)) container.removeChild(notice); }, 8000);

        // Resend handler
        document.getElementById('resendVerifyBtn')?.addEventListener('click', async () => {
          try {
            const apiRoleRoute = currentRole === 'administrator' ? 'admin' : currentRole;
            await authFetch(`/auth/resend-verification`, {
              method: 'POST',
              body: JSON.stringify({ email: loginForm.email.value, role: apiRoleRoute })
            });
            app.showToast('Verification email resent! Check your inbox.', 'success');
            if (container.contains(notice)) container.removeChild(notice);
          } catch (e) {
            app.showToast('Failed to resend. Try again later.', 'error');
          }
        });
      } else {
        app.showToast(err.message, 'error');
      }
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });

  /* -------------------------------------------------------------------------- */
  /*                               SUBMIT REGISTER                              */
  /* -------------------------------------------------------------------------- */
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = regSubmitBtn;
    btn.classList.add('loading');
    btn.disabled = true;

    const payload = {
      name: registerForm.name.value,
      email: registerForm.email.value.trim(),
      phone: registerForm.phone.value,
      address: registerForm.address.value,
      password: registerForm.password.value
    };

    // Restaurant: combine working hours into one string
    if (currentRole === 'restaurant') {
      const from = registerForm.working_from?.value;
      const to   = registerForm.working_to?.value;
      if (from && to) payload.working_hours = `${from} – ${to} IST`;
    }

    // Organization: extra details
    if (currentRole === 'organization') {
      payload.org_type     = registerForm.org_type?.value     || null;
      payload.sector       = registerForm.sector?.value       || null;
      payload.people_count = registerForm.people_count?.value || null;
    }

    // Volunteer: extra details
    if (currentRole === 'volunteer') {
      payload.age                 = registerForm.age?.value                 || null;
      payload.gender              = registerForm.gender?.value              || null;
      payload.vehicle_type        = registerForm.vehicle_type?.value        || null;
      payload.vehicle_number      = registerForm.vehicle_number?.value      || null;
      payload.government_id       = registerForm.government_id?.value       || null;
      payload.emergency_contact   = registerForm.emergency_contact?.value   || null;
      payload.working_hours_start = registerForm.working_hours_start?.value || null;
      payload.working_hours_end   = registerForm.working_hours_end?.value   || null;
      // Note: license_file upload requires FormData, which we'll handle below
    }

    if (!payload.email.toLowerCase().endsWith('@gmail.com')) {
      app.showToast('Please use a Gmail address (@gmail.com) to register.', 'error');
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }

    try {
      const apiRoleRoute = currentRole === 'administrator' ? 'admin' : currentRole;
      
      let reqBody;
      let reqHeaders = { 'Content-Type': 'application/json' };

      if (currentRole === 'volunteer') {
         // Volunteer has a file upload, must use FormData
         const fd = new FormData();
         for (const key in payload) {
           if (payload[key] !== null) fd.append(key, payload[key]);
         }
         if (registerForm.license_file?.files[0]) {
           fd.append('license_file', registerForm.license_file.files[0]);
         }
         reqBody = fd;
         // Delete Content-Type so browser sets boundary automatically
         delete reqHeaders['Content-Type'];
      } else {
         reqBody = JSON.stringify(payload);
      }

      const res = await authFetch(`/auth/${apiRoleRoute}/register`, {
        method: 'POST',
        headers: reqHeaders, // authFetch takes headers properly
        body: reqBody
      });

      if (res && res.success) {
        // After registration, user must verify email before logging in
        app.showToast('📧 Registration successful! Please check your email and click the verification link before logging in.', 'success');
        registerForm.reset();
        // Reset password rules UI
        document.querySelectorAll('.password-rule').forEach(el => {
          el.classList.remove('valid');
          el.querySelector('.rule-icon').textContent = '〇';
        });
        // Switch to login tab
        setTimeout(() => {
          document.querySelector('.action-tab[data-action="login"]').click();
        }, 2500);
      }
    } catch (err) {
      app.showToast(err.message, 'error');
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });

});
