const MAILBOXVALIDATOR_ENDPOINT = 'https://api.mailboxvalidator.com/v2/validation/single';
const TURNSTILE_VERIFY_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const WEB3FORMS_SUBMIT_ENDPOINT = 'https://api.web3forms.com/submit';
const EMAIL_SYNTAX_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_PREFIX = 'rl:v1';
const MAX_VALIDATE_BODY_BYTES = 8 * 1024;
const MAX_CONTACT_BODY_BYTES = 24 * 1024;
const MAX_CLIENT_ERROR_BODY_BYTES = 16 * 1024;
const MAX_CLIENT_ERROR_LOG_FIELD = 300;
const ENQUIRY_TYPES = new Set([
  'general',
  'table',
  'private-hire',
  'group',
  'birthday',
  'corporate',
  'other'
]);

function newRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

function jsonWithId(requestId, data, status = 200, extraHeaders = {}) {
  return json(data, status, { 'x-request-id': requestId, ...extraHeaders });
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

function sanitizeSingleLine(value, maxLength) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(value, maxLength) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

function sanitizePhone(value) {
  return sanitizeSingleLine(value, 40).replace(/[^0-9+()\-\s]/g, '');
}

function isSameOriginRequest(request) {
  const requestOrigin = new URL(request.url).origin;
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    return originHeader === requestOrigin;
  }

  const refererHeader = request.headers.get('referer');
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

function isContentLengthTooLarge(request, maxBytes) {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) {
    return false;
  }

  const parsedLength = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(parsedLength) || parsedLength < 0) {
    return false;
  }

  return parsedLength > maxBytes;
}

function sanitizeLogField(value, maxLength = MAX_CLIENT_ERROR_LOG_FIELD) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
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

async function readContactPayload(request) {
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error('unsupported_content_type');
  }

  const payload = await request.json();

  return {
    name: sanitizeSingleLine(payload?.name, 80),
    email: sanitizeSingleLine(payload?.email, 254).toLowerCase(),
    phone: sanitizePhone(payload?.phone),
    enquiry: sanitizeSingleLine(payload?.enquiry, 40).toLowerCase(),
    preferredDate: sanitizeSingleLine(payload?.date, 10),
    message: sanitizeMultiline(payload?.message, 2000),
    website: sanitizeSingleLine(payload?.website, 120),
    turnstileToken: sanitizeSingleLine(payload?.turnstileToken, 2048)
  };
}

function validateContactPayload(payload) {
  if (payload.website) {
    return {
      ok: false,
      status: 400,
      reason: 'bot_detected',
      details: {
        message: 'Submission rejected.'
      }
    };
  }

  if (!payload.name) {
    return {
      ok: false,
      status: 400,
      reason: 'missing_name',
      details: {
        message: 'A name is required.'
      }
    };
  }

  if (payload.name.length < 2) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_name',
      details: {
        message: 'Name must be at least 2 characters.'
      }
    };
  }

  if (!payload.email) {
    return {
      ok: false,
      status: 400,
      reason: 'missing_email',
      details: {
        message: 'An email address is required.'
      }
    };
  }

  if (payload.phone && !/^[0-9+()\-\s]{7,40}$/.test(payload.phone)) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_phone',
      details: {
        message: 'Phone number format is invalid.'
      }
    };
  }

  if (!ENQUIRY_TYPES.has(payload.enquiry)) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_enquiry',
      details: {
        message: 'Enquiry type is invalid.'
      }
    };
  }

  if (payload.preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(payload.preferredDate)) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_date',
      details: {
        message: 'Preferred date must use YYYY-MM-DD.'
      }
    };
  }

  if (!payload.message) {
    return {
      ok: false,
      status: 400,
      reason: 'missing_message',
      details: {
        message: 'A message is required.'
      }
    };
  }

  if (payload.message.length < 10) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_message',
      details: {
        message: 'Message must be at least 10 characters.'
      }
    };
  }

  return { ok: true };
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

