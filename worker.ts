import type { Env } from './app/lib/config/env';
import { verifyWebhookSignature } from './app/lib/auth/index';
import { validateEmail } from './app/lib/mail/mailboxvalidator';
import { apiRequest, log, securityEvent } from './app/lib/observability/logger';
import { err, methodNotAllowed, ok, payloadTooLarge, rateLimited, unsupportedMediaType } from './app/lib/response/index';
import { consumeRateLimit } from './app/lib/security/rate-limit';
import { isContentLengthTooLarge, isSameOriginRequest, newRequestId } from './app/lib/security/sanitize';
import { verifyTurnstileToken } from './app/lib/security/turnstile';
import { ContactSchema, ValidateEmailSchema } from './app/lib/validation/schemas';
import { processContact } from './platform/forms/contact-service';
import { createUploadContract } from './platform/media/media-service';
import { metricsSnapshot, recordRequest } from './platform/observability/metrics';

interface RuntimeEnv extends Env {
  ASSETS: Fetcher;
}

interface RequestContext {
  request: Request;
  env: RuntimeEnv;
  requestId: string;
  startedAt: number;
  url: URL;
  traceId: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);
const MAX_VALIDATE_BODY_BYTES = 8 * 1024;
const MAX_CONTACT_BODY_BYTES = 24 * 1024;
const MAX_CLIENT_ERROR_BODY_BYTES = 16 * 1024;

function withSecurityHeaders(response: Response, requestId: string, traceId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);
  headers.set('x-trace-id', traceId);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function hashIp(ip: string): string {
  return btoa(ip).slice(0, 32);
}

async function handleHealth(ctx: RequestContext): Promise<Response> {
  return ok(ctx.requestId, {
    ok: true,
    route: '/api/health',
    services: {
      assets: !!ctx.env.ASSETS,
      rateLimitKv: !!ctx.env.RATE_LIMIT,
      contactDb: !!ctx.env.CONTACT_DB,
      mediaBucket: !!ctx.env.MEDIA_BUCKET,
      contactQueue: !!ctx.env.CONTACT_QUEUE,
      turnstileConfigured: !!ctx.env.TURNSTILE_SECRET,
      mailboxValidatorConfigured: !!ctx.env.MAILBOXVALIDATOR_API_KEY,
      web3formsConfigured: !!ctx.env.WEB3FORMS_ACCESS_KEY,
    },
  });
}

async function handleMetrics(ctx: RequestContext): Promise<Response> {
  return ok(ctx.requestId, {
    route: '/api/metrics',
    metrics: metricsSnapshot(),
  });
}

async function handleValidate(ctx: RequestContext): Promise<Response> {
  if (ctx.request.method !== 'POST') return methodNotAllowed(ctx.requestId);
  if (isContentLengthTooLarge(ctx.request, MAX_VALIDATE_BODY_BYTES)) return payloadTooLarge(ctx.requestId);

  const contentType = ctx.request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return unsupportedMediaType(ctx.requestId);

  const clientIp = ctx.request.headers.get('cf-connecting-ip') ?? 'unknown';
  const burst = await consumeRateLimit(ctx.env, 'validate-ip-1m', clientIp, 12, 60);
  if (!burst.ok) return rateLimited(ctx.requestId, 60, 'Too many requests.');

  let payload: unknown;
  try {
    payload = await ctx.request.json();
  } catch {
    return err(ctx.requestId, 'invalid_json', 400, { message: 'Request body was invalid.' });
  }

  const parsed = ValidateEmailSchema.safeParse(payload);
  if (!parsed.success) {
    return err(ctx.requestId, 'validation_error', 400, {
      message: parsed.error.errors[0]?.message ?? 'Validation failed.',
    });
  }

  const turnstile = await verifyTurnstileToken(ctx.request, ctx.env.TURNSTILE_SECRET, parsed.data.turnstileToken);
  if (!turnstile.ok) {
    securityEvent('turnstile_failed', '/api/validate', clientIp, ctx.requestId);
    return err(ctx.requestId, turnstile.reason ?? 'turnstile_failed', 400, { message: 'Captcha verification failed.' });
  }

  const result = await validateEmail(ctx.env.MAILBOXVALIDATOR_API_KEY, parsed.data.email);
  return ok(ctx.requestId, {
    valid: result.ok,
    score: result.score,
    reason: result.reason,
    details: result.details,
  });
}

