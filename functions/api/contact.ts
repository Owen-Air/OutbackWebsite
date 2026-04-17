import type { Env } from '../../app/lib/config/env';
import { ContactSchema } from '../../app/lib/validation/schemas';
import {
  ok,
  err,
  rateLimited,
  methodNotAllowed,
  payloadTooLarge,
  unsupportedMediaType,
} from '../../app/lib/response/index';
import { consumeRateLimit } from '../../app/lib/security/rate-limit';
import { verifyTurnstileToken } from '../../app/lib/security/turnstile';
import {
  isContentLengthTooLarge,
  isSameOriginRequest,
} from '../../app/lib/security/sanitize';
import { validateEmail } from '../../app/lib/mail/mailboxvalidator';
import { submitContact } from '../../app/lib/mail/web3forms';
import { securityEvent, log } from '../../app/lib/observability/logger';

const MAX_BODY_BYTES = 24 * 1024;

function rid(data: Record<string, unknown>): string {
  return (data['requestId'] as string | undefined) ?? 'unknown';
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const requestId = rid(context.data as Record<string, unknown>);
  const { request, env } = context;
  const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';

  if (isContentLengthTooLarge(request, MAX_BODY_BYTES)) {
    return payloadTooLarge(requestId);
  }

  if (!isSameOriginRequest(request)) {
    securityEvent('forbidden_origin', '/api/contact', clientIp, requestId);
    return err(requestId, 'forbidden_origin', 403, {
      message: 'Cross-site form submission is not allowed.',
    });
  }

  // IP burst + hourly rate limits
  const burst = await consumeRateLimit(env, 'contact-ip-1m', clientIp, 5, 60);
  if (!burst.ok) {
    securityEvent('rate_limited', '/api/contact', clientIp, requestId, { bucket: 'ip-1m' });
    return rateLimited(requestId, 60, 'Too many contact attempts. Please wait a moment and try again.');
  }

  const hourly = await consumeRateLimit(env, 'contact-ip-1h', clientIp, 20, 3600);
  if (!hourly.ok) {
    securityEvent('rate_limited', '/api/contact', clientIp, requestId, { bucket: 'ip-1h' });
    return rateLimited(requestId, 3600, 'Too many contact attempts from this network. Please try again later.');
  }

  // Parse body
  let rawBody: unknown;
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return unsupportedMediaType(requestId);
    rawBody = await request.json();
  } catch {
    return err(requestId, 'invalid_json', 400, { message: 'Request body was invalid.' });
  }

  const parsed = ContactSchema.safeParse(rawBody);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    const reason = first?.path[0] ? `invalid_${String(first.path[0])}` : 'validation_error';
    return err(requestId, reason, 400, { message: first?.message ?? 'Validation failed.' });
  }

  const data = parsed.data;

  // Honeypot: populated = bot
  if (data.website) {
    securityEvent('bot_detected', '/api/contact', clientIp, requestId);
    return err(requestId, 'bot_detected', 400, { message: 'Submission rejected.' });
  }

  // Per-email rate limit
  const emailLimit = await consumeRateLimit(env, 'contact-email-10m', data.email, 3, 600);
  if (!emailLimit.ok) {
    securityEvent('rate_limited', '/api/contact', clientIp, requestId, { bucket: 'email-10m' });
    return rateLimited(requestId, 600, 'That email address has submitted too often. Please try again shortly.');
  }

  // Turnstile
  const turnstile = await verifyTurnstileToken(request, env.TURNSTILE_SECRET, data.turnstileToken);
  if (!turnstile.ok) {
    securityEvent('turnstile_failed', '/api/contact', clientIp, requestId);
    return err(requestId, turnstile.reason ?? 'turnstile_failed', 400, {
      message: 'Captcha verification failed.',
    });
  }

  // Email validation
  const emailResult = await validateEmail(env.MAILBOXVALIDATOR_API_KEY, data.email);
  if (!emailResult.ok) {
    return err(requestId, emailResult.reason, emailResult.status, {
      ...emailResult.details,
      turnstile: turnstile.skipped ? 'not-configured' : 'verified',
    });
  }

  // Store enquiry to D1 if provisioned
  if (env.CONTACT_DB) {
    try {
      await env.CONTACT_DB.prepare(
        `INSERT INTO contacts
           (name, email, phone, enquiry, preferred_date, message, ip_hash, request_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          data.name,
          data.email,
          data.phone ?? '',
          data.enquiry,
          data.date ?? '',
          data.message,
          btoa(clientIp).slice(0, 32),
          requestId,
          new Date().toISOString(),
        )
        .run();
    } catch {
      log({ level: 'error', type: 'db_write_failed', requestId, endpoint: '/api/contact' });
    }
  }

  // Queue for async processing if provisioned; otherwise submit inline
  if (env.CONTACT_QUEUE) {
    await env.CONTACT_QUEUE.send({
      type: 'contact_submission',
      payload: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? '',
        enquiry: data.enquiry,
        preferredDate: data.date ?? '',
        message: data.message,
        submittedAt: new Date().toISOString(),
        requestId,
        ipHash: btoa(clientIp).slice(0, 32),
      },
    });

    return ok(requestId, { queued: true }, {
      turnstile: turnstile.skipped ? 'not-configured' : 'verified',
    }, 'accepted');
  }

  // Inline submission fallback
  const submission = await submitContact(env.WEB3FORMS_ACCESS_KEY, {
    name: data.name,
    email: data.email,
    phone: data.phone ?? '',
    enquiry: data.enquiry,
    preferredDate: data.date ?? '',
    message: data.message,
  });

  if (!submission.ok) {
    return err(requestId, submission.reason, submission.status, submission.details);
  }

  return ok(requestId, undefined, {
    turnstile: turnstile.skipped ? 'not-configured' : 'verified',
  }, 'accepted');
};

export const onRequest: PagesFunction<Env> = (context) => {
  return methodNotAllowed(rid(context.data as Record<string, unknown>));
};
