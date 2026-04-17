import type { Env } from '../../app/lib/config/env';
import { ValidateEmailSchema } from '../../app/lib/validation/schemas';
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
import { isContentLengthTooLarge } from '../../app/lib/security/sanitize';
import { validateEmail } from '../../app/lib/mail/mailboxvalidator';
import { securityEvent } from '../../app/lib/observability/logger';

const MAX_BODY_BYTES = 8 * 1024;

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

  // Rate limiting
  const burst = await consumeRateLimit(env, 'validate-ip-1m', clientIp, 12, 60);
  if (!burst.ok) {
    securityEvent('rate_limited', '/api/validate', clientIp, requestId, { bucket: 'ip-1m' });
    return rateLimited(requestId, 60, 'Too many requests. Please wait a moment before trying again.');
  }

  // Parse body
  let rawBody: unknown;
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      rawBody = await request.json();
    } else if (
      ct.includes('multipart/form-data') ||
      ct.includes('application/x-www-form-urlencoded')
    ) {
      const form = await request.formData();
      rawBody = {
        email: form.get('email'),
        turnstileToken:
          form.get('cf-turnstile-response') ?? form.get('turnstileToken'),
      };
    } else {
      return unsupportedMediaType(requestId);
    }
  } catch {
    return err(requestId, 'invalid_body', 400, { message: 'Request body was invalid.' });
  }

  const parsed = ValidateEmailSchema.safeParse(rawBody);
  if (!parsed.success) {
    return err(requestId, 'invalid_email', 400, {
      message: parsed.error.errors[0]?.message ?? 'Validation failed.',
    });
  }

  const { email, turnstileToken } = parsed.data;

  const emailLimit = await consumeRateLimit(env, 'validate-email-10m', email, 10, 600);
  if (!emailLimit.ok) {
    securityEvent('rate_limited', '/api/validate', clientIp, requestId, { bucket: 'email-10m' });
    return rateLimited(requestId, 600, 'That email has been checked too often. Please try again shortly.');
  }

  const turnstile = await verifyTurnstileToken(request, env.TURNSTILE_SECRET, turnstileToken);
  if (!turnstile.ok) {
    securityEvent('turnstile_failed', '/api/validate', clientIp, requestId);
    return err(requestId, turnstile.reason ?? 'turnstile_failed', 400, {
      message: 'Captcha verification failed.',
    });
  }

  const result = await validateEmail(env.MAILBOXVALIDATOR_API_KEY, email);

  return ok(requestId, {
    valid: result.ok,
    score: result.score,
    reason: result.reason,
    details: {
      ...result.details,
      turnstile: turnstile.skipped ? 'not-configured' : 'verified',
    },
  });
};

export const onRequest: PagesFunction<Env> = (context) => {
  return methodNotAllowed(rid(context.data as Record<string, unknown>));
};
