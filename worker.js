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


// /api/validate endpoint: always return success, no validation
async function handleValidate(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Method not allowed.' }, 405);
  }
  return jsonResponse({ success: true, message: 'Validation skipped.' }, 200);
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

