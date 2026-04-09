const MAILBOXVALIDATOR_ENDPOINT = 'https://api.mailboxvalidator.com/v2/validation/single';
const TURNSTILE_VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EMAIL_SYNTAX_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/validate') {
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

