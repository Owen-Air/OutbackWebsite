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
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form)
      });
      const data = await response.json();

      if (data.success) {
        form.reset();
        localStorage.setItem('contactFormLastSubmit', Date.now().toString());
        submitButton.textContent = 'SENT ✓';
        submitButton.style.background = '#95D600';
        submitButton.style.opacity = '1';
        showOverlay('MESSAGE SENT', "Nice one. We've got your enquiry and we'll get back to you as soon as we can.");
        window.setTimeout(resetButton, 3000);
        return;
      }

      throw new Error(data.message || 'Form service returned an error.');
    } catch (error) {
      submitButton.textContent = 'ERROR — TRY AGAIN';
      submitButton.style.background = '#cc3333';
      submitButton.style.opacity = '1';
      showOverlay('SEND FAILED', error.message || 'Something went wrong. Please try again or call us directly.');
      window.setTimeout(resetButton, 3000);
    }
  });
});