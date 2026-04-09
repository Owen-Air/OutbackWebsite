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
      const validateFormData = new FormData();
      validateFormData.append('email', form.email.value);
      const validateRes = await fetch('/api/validate', {
        method: 'POST',
        body: validateFormData
      });
      let validateData;
      try {
        validateData = await validateRes.json();
      } catch {
        throw new Error(`Validation error (HTTP ${validateRes.status}). Please try again or call us directly.`);
      }
      if (!validateData.success) {
        throw new Error(validateData.message || 'Email validation failed.');
      }

      // Step 2: Submit to Web3Forms
      const web3formsData = {};
      new FormData(form).forEach((value, key) => {
        web3formsData[key] = value;
      });
      web3formsData.access_key = '576014a8-99fd-42c1-84e2-826a31705d39';

      const w3fRes = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(web3formsData)
      });
      let w3fData;
      try {
        w3fData = await w3fRes.json();
      } catch {
        throw new Error(`Web3Forms error (HTTP ${w3fRes.status}). Please try again or call us directly.`);
      }
      if (w3fData.success) {
        form.reset();
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
      submitButton.textContent = 'ERROR — TRY AGAIN';
      submitButton.style.background = '#cc3333';
      submitButton.style.opacity = '1';
      showOverlay('SEND FAILED', error.message || 'Something went wrong. Please try again or call us directly.');
      window.setTimeout(resetButton, 3000);
    }
  });
});