async function handleContact(ctx: RequestContext): Promise<Response> {
  if (ctx.request.method !== 'POST') return methodNotAllowed(ctx.requestId);
  if (isContentLengthTooLarge(ctx.request, MAX_CONTACT_BODY_BYTES)) return payloadTooLarge(ctx.requestId);

  if (!isSameOriginRequest(ctx.request)) {
    const clientIp = ctx.request.headers.get('cf-connecting-ip') ?? 'unknown';
    securityEvent('forbidden_origin', '/api/contact', clientIp, ctx.requestId);
    return err(ctx.requestId, 'forbidden_origin', 403, { message: 'Cross-site form submission is not allowed.' });
  }

  const contentType = ctx.request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return unsupportedMediaType(ctx.requestId);

  const clientIp = ctx.request.headers.get('cf-connecting-ip') ?? 'unknown';
  const burst = await consumeRateLimit(ctx.env, 'contact-ip-1m', clientIp, 5, 60);
  if (!burst.ok) return rateLimited(ctx.requestId, 60, 'Too many contact attempts.');

  let payload: unknown;
  try {
    payload = await ctx.request.json();
  } catch {
    return err(ctx.requestId, 'invalid_json', 400, { message: 'Request body was invalid.' });
  }

  const parsed = ContactSchema.safeParse(payload);
  if (!parsed.success) {
    return err(ctx.requestId, 'validation_error', 400, {
      message: parsed.error.errors[0]?.message ?? 'Validation failed.',
    });
  }

  if (parsed.data.website) {
    securityEvent('bot_detected', '/api/contact', clientIp, ctx.requestId);
    return err(ctx.requestId, 'bot_detected', 400, { message: 'Submission rejected.' });
  }

  const turnstile = await verifyTurnstileToken(ctx.request, ctx.env.TURNSTILE_SECRET, parsed.data.turnstileToken);
  if (!turnstile.ok) {
    return err(ctx.requestId, turnstile.reason ?? 'turnstile_failed', 400, { message: 'Captcha verification failed.' });
  }

  const emailResult = await validateEmail(ctx.env.MAILBOXVALIDATOR_API_KEY, parsed.data.email);
  if (!emailResult.ok && emailResult.reason !== 'rejected') {
    return err(ctx.requestId, emailResult.reason, emailResult.status, {
      message: 'Unable to validate email address right now.',
    });
  }

  const processed = await processContact(ctx.env, {
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    enquiry: parsed.data.enquiry,
    preferredDate: parsed.data.date,
    message: parsed.data.message,
    requestId: ctx.requestId,
    ipHash: hashIp(clientIp),
  });

  if (!processed.accepted) {
    return err(ctx.requestId, 'submission_failed', 502, { message: 'Form delivery failed.' });
  }

  return ok(ctx.requestId, {
    accepted: true,
    queued: processed.queued,
  });
}

async function handleAnalytics(ctx: RequestContext): Promise<Response> {
  if (ctx.request.method !== 'POST') return methodNotAllowed(ctx.requestId);
  const contentType = ctx.request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return unsupportedMediaType(ctx.requestId);

  const payload = (await ctx.request.json().catch(() => null)) as { event?: string; path?: string } | null;
  if (!payload?.event || !payload.path) {
    return err(ctx.requestId, 'invalid_payload', 400, { message: 'event and path are required.' });
  }

  log({ level: 'info', type: 'analytics_event', requestId: ctx.requestId, event: payload.event, path: payload.path });
  return ok(ctx.requestId, { accepted: true });
}

