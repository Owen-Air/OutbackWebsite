const MAILBOXVALIDATOR_ENDPOINT = 'https://api.mailboxvalidator.com/v2/validation/single';
const TURNSTILE_VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EMAIL_SYNTAX_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_PREFIX = 'rl:v1';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store'
    }
  });
}

function asBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', 'yes', '1'].includes(normalized)) {
      return true;
    }

    if (['false', 'no', '0'].includes(normalized)) {
      return false;
    }
  }

  return value;
}

function buildDetails(payload) {
  return {
    is_syntax: asBoolean(payload?.is_syntax),
    is_domain: asBoolean(payload?.is_domain),
    is_disposable: asBoolean(payload?.is_disposable),
    status: asBoolean(payload?.status),
    mailboxvalidator_status: payload?.mailboxvalidator_status ?? null,
    credits_available: payload?.credits_available ?? null,
    error_code: payload?.error_code ?? null,
    error_message: payload?.error_message ?? null
  };
}

function sanitizeRateKeyPart(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._:-]/g, '_')
    .slice(0, 120);
}

async function consumeRateLimit(env, bucket, subject, limit, windowSeconds) {
  if (!env || !env.RATE_LIMIT) {
    return { ok: true };
  }

  const key = `${RATE_LIMIT_PREFIX}:${bucket}:${sanitizeRateKeyPart(subject)}`;
  let count = 0;

  try {
    const existing = await env.RATE_LIMIT.get(key);
    count = Number.parseInt(existing || '0', 10);
    if (!Number.isFinite(count) || count < 0) {
      count = 0;
    }
  } catch {
    return { ok: true };
  }

  if (count >= limit) {
    return { ok: false, retryAfter: windowSeconds };
  }

  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return { ok: true };
}

async function readEmailFromRequest(request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await request.json();
    return typeof payload?.email === 'string' ? payload.email.trim() : '';
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await request.formData();
    const email = formData.get('email');
    return typeof email === 'string' ? email.trim() : '';
  }

  throw new Error('unsupported_content_type');
}

async function readValidationPayload(request) {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await request.json();
    return {
      email: typeof payload?.email === 'string' ? payload.email.trim() : '',
      turnstileToken: typeof payload?.turnstileToken === 'string' ? payload.turnstileToken.trim() : ''
    };
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await request.formData();
    const email = formData.get('email');
    const turnstileToken = formData.get('cf-turnstile-response') || formData.get('turnstileToken');
    return {
      email: typeof email === 'string' ? email.trim() : '',
      turnstileToken: typeof turnstileToken === 'string' ? turnstileToken.trim() : ''
    };
  }

  throw new Error('unsupported_content_type');
}

async function verifyTurnstileToken(request, env, token) {
  if (!env.TURNSTILE_SECRET) {
    return { ok: true, skipped: true };
  }

  if (!token) {
    return { ok: false, reason: 'missing_turnstile' };
  }

  try {
    const formData = new FormData();
    formData.set('secret', env.TURNSTILE_SECRET);
    formData.set('response', token);

    const clientIp = request.headers.get('cf-connecting-ip');
    if (clientIp) {
      formData.set('remoteip', clientIp);
    }

    const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      return { ok: false, reason: 'turnstile_failed' };
    }

    const payload = await response.json();
    return payload?.success ? { ok: true } : { ok: false, reason: 'turnstile_failed' };
  } catch {
    return { ok: false, reason: 'turnstile_failed' };
  }
}

