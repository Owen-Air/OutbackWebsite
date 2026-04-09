/**
 * The Outback — Cloudflare Worker
 *
 * Handles contact form submissions with email validation via MailboxValidator.
 * All other requests are served from static assets.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleContact(request, env) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ success: false, message: 'Invalid form data.' }, 400);
  }

  const email = formData.get('email');
  if (!email) {
    return jsonResponse({ success: false, message: 'Email address is required.' }, 400);
  }

  // Validate email via MailboxValidator
  try {
    const mbvRes = await fetch(
      `https://api.mailboxvalidator.com/v2/validation/single?key=${env.MAILBOXVALIDATOR_KEY}&email=${encodeURIComponent(email)}&format=json`
    );
    const mbv = await mbvRes.json();

    if (!mbv.error) {
      if (mbv.is_syntax === false) {
        return jsonResponse({ success: false, message: "That email address doesn't look right. Please check and try again." }, 422);
      }
      if (mbv.is_disposable === true) {
        return jsonResponse({ success: false, message: "Please use a real email address — we can't accept disposable or temporary emails." }, 422);
      }
      if (mbv.is_suppressed === true || mbv.status === false) {
        return jsonResponse({ success: false, message: "That email address couldn't be validated. Please use a different one." }, 422);
      }
    }
  } catch (err) {
    // Fail open — don't block legitimate submissions if MBV is unreachable
    console.error('MailboxValidator error:', err);
  }

  // Forward to web3forms with the secret key
  const w3fData = new FormData();
  for (const [key, value] of formData.entries()) {
    w3fData.append(key, value);
  }
  w3fData.set('access_key', env.WEB3FORMS_KEY);

  const w3fRes = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    body: w3fData,
  });

  const result = await w3fRes.json();
  return jsonResponse(result, w3fRes.status);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }

    if (env && env.ASSETS && env.ASSETS.fetch) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  },
};