async function handleUploadUrl(ctx: RequestContext): Promise<Response> {
  if (ctx.request.method !== 'POST') return methodNotAllowed(ctx.requestId);
  if (!ctx.env.MEDIA_BUCKET) {
    return err(ctx.requestId, 'media_bucket_unavailable', 503, { message: 'Upload service is not configured.' });
  }

  const payload = (await ctx.request.json().catch(() => null)) as { key?: string; contentType?: string } | null;
  const contract = createUploadContract(payload?.key, payload?.contentType);
  if (!contract) {
    return err(ctx.requestId, 'invalid_upload_request', 400, { message: 'Invalid upload contract request.' });
  }

  return ok(ctx.requestId, contract);
}

async function handleWebhook(ctx: RequestContext): Promise<Response> {
  if (ctx.request.method !== 'POST') return methodNotAllowed(ctx.requestId);

  const signature = ctx.request.headers.get('x-webhook-signature') ?? '';
  const secret = ctx.env.WEBHOOK_SECRET ?? '';
  const raw = await ctx.request.text();

  if (!secret) return err(ctx.requestId, 'webhook_unavailable', 503, { message: 'Webhook secret is not configured.' });
  if (!(await verifyWebhookSignature(raw, signature, secret))) {
    return err(ctx.requestId, 'invalid_signature', 401, { message: 'Invalid webhook signature.' });
  }

  return ok(ctx.requestId, { accepted: true });
}

async function handleClientError(ctx: RequestContext): Promise<Response> {
  if (ctx.request.method !== 'POST') {
    return new Response(null, { status: 204 });
  }

  if (isContentLengthTooLarge(ctx.request, MAX_CLIENT_ERROR_BODY_BYTES)) {
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}

async function routeApi(ctx: RequestContext): Promise<Response | null> {
  const path = ctx.url.pathname;

  if (path === '/api/health' && (ctx.request.method === 'GET' || ctx.request.method === 'HEAD')) {
    return handleHealth(ctx);
  }

  if (path === '/api/metrics' && (ctx.request.method === 'GET' || ctx.request.method === 'HEAD')) {
    return handleMetrics(ctx);
  }

  if (path === '/api/validate') return handleValidate(ctx);
  if (path === '/api/contact') return handleContact(ctx);
  if (path === '/api/client-error') return handleClientError(ctx);
  if (path === '/api/analytics') return handleAnalytics(ctx);
  if (path === '/api/upload-url') return handleUploadUrl(ctx);
  if (path === '/api/webhook') return handleWebhook(ctx);

  return null;
}

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    const startedAt = Date.now();
    const requestId = newRequestId();
    const traceId = request.headers.get('cf-ray') ?? requestId;
    const url = new URL(request.url);

    const ctx: RequestContext = { request, env, requestId, startedAt, url, traceId };

    if (!ALLOWED_METHODS.has(request.method)) {
      return withSecurityHeaders(
        err(requestId, 'method_not_allowed', 405, { message: 'Method not allowed.' }, { allow: 'GET, HEAD, POST, OPTIONS' }),
        requestId,
        traceId,
      );
    }

    if (request.method === 'OPTIONS') {
      return withSecurityHeaders(
        new Response(null, {
          status: 204,
          headers: { allow: 'GET, HEAD, POST, OPTIONS' },
        }),
        requestId,
        traceId,
      );
    }

    let response: Response;

    try {
      const apiResponse = await routeApi(ctx);
      if (apiResponse) {
        response = apiResponse;
      } else {
        response = await env.ASSETS.fetch(request);
      }
    } catch (error) {
      log({
        level: 'error',
        type: 'unhandled_exception',
        requestId,
        route: url.pathname,
        error: error instanceof Error ? error.message : 'unknown',
      });
      response = err(requestId, 'internal_error', 500, { message: 'Internal server error.' });
    }

    const latencyMs = Date.now() - startedAt;
    recordRequest(url.pathname, response.status, latencyMs);

    apiRequest(
      request.method,
      url.pathname,
      response.status,
      request.headers.get('cf-connecting-ip') ?? 'unknown',
      requestId,
    );

    log({
      level: response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
      type: 'request_complete',
      requestId,
      traceId,
      route: url.pathname,
      method: request.method,
      status: response.status,
      latencyMs,
    });

    return withSecurityHeaders(response, requestId, traceId);
  },
};