async function handleValidate(request, env) {
  if (request.method !== 'POST') {
    return json(
      {
        valid: false,
        reason: 'method_not_allowed',
        mailboxvalidator_score: null,
        details: {
          message: 'Method not allowed.'
        }
      },
      405
    );
  }

  const apiKey = env.MAILBOXVALIDATOR_API_KEY;

  if (!apiKey || apiKey === '__SET_THIS_OUTSIDE_SOURCE_CONTROL__') {
    return json(
      {
        valid: false,
        reason: 'validation_service_unavailable',
        mailboxvalidator_score: null,
        details: {
          message: 'MailboxValidator API key is not configured.'
        }
      },
      500
    );
  }

  let validationPayload;

  try {
    validationPayload = await readValidationPayload(request);
  } catch {
    return json(
      {
        valid: false,
        reason: 'invalid_json',
        mailboxvalidator_score: null,
        details: {
          message: 'Request body must include an email address.'
        }
      },
      400
    );
  }

  const { email, turnstileToken } = validationPayload;
  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

  const ipBurstLimit = await consumeRateLimit(env, 'validate-ip-1m', clientIp, 12, 60);
  if (!ipBurstLimit.ok) {
    return json(
      {
        valid: false,
        reason: 'rate_limited',
        mailboxvalidator_score: null,
        details: {
          message: 'Too many requests. Please wait a moment before trying again.'
        }
      },
      429
    );
  }

  const ipHourlyLimit = await consumeRateLimit(env, 'validate-ip-1h', clientIp, 180, 3600);
  if (!ipHourlyLimit.ok) {
    return json(
      {
        valid: false,
        reason: 'rate_limited',
        mailboxvalidator_score: null,
        details: {
          message: 'Too many requests from this network. Please try again later.'
        }
      },
      429
    );
  }

  if (email) {
    const emailLimit = await consumeRateLimit(env, 'validate-email-10m', email, 10, 600);
    if (!emailLimit.ok) {
      return json(
        {
          valid: false,
          reason: 'rate_limited',
          mailboxvalidator_score: null,
          details: {
            message: 'That email has been checked too often. Please try again shortly.'
          }
        },
        429
      );
    }
  }

  const turnstileResult = await verifyTurnstileToken(request, env, turnstileToken);
  if (!turnstileResult.ok) {
    return json(
      {
        valid: false,
        reason: turnstileResult.reason,
        mailboxvalidator_score: null,
        details: {
          message: 'Captcha verification failed.'
        }
      },
      400
    );
  }

  if (!email) {
    return json(
      {
        valid: false,
        reason: 'missing_email',
        mailboxvalidator_score: null,
        details: {
          message: 'An email address is required.'
        }
      },
      400
    );
  }

  if (!EMAIL_SYNTAX_REGEX.test(email)) {
    return json(
      {
        valid: false,
        reason: 'invalid_syntax',
        mailboxvalidator_score: null,
        details: {
          email,
          is_syntax: false
        }
      },
      400
    );
  }

  const url = new URL(MAILBOXVALIDATOR_ENDPOINT);
  url.searchParams.set('email', email);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('format', 'json');

  let mailboxvalidatorPayload;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      }
    });

    if (!response.ok) {
      return json(
        {
          valid: false,
          reason: 'validation_service_error',
          mailboxvalidator_score: null,
          details: {
            status_code: response.status,
            message: 'MailboxValidator request failed.'
          }
        },
        502
      );
    }

    mailboxvalidatorPayload = await response.json();
  } catch {
    return json(
      {
        valid: false,
        reason: 'validation_service_error',
        mailboxvalidator_score: null,
        details: {
          message: 'MailboxValidator request failed.'
        }
      },
      502
    );
  }

  const details = buildDetails(mailboxvalidatorPayload);
  const validationPassed =
    details.is_syntax === true &&
    details.is_domain !== false &&
    details.is_disposable !== true &&
    details.status === true;

  return json({
    valid: validationPassed,
    reason: validationPassed ? 'accepted' : 'rejected',
    mailboxvalidator_score: mailboxvalidatorPayload?.score ?? null,
    details: {
      ...details,
      turnstile: turnstileResult.skipped ? 'not-configured' : 'verified'
    }
  });
}

