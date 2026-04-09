/**
 * The Outback — Cloudflare Worker
 *
 * Entry point required to serve static assets via Workers Assets.
 * All requests are passed through to the static asset binding.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Let static hosting handle static assets
    if (
      url.pathname.startsWith('/favicon') ||
      url.pathname.startsWith('/images/') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.ico')
    ) {
      return fetch(request); // Use the global fetch!
    }

    // For everything else, use your asset binding if available
    if (env && env.ASSETS && env.ASSETS.fetch) {
      return env.ASSETS.fetch(request);
    }

    // Fallback: 404
    return new Response('Not found', { status: 404 });
  },
};
