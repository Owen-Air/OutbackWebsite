document.addEventListener('DOMContentLoaded', () => {
  const EMAIL_VALIDATION_MESSAGES = {
    missing_email: 'Enter an email address before sending your enquiry.',
    missing_name: 'Enter your name before sending your enquiry.',
    missing_turnstile: 'Please complete the captcha before sending your enquiry.',
    missing_message: 'Enter a message so we know what you need.',
    rate_limited: 'Too many attempts. Please wait a minute and try again.',
    invalid_json: 'The validation request was invalid. Please try again.',
    invalid_syntax: 'That email address does not look valid.',
    invalid_name: 'Enter a real name so we know who to reply to.',
    invalid_phone: 'Use a valid phone number or leave it blank.',
    invalid_enquiry: 'Choose the type of enquiry you want to send.',
    invalid_date: 'Use a valid preferred date or leave it blank.',
    invalid_message: 'Write a longer message so we can help properly.',
    forbidden_origin: 'This form can only be submitted from the website itself.',
    bot_detected: 'The submission was rejected. Please refresh and try again.',
    turnstile_failed: 'Captcha verification failed. Please try again.',
    validation_service_unavailable: 'Email validation is temporarily unavailable. Please call us directly.',
    validation_service_error: 'We could not validate that email address just now. Please try again.',
    rejected: 'Please use a real, non-disposable email address so we can reply.',
    form_service_unavailable: 'The contact form is temporarily unavailable. Please call us directly.',
    form_service_error: 'We could not send your enquiry just now. Please try again.'
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

  const showOverlay = (title, message) => {
    const overlay = document.createElement('div');
    const box = document.createElement('div');
    const titleElement = document.createElement('p');
    const copyElement = document.createElement('p');
    const closeButton = document.createElement('button');

    overlay.className = 'form-status-overlay';
    box.className = 'form-status-box';
    titleElement.className = 'form-status-title';
    copyElement.className = 'form-status-copy';
    closeButton.className = 'form-status-close';
    closeButton.type = 'button';

    titleElement.textContent = title;
    copyElement.textContent = message;
    closeButton.textContent = 'Close';

    closeButton.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });

    box.append(titleElement, copyElement, closeButton);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  };

  const getFieldValue = (name) => {
    const input = form.elements.namedItem(name);
    return typeof input?.value === 'string' ? input.value.trim() : '';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('.form-submit');
    if (!submitButton) return;

    // Rate limiting: 1 submission per minute
    const lastSubmit = localStorage.getItem('contactFormLastSubmit');
    const now = Date.now();
    const lastSubmitTs = lastSubmit ? Number.parseInt(lastSubmit, 10) : Number.NaN;
    if (Number.isFinite(lastSubmitTs) && (now - lastSubmitTs) < 60000) {
      const remaining = Math.ceil((60000 - (now - lastSubmitTs)) / 1000);
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
      const submitRes = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: getFieldValue('name'),
          email: getFieldValue('email'),
          phone: getFieldValue('phone'),
          enquiry: getFieldValue('enquiry'),
          date: getFieldValue('date'),
          message: getFieldValue('message'),
          website: getFieldValue('website'),
          turnstileToken: getTurnstileToken()
        })
      });

      let submitData;
      try {
        submitData = await submitRes.json();
      } catch {
        throw new Error(`Submission error (HTTP ${submitRes.status}). Please try again or call us directly.`);
      }

      if (!submitRes.ok || !submitData.success) {
        throw new Error(
          EMAIL_VALIDATION_MESSAGES[submitData.reason] ||
          submitData.details?.message ||
          'Contact form submission failed.'
        );
      }

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