async function handleClientError(request, env) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 204 });
  }

  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
  const limit = await consumeRateLimit(env, 'client-error-ip-1m', clientIp, 60, 60);
  if (!limit.ok) {
    return new Response(null, { status: 202 });
  }

  try {
    const payload = await request.json();
    console.error('client-error', {
      ip: clientIp,
      type: payload?.type || 'unknown',
      href: payload?.href || '',
      message: payload?.payload?.message || ''
    });
  } catch {
    // Ignore malformed client logging payloads.
  }

  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
    const hasAssetsBinding = !!(env && env.ASSETS && env.ASSETS.fetch);

    if (url.pathname === '/api/validate') {
      return handleValidate(request, env);
    }

    if (url.pathname === '/api/client-error') {
      return handleClientError(request, env);
    }

    // Redirect .ico requests to the packaged PNG favicon asset.
    if (url.pathname === '/favicon.ico') {
      return Response.redirect(new URL('/favicon48x48.png', url.origin), 302);
    }

    if (
      url.pathname === '/.well-known/traffic-advice' &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      return new Response(null, {
        status: 204,
        headers: {
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    if (
      url.pathname === '/.well-known/security.txt' &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      const securityTxt = [
        'Contact: mailto:outbackiom@gmail.com',
        'Expires: 2027-04-10T00:00:00.000Z',
        'Preferred-Languages: en',
        'Canonical: https://theoutback.im/.well-known/security.txt'
      ].join('\n');

      return new Response(request.method === 'HEAD' ? null : securityTxt, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=UTF-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    const legalRouteTargets = {
      '/privacy': '/privacy.html',
      '/cookie-policy': '/cookie-policy.html',
      '/terms': '/terms.html'
    };
    const legalTarget = legalRouteTargets[url.pathname];

    if (!hasAssetsBinding) {
      if (legalTarget) {
        const rewritten = new Request(new URL(legalTarget, url.origin).toString(), request);
        return fetch(rewritten);
      }

      if (url.pathname === '/404.html') {
        const origin404 = await fetch(request);
        const html = await origin404.text();
        return new Response(html, {
          status: 404,
          headers: {
            'content-type': 'text/html; charset=UTF-8',
            'cache-control': 'public, max-age=3600, must-revalidate'
          }
        });
      }

      const isGetOrHead = request.method === 'GET' || request.method === 'HEAD';
      const hasFileExtension = /\/[^/]+\.[a-z0-9]+$/i.test(url.pathname);
      const knownRoutes = new Set([
        '/',
        '/spaces',
        '/events',
        '/menu',
        '/team',
        '/history',
        '/find-us',
        '/contact',
        '/privacy',
        '/cookie-policy',
        '/terms',
        '/thankyou.html',
        '/robots.txt',
        '/sitemap.xml',
        '/.well-known/security.txt',
        '/api/client-error',
        '/api/validate'
      ]);

      if (isGetOrHead && !hasFileExtension && !knownRoutes.has(url.pathname)) {
        return new Response('Not Found', {
          status: 404,
          headers: {
            'content-type': 'text/plain; charset=UTF-8',
            'cache-control': 'public, max-age=300, must-revalidate'
          }
        });
      }

      return fetch(request);
    }

    if (hasAssetsBinding) {
      if (legalTarget) {
        const rewritten = new Request(new URL(legalTarget, url.origin).toString(), request);
        return env.ASSETS.fetch(rewritten);
      }

      if (url.pathname === '/404.html') {
        const notFoundAsset = await env.ASSETS.fetch(request);
        return new Response(notFoundAsset.body, {
          status: 404,
          headers: notFoundAsset.headers
        });
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (
        request.method === 'GET' &&
        wantsHtml &&
        (assetResponse.status === 404 || assetResponse.status >= 500)
      ) {
        const notFoundRequest = new Request(new URL('/404.html', url.origin).toString(), request);
        const notFoundAsset = await env.ASSETS.fetch(notFoundRequest);
        return new Response(notFoundAsset.body, {
          status: 404,
          headers: notFoundAsset.headers
        });
      }

      return assetResponse;
    }

    return fetch(request);
  },
};

