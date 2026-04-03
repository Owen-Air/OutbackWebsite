/**
 * The Outback — Cloudflare Worker
 *
 * Handles POST /submit (contact form → Web3Forms).
 * All other requests fall through to static assets.
 *
 * Secret required: WEB3FORMS_KEY
 * Set via: wrangler secret put WEB3FORMS_KEY
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/submit') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return handleSubmit(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleSubmit(request, env) {
  if (!env.WEB3FORMS_KEY) {
    return json({ success: false, message: 'Server configuration error.' }, 500);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ success: false, message: 'Invalid form data.' }, 400);
  }

  formData.set('access_key', env.WEB3FORMS_KEY);

  let upstream;
  try {
    upstream = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: formData,
    });
  } catch {
    return json({ success: false, message: 'Could not reach the mail service. Please try again.' }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return json(
      { success: false, message: `Mail service returned an unexpected response (HTTP ${upstream.status}).` },
      502
    );
  }

  return json(data, data.success ? 200 : 400);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
