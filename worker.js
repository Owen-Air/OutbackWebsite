// Clean slate Worker: only serves static assets and favicon, ready for env bindings
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