async function evaluateEmailAddress(env, email) {
  const apiKey = env.MAILBOXVALIDATOR_API_KEY;

  if (!apiKey || apiKey === '__SET_THIS_OUTSIDE_SOURCE_CONTROL__') {
    return {
      ok: false,
      status: 500,
      reason: 'validation_service_unavailable',
      mailboxvalidator_score: null,
      details: {
        message: 'MailboxValidator API key is not configured.'
      }
    };
  }

  if (!email) {
    return {
      ok: false,
      status: 400,
      reason: 'missing_email',
      mailboxvalidator_score: null,
      details: {
        message: 'An email address is required.'
      }
    };
  }

  if (!EMAIL_SYNTAX_REGEX.test(email)) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_syntax',
      mailboxvalidator_score: null,
      details: {
        email,
        is_syntax: false
      }
    };
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
      return {
        ok: false,
        status: 502,
        reason: 'validation_service_error',
        mailboxvalidator_score: null,
        details: {
          status_code: response.status,
          message: 'MailboxValidator request failed.'
        }
      };
    }

    mailboxvalidatorPayload = await response.json();
  } catch {
    return {
      ok: false,
      status: 502,
      reason: 'validation_service_error',
      mailboxvalidator_score: null,
      details: {
        message: 'MailboxValidator request failed.'
      }
    };
  }

  const details = buildDetails(mailboxvalidatorPayload);
  const validationPassed =
    details.is_syntax === true &&
    details.is_domain !== false &&
    details.is_disposable !== true &&
    details.status === true;

  return {
    ok: validationPassed,
    status: validationPassed ? 200 : 400,
    reason: validationPassed ? 'accepted' : 'rejected',
    mailboxvalidator_score: mailboxvalidatorPayload?.score ?? null,
    details
  };
}

