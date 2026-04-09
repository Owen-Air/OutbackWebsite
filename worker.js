const MAILBOXVALIDATOR_ENDPOINT = 'https://api.mailboxvalidator.com/v2/validation/single';
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

  let payload;

  try {
    payload = await request.json();
  } catch {
    return json(
      {
        valid: false,
        reason: 'invalid_json',
        mailboxvalidator_score: null,
        details: {
          message: 'Request body must be valid JSON.'
        }
      },
      400
    );
  }

  const email = typeof payload?.email === 'string' ? payload.email.trim() : '';

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
    details
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

