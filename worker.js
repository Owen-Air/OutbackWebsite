/**
 * The Outback — Cloudflare Worker
 *
 * Entry point required to serve static assets via Workers Assets.
 * All requests are passed through to the static asset binding.
 */

export default {
  async fetch(request, env) {
    if (env && env.ASSETS && env.ASSETS.fetch) {
      return env.ASSETS.fetch(request);
    }

    return fetch(request);
  },
};
