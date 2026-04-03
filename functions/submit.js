/**
 * Cloudflare Pages Function — /submit
 *
 * Receives the contact form POST, injects the Web3Forms access key
 * from an environment secret, and forwards to the Web3Forms API.
 * The key is never exposed to the browser.
 *
 * Secret required: WEB3FORMS_KEY
 * Set via: wrangler pages secret put WEB3FORMS_KEY --project-name outback-website-alpha
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.WEB3FORMS_KEY) {
    return new Response(
      JSON.stringify({ success: false, message: 'Server configuration error.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid form data.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Inject the secret key server-side
  formData.set('access_key', env.WEB3FORMS_KEY);

  let upstream;
  try {
    upstream = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: formData,
      headers: { 'User-Agent': 'TheOutback-ContactForm/1.0' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: 'Could not reach the mail service. Please try again.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: `Mail service returned an unexpected response (HTTP ${upstream.status}).` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify(data), {
    status: data.success ? 200 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 });
}
