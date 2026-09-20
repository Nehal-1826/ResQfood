document.addEventListener('DOMContentLoaded', () => {

  // ─── FORGOT PASSWORD ────────────────────────────────────────────────────────
  const forgotForm = document.getElementById('forgotPasswordForm');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = document.getElementById('forgotBtn');
      btn.classList.add('loading');
      btn.disabled = true;

      const email = forgotForm.email.value;
      const role = forgotForm.role.value;

      try {
        const res = await authFetch('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email, role })
        });
        
        if (res.success) {
          app.showToast(res.message, 'success');
          forgotForm.reset();
        } else {
          app.showToast(res.message, 'error');
        }
      } catch (err) {
        app.showToast(err.message, 'error');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }

  // ─── RESET PASSWORD ─────────────────────────────────────────────────────────
  const resetForm = document.getElementById('resetPasswordForm');
  if (resetForm) {
    // Extract token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (!token) {
      app.showToast('Invalid or missing reset token.', 'error');
      setTimeout(() => {
        window.location.href = '/auth.html';
      }, 3000);
      return;
    }
    
    document.getElementById('resetToken').value = token;

    // Password validation logic (reused from auth.js)
    const passInput = document.getElementById('regPassword');
    const confirmInput = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('resetBtn');
    const matchHint = document.getElementById('passwordMatch');

    let isPassValid = false;
    let doPasswordsMatch = false;

    if (passInput) {
      const rules = {
        length: { regex: /.{8,}/, el: document.getElementById('rule-length') },
        upper: { regex: /[A-Z]/, el: document.getElementById('rule-upper') },
        lower: { regex: /[a-z]/, el: document.getElementById('rule-lower') },
        number: { regex: /[0-9]/, el: document.getElementById('rule-number') },
        special: { regex: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, el: document.getElementById('rule-special') }
      };

      const validatePassword = () => {
        const val = passInput.value;
        let allValid = true;

        for (const key in rules) {
          const rule = rules[key];
          if (!rule.el) continue;
          
          if (rule.regex.test(val)) {
            rule.el.classList.add('valid');
            rule.el.querySelector('.rule-icon').textContent = '✓';
          } else {
            rule.el.classList.remove('valid');
            rule.el.querySelector('.rule-icon').textContent = '〇';
            allValid = false;
          }
        }
        isPassValid = allValid;
        checkCanSubmit();
      };

      passInput.addEventListener('input', () => {
        validatePassword();
        checkMatch();
      });
      if (confirmInput) {
        confirmInput.addEventListener('input', checkMatch);
      }
    }

    function checkMatch() {
      if (!confirmInput || !passInput) return;
      if (confirmInput.value.length === 0) {
        matchHint.textContent = '';
        doPasswordsMatch = false;
      } else if (confirmInput.value === passInput.value) {
        matchHint.textContent = 'Passwords match ✓';
        matchHint.style.color = '#10b981'; // green-500
        doPasswordsMatch = true;
      } else {
        matchHint.textContent = 'Passwords do not match';
        matchHint.style.color = '#ef4444'; // red-500
        doPasswordsMatch = false;
      }
      checkCanSubmit();
    }

    function checkCanSubmit() {
      if (!submitBtn) return;
      submitBtn.disabled = !(isPassValid && doPasswordsMatch);
    }

    // Submit handler
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!isPassValid || !doPasswordsMatch) return;

      const btn = document.getElementById('resetBtn');
      btn.classList.add('loading');
      btn.disabled = true;

      const newPassword = passInput.value;

      try {
        const res = await authFetch('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token, newPassword })
        });
        
        if (res.success) {
          app.showToast(res.message, 'success');
          setTimeout(() => {
            window.location.href = '/auth.html';
          }, 2000);
        } else {
          app.showToast(res.message, 'error');
          btn.classList.remove('loading');
          btn.disabled = false;
        }
      } catch (err) {
        app.showToast(err.message, 'error');
        btn.classList.remove('loading');
        btn.disabled = false;
      }
    });
  }

});
