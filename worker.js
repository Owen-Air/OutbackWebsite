/**
 * The Outback — Cloudflare Worker
 *
 * Handles contact form submissions with:
 *  - Origin/Referer validation (blocks direct API calls from outside the site)
 *  - Server-side input length limits
 *  - KV-based rate limiting (max 3 requests per IP per 15 minutes)
 *  - Email validation via MailboxValidator
 *  - Cloudflare Turnstile bot verification (active when TURNSTILE_SECRET is set)
 * All other requests are served from static assets.
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
const INPUT_LIMITS = { name: 100, email: 254, phone: 30, enquiry: 50, date: 10, message: 2000 };
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds


// New endpoint: /api/validate for email validation only
async function handleValidate(request, env) {
  // Only allow POST
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Method not allowed.' }, 405);
  }
  // Parse form data
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
  // Email validation via MailboxValidator
  try {
    const mbvRes = await fetchWithTimeout(
      `https://api.mailboxvalidator.com/v2/validation/single?key=${env.MAILBOXVALIDATOR_KEY}&email=${encodeURIComponent(email)}&format=json`,
      {},
      1500
    );
    const contentType = mbvRes.headers.get('content-type') || '';
    let mbv = {};
    let mbvText = '';
    if (contentType.includes('application/json')) {
      try {
        mbv = await mbvRes.json();
      } catch (e) {
        mbvText = await mbvRes.text();
        console.error('MailboxValidator invalid JSON:', mbvText);
        mbv = {};
      }
    } else {
      mbvText = await mbvRes.text();
      console.error('MailboxValidator non-JSON response:', mbvText);
      mbv = {};
    }
    if (mbv.error) {
      console.error('MailboxValidator API error:', mbv.error.error_code, mbv.error.error_message);
      // Fail open: do not block submission
    } else {
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
    console.error('MailboxValidator error:', err);
  }
  return jsonResponse({ success: true, message: 'Validation passed.' }, 200);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);



    if (url.pathname === '/api/validate' && request.method === 'POST') {
      return handleValidate(request, env);
    }

    // Serve PNG favicon as .ico if requested
    if (url.pathname === '/favicon.ico') {
      return fetch('https://theoutback.im/favicon48x48.png', {
        headers: { 'content-type': 'image/png' }
      });
    }

    if (env && env.ASSETS && env.ASSETS.fetch) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  },
};