async function submitContactForm(env, payload) {
  const accessKey = env.WEB3FORMS_ACCESS_KEY;

  if (!accessKey || accessKey === '__SET_THIS_OUTSIDE_SOURCE_CONTROL__') {
    return {
      ok: false,
      status: 500,
      reason: 'form_service_unavailable',
      details: {
        message: 'Contact form service is not configured.'
      }
    };
  }

  const formData = new FormData();
  formData.set('access_key', accessKey);
  formData.set('subject', 'New enquiry from The Outback website');
  formData.set('from_name', 'The Outback website');
  formData.set('name', payload.name);
  formData.set('email', payload.email);
  formData.set('replyto', payload.email);
  formData.set('cc', payload.email);
  formData.set('phone', payload.phone || 'Not provided');
  formData.set('enquiry', payload.enquiry);
  formData.set('date', payload.preferredDate || 'Not provided');
  formData.set('message', payload.message);

  try {
    const response = await fetch(WEB3FORMS_SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json'
      },
      body: formData
    });

    const responseText = await response.text();
    let responsePayload = null;

    try {
      responsePayload = responseText ? JSON.parse(responseText) : null;
    } catch {
      responsePayload = null;
    }

    if (!response.ok || !responsePayload?.success) {
      return {
        ok: false,
        status: 502,
        reason: 'form_service_error',
        details: {
          message: 'Form delivery failed.'
        }
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 502,
      reason: 'form_service_error',
      details: {
        message: 'Form delivery failed.'
      }
    };
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

  if (isContentLengthTooLarge(request, MAX_VALIDATE_BODY_BYTES)) {
    return json(
      {
        valid: false,
        reason: 'payload_too_large',
        mailboxvalidator_score: null,
        details: {
          message: 'Request body is too large.'
        }
      },
      413
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

  const requestId = newRequestId();

  const ipBurstLimit = await consumeRateLimit(env, 'validate-ip-1m', clientIp, 12, 60);
  if (!ipBurstLimit.ok) {
    console.log('security-event', { type: 'rate_limited', endpoint: '/api/validate', bucket: 'ip-1m', ip: clientIp });
    return jsonWithId(requestId,
      {
        valid: false,
        reason: 'rate_limited',
        mailboxvalidator_score: null,
        details: {
          message: 'Too many requests. Please wait a moment before trying again.'
        }
      },
      429,
      { 'retry-after': '60' }
    );
  }

  const ipHourlyLimit = await consumeRateLimit(env, 'validate-ip-1h', clientIp, 180, 3600);
  if (!ipHourlyLimit.ok) {
    console.log('security-event', { type: 'rate_limited', endpoint: '/api/validate', bucket: 'ip-1h', ip: clientIp });
    return jsonWithId(requestId,
      {
        valid: false,
        reason: 'rate_limited',
        mailboxvalidator_score: null,
        details: {
          message: 'Too many requests from this network. Please try again later.'
        }
      },
      429,
      { 'retry-after': '3600' }
    );
  }

  if (email) {
    const emailLimit = await consumeRateLimit(env, 'validate-email-10m', email, 10, 600);
    if (!emailLimit.ok) {
      console.log('security-event', { type: 'rate_limited', endpoint: '/api/validate', bucket: 'email-10m', ip: clientIp });
      return jsonWithId(requestId,
        {
          valid: false,
          reason: 'rate_limited',
          mailboxvalidator_score: null,
          details: {
            message: 'That email has been checked too often. Please try again shortly.'
          }
        },
        429,
        { 'retry-after': '600' }
      );
    }
  }

  const turnstileResult = await verifyTurnstileToken(request, env, turnstileToken);
  if (!turnstileResult.ok) {
    console.log('security-event', { type: 'turnstile_failed', endpoint: '/api/validate', ip: clientIp });
    return jsonWithId(requestId,
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

  const emailResult = await evaluateEmailAddress(env, email);

  return jsonWithId(requestId, {
    valid: emailResult.ok,
    reason: emailResult.reason,
    mailboxvalidator_score: emailResult.mailboxvalidator_score,
    details: {
      ...emailResult.details,
      turnstile: turnstileResult.skipped ? 'not-configured' : 'verified'
    }
  }, emailResult.reason === 'rejected' ? 200 : emailResult.status);
}

async function handleContact(request, env) {
  if (request.method !== 'POST') {
    return json(
      {
        success: false,
        reason: 'method_not_allowed',
        details: {
          message: 'Method not allowed.'
        }
      },
      405
    );
  }

  if (isContentLengthTooLarge(request, MAX_CONTACT_BODY_BYTES)) {
    return json(
      {
        success: false,
        reason: 'payload_too_large',
        details: {
          message: 'Request body is too large.'
        }
      },
      413
    );
  }

  if (!isSameOriginRequest(request)) {
    console.log('security-event', { type: 'forbidden_origin', endpoint: '/api/contact', ip: clientIp });
    return jsonWithId(contactRequestId,
      {
        success: false,
        reason: 'forbidden_origin',
        details: {
          message: 'Cross-site form submission is not allowed.'
        }
      },
      403
    );
  }

  let payload;

  try {
    payload = await readContactPayload(request);
  } catch {
    return json(
      {
        success: false,
        reason: 'invalid_json',
        details: {
          message: 'Request body was invalid.'
        }
      },
      400
    );
  }

  const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

  const contactRequestId = newRequestId();

  const ipBurstLimit = await consumeRateLimit(env, 'contact-ip-1m', clientIp, 5, 60);
  if (!ipBurstLimit.ok) {
    console.log('security-event', { type: 'rate_limited', endpoint: '/api/contact', bucket: 'ip-1m', ip: clientIp });
    return jsonWithId(contactRequestId,
      {
        success: false,
        reason: 'rate_limited',
        details: {
          message: 'Too many contact attempts. Please wait a moment and try again.'
        }
      },
      429,
      { 'retry-after': '60' }
    );
  }

  const ipHourlyLimit = await consumeRateLimit(env, 'contact-ip-1h', clientIp, 20, 3600);
  if (!ipHourlyLimit.ok) {
    console.log('security-event', { type: 'rate_limited', endpoint: '/api/contact', bucket: 'ip-1h', ip: clientIp });
    return jsonWithId(contactRequestId,
      {
        success: false,
        reason: 'rate_limited',
        details: {
          message: 'Too many contact attempts from this network. Please try again later.'
        }
      },
      429,
      { 'retry-after': '3600' }
    );
  }

  if (payload.email) {
    const emailLimit = await consumeRateLimit(env, 'contact-email-10m', payload.email, 3, 600);
    if (!emailLimit.ok) {
      console.log('security-event', { type: 'rate_limited', endpoint: '/api/contact', bucket: 'email-10m', ip: clientIp });
      return jsonWithId(contactRequestId,
        {
          success: false,
          reason: 'rate_limited',
          details: {
            message: 'That email address has submitted too often. Please try again shortly.'
          }
        },
        429,
        { 'retry-after': '600' }
      );
    }
  }

  const payloadValidation = validateContactPayload(payload);
  if (!payloadValidation.ok) {
    if (payloadValidation.reason === 'bot_detected') {
      console.log('security-event', { type: 'bot_detected', endpoint: '/api/contact', ip: clientIp });
    }
    return jsonWithId(contactRequestId,
      {
        success: false,
        reason: payloadValidation.reason,
        details: payloadValidation.details
      },
      payloadValidation.status
    );
  }

  const turnstileResult = await verifyTurnstileToken(request, env, payload.turnstileToken);
  if (!turnstileResult.ok) {
    console.log('security-event', { type: 'turnstile_failed', endpoint: '/api/contact', ip: clientIp });
    return jsonWithId(contactRequestId,
      {
        success: false,
        reason: turnstileResult.reason,
        details: {
          message: 'Captcha verification failed.'
        }
      },
      400
    );
  }

  const emailResult = await evaluateEmailAddress(env, payload.email);
  if (!emailResult.ok) {
    return json(
      {
        success: false,
        reason: emailResult.reason,
        details: {
          ...emailResult.details,
          turnstile: turnstileResult.skipped ? 'not-configured' : 'verified'
        }
      },
      emailResult.status
    );
  }

  const submissionResult = await submitContactForm(env, payload);
  if (!submissionResult.ok) {
    return jsonWithId(contactRequestId,
      {
        success: false,
        reason: submissionResult.reason,
        details: submissionResult.details
      },
      submissionResult.status
    );
  }

  return jsonWithId(contactRequestId, {
    success: true,
    reason: 'accepted',
    details: {
      turnstile: turnstileResult.skipped ? 'not-configured' : 'verified'
    }
  });
}

async function handleClientError(request, env) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 204 });
  }

  if (isContentLengthTooLarge(request, MAX_CLIENT_ERROR_BODY_BYTES)) {
    return new Response(null, { status: 413 });
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
      type: sanitizeLogField(payload?.type || 'unknown', 80),
      href: sanitizeLogField(payload?.href || '', 240),
      message: sanitizeLogField(payload?.payload?.message || '')
    });
  } catch {
    // Ignore malformed client logging payloads.
  }

  return new Response(null, { status: 204 });
}

