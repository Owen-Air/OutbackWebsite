document.addEventListener('DOMContentLoaded', () => {
  const EMAIL_VALIDATION_MESSAGES = {
    missing_email: 'Enter an email address before sending your enquiry.',
    missing_turnstile: 'Please complete the captcha before sending your enquiry.',
    invalid_json: 'The validation request was invalid. Please try again.',
    invalid_syntax: 'That email address does not look valid.',
    turnstile_failed: 'Captcha verification failed. Please try again.',
    validation_service_unavailable: 'Email validation is temporarily unavailable. Please call us directly.',
    validation_service_error: 'We could not validate that email address just now. Please try again.',
    rejected: 'Please use a real, non-disposable email address so we can reply.'
  };

  const emailLink = document.getElementById('emailLink');
  if (emailLink) {
    const user = 'outbackiom';
    const domain = 'gmail.com';
    emailLink.href = `mailto:${user}@${domain}`;
    emailLink.textContent = `${user}@${domain}`;
  }

  const form = document.querySelector('.contact-form');
  if (!form) return;

  const getTurnstileToken = () => {
    const tokenInput = form.querySelector('[name="cf-turnstile-response"]');
    return typeof tokenInput?.value === 'string' ? tokenInput.value.trim() : '';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('.form-submit');
    if (!submitButton) return;

    const showOverlay = (title, message) => {
      const overlay = document.createElement('div');
      overlay.className = 'form-status-overlay';
      overlay.innerHTML = `
        <div class="form-status-box">
          <p class="form-status-title">${title}</p>
          <p class="form-status-copy">${message}</p>
          <button type="button" class="form-status-close">Close</button>
        </div>
      `;
      overlay.querySelector('.form-status-close')?.addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    };

    // Rate limiting: 1 submission per minute
    const lastSubmit = localStorage.getItem('contactFormLastSubmit');
    const now = Date.now();
    if (lastSubmit && (now - parseInt(lastSubmit)) < 60000) {
      const remaining = Math.ceil((60000 - (now - parseInt(lastSubmit))) / 1000);
      showOverlay('TOO FAST', `Please wait ${remaining} seconds before submitting another enquiry.`);
      return;
    }

    const originalText = submitButton.textContent;
    submitButton.textContent = 'SENDING...';
    submitButton.style.opacity = '0.6';
    submitButton.disabled = true;

    const resetButton = () => {
      submitButton.textContent = originalText;
      submitButton.style.background = '';
      submitButton.style.opacity = '1';
      submitButton.disabled = false;
    };

    try {
      // Step 1: Validate email server-side
      const validateRes = await fetch('/api/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          email: form.email.value.trim(),
          turnstileToken: getTurnstileToken()
        })
      });

      let validateData;
      try {
        validateData = await validateRes.json();
      } catch {
        throw new Error(`Validation error (HTTP ${validateRes.status}). Please try again or call us directly.`);
      }

      if (!validateRes.ok || !validateData.valid) {
        throw new Error(
          EMAIL_VALIDATION_MESSAGES[validateData.reason] ||
          validateData.details?.message ||
          'Email validation failed.'
        );
      }

      // Step 2: Submit to Web3Forms
      const web3formsData = new FormData(form);

      const w3fRes = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        },
        body: web3formsData
      });

      let w3fData;
      try {
        w3fData = await w3fRes.json();
      } catch {
        throw new Error(`Web3Forms error (HTTP ${w3fRes.status}). Please try again or call us directly.`);
      }
      if (w3fData.success) {
        form.reset();
        if (window.turnstile && typeof window.turnstile.reset === 'function') {
          window.turnstile.reset();
        }
        localStorage.setItem('contactFormLastSubmit', Date.now().toString());
        submitButton.textContent = 'SENT ✓';
        submitButton.style.background = '#95D600';
        submitButton.style.opacity = '1';
        showOverlay('MESSAGE SENT', "Nice one. We've got your enquiry and we'll get back to you as soon as we can.");
        window.setTimeout(resetButton, 3000);
        return;
      }
      throw new Error(w3fData.message || 'Form service returned an error.');
    } catch (error) {
      if (window.turnstile && typeof window.turnstile.reset === 'function') {
        window.turnstile.reset();
      }
      submitButton.textContent = 'ERROR — TRY AGAIN';
      submitButton.style.background = '#cc3333';
      submitButton.style.opacity = '1';
      showOverlay('SEND FAILED', error.message || 'Something went wrong. Please try again or call us directly.');
      window.setTimeout(resetButton, 3000);
    }
  });
});