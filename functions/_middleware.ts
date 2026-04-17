/**
 * Global Pages Functions middleware.
 * Runs before every function route — attaches a request ID, enforces
 * an HTTP method allowlist, logs API calls, and injects X-Request-Id
 * into every function response.
 */
import type { Env } from '../app/lib/config/env';
import { newRequestId } from '../app/lib/security/sanitize';
import { apiRequest } from '../app/lib/observability/logger';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);

export const onRequest: PagesFunction<Env> = async (context) => {
  const requestId = newRequestId();
  const url = new URL(context.request.url);

  // Reject exotic HTTP methods before any business logic runs
  if (!ALLOWED_METHODS.has(context.request.method)) {
    return new Response(null, {
      status: 405,
      headers: { allow: 'GET, HEAD, POST, OPTIONS', 'x-request-id': requestId },
    });
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'GET, HEAD, POST, OPTIONS', 'x-request-id': requestId },
    });
  }

  // Make the requestId available to downstream functions
  (context.data as Record<string, unknown>)['requestId'] = requestId;

  const response = await context.next();

  // Attach request ID to every function response
  const headers = new Headers(response.headers);
  headers.set('x-request-id', requestId);

  if (url.pathname.startsWith('/api/')) {
    apiRequest(
      context.request.method,
      url.pathname,
      response.status,
      context.request.headers.get('cf-connecting-ip') ?? 'unknown',
      requestId,
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