function healthSummary(env) {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    services: {
      assets: !!(env && env.ASSETS && env.ASSETS.fetch),
      rateLimitKv: !!(env && env.RATE_LIMIT),
      turnstileConfigured: !!(env && env.TURNSTILE_SECRET),
      mailboxValidatorConfigured: !!(env && env.MAILBOXVALIDATOR_API_KEY),
      web3formsConfigured: !!(env && env.WEB3FORMS_ACCESS_KEY)
    }
  };
}

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const wantsHtml = (request.headers.get('accept') || '').includes('text/html');
    const hasAssetsBinding = !!(env && env.ASSETS && env.ASSETS.fetch);

    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, POST, OPTIONS' } });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { allow: 'GET, HEAD, POST, OPTIONS' } });
    }

    if (url.pathname === '/api/validate') {
      return handleValidate(request, env);
    }

    if (url.pathname === '/api/contact') {
      return handleContact(request, env);
    }

    if (url.pathname === '/api/client-error') {
      return handleClientError(request, env);
    }

    if (url.pathname === '/api/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ ok: false, reason: 'method_not_allowed' }, 405);
      }

      const health = healthSummary(env);
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'cache-control': 'no-store'
          }
        });
      }

      return json(health, 200);
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
        '/api/contact',
        '/api/health',
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

