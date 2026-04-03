/**
 * The Outback — Cloudflare Worker
 *
 * Entry point required to serve static assets via Workers Assets.
 * All requests are passed through to the static asset binding.
 */

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
