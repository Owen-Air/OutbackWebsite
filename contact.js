document.addEventListener('DOMContentLoaded', () => {
  const emailLink = document.getElementById('emailLink');
  if (emailLink) {
    const user = 'outbackiom';
    const domain = 'gmail.com';
    emailLink.href = `mailto:${user}@${domain}`;
    emailLink.textContent = `${user}@${domain}`;
  }

  const form = document.querySelector('.contact-form');
  if (!form) return;
  const submitButton = form.querySelector('.form-submit');
  const turnstileContainer = form.querySelector('.cf-turnstile');

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
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  };

  const getTurnstileToken = () => {
    const tokenInput = form.querySelector('[name="cf-turnstile-response"]');
    return typeof tokenInput?.value === 'string' ? tokenInput.value.trim() : '';
  };

  if (submitButton && turnstileContainer) {
    // Front-end gate: only show/send after Turnstile is completed.
    submitButton.style.display = 'none';
    submitButton.disabled = true;

    const gateHint = document.createElement('p');
    gateHint.className = 'form-note';
    gateHint.style.marginTop = '0.75rem';
    gateHint.textContent = 'Complete the captcha to enable the submit button.';
    turnstileContainer.insertAdjacentElement('afterend', gateHint);

    const syncSubmitGate = () => {
      const solved = getTurnstileToken().length > 0;
      submitButton.style.display = solved ? '' : 'none';
      submitButton.disabled = !solved;
      gateHint.style.display = solved ? 'none' : '';
    };

    syncSubmitGate();
    window.setInterval(syncSubmitGate, 400);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!submitButton) return;

    if (turnstileContainer && !getTurnstileToken()) {
      showOverlay('CAPTCHA REQUIRED', 'Please complete the captcha before sending your enquiry.');
      return;
    }

    // Client-side rate limit: 1 per minute
    const lastSubmit = localStorage.getItem('contactFormLastSubmit');
    const now = Date.now();
    if (lastSubmit && (now - parseInt(lastSubmit, 10)) < 60000) {
      const remaining = Math.ceil((60000 - (now - parseInt(lastSubmit, 10))) / 1000);
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
      const data = {};
      new FormData(form).forEach((value, key) => { data[key] = value; });
      // Web3Forms free plan rejects Turnstile fields; omit them from payload.
      delete data['cf-turnstile-response'];
      delete data.turnstileToken;
      delete data['g-recaptcha-response'];
      data.access_key = '576014a8-99fd-42c1-84e2-826a31705d39';

      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      });

      let resData;
      try { resData = await res.json(); } catch {
        throw new Error(`Submission error (HTTP ${res.status}). Please try again or call us directly.`);
      }

      if (resData.success) {
        form.reset();
        if (window.turnstile && typeof window.turnstile.reset === 'function') window.turnstile.reset();
        localStorage.setItem('contactFormLastSubmit', Date.now().toString());
        submitButton.textContent = 'SENT ✓';
        submitButton.style.background = '#95D600';
        submitButton.style.opacity = '1';
        showOverlay('MESSAGE SENT', "Nice one. We've got your enquiry and we'll get back to you as soon as we can.");
        window.setTimeout(resetButton, 3000);
        return;
      }

      throw new Error(resData.message || 'Form service returned an error.');
    } catch (error) {
      if (window.turnstile && typeof window.turnstile.reset === 'function') window.turnstile.reset();
      submitButton.textContent = 'ERROR — TRY AGAIN';
      submitButton.style.background = '#cc3333';
      submitButton.style.opacity = '1';
      showOverlay('SEND FAILED', error.message || 'Something went wrong. Please try again or call us directly.');
      window.setTimeout(resetButton, 3000);
    }
  });
});