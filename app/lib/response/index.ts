export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface ApiSuccess<T = unknown> {
  success: true;
  data?: T;
  meta: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  meta: ApiMeta;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;

function buildMeta(requestId: string): ApiMeta {
  return {
    requestId,
    timestamp: new Date().toISOString(),
  };
}

function messageFromDetails(details: Record<string, unknown> | undefined, fallback: string): string {
  const candidate = details?.['message'];
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate
    : fallback;
}

function build<T>(requestId: string, body: ApiResponse<T>, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
      ...extra,
    },
  });
}

export function ok<T>(
  requestId: string,
  data?: T,
  _details?: Record<string, unknown>,
  _reason?: string,
): Response {
  const body: ApiSuccess<T> = {
    success: true,
    meta: buildMeta(requestId),
  };
  if (typeof data !== 'undefined') {
    body.data = data;
  }
  return build(requestId, body, 200);
}

export function err(
  requestId: string,
  code: string,
  status: number,
  details?: Record<string, unknown>,
  extra: Record<string, string> = {},
): Response {
  return build(
    requestId,
    {
      success: false,
      error: {
        code,
        message: messageFromDetails(details, 'Request failed.'),
      },
      meta: buildMeta(requestId),
    },
    status,
    extra,
  );
}

export function rateLimited(requestId: string, retryAfter: number, message: string): Response {
  return err(requestId, 'rate_limited', 429, { message }, { 'retry-after': String(retryAfter) });
}

export function methodNotAllowed(requestId: string): Response {
  return err(requestId, 'method_not_allowed', 405, { message: 'Method not allowed.' });
}

export function payloadTooLarge(requestId: string): Response {
  return err(requestId, 'payload_too_large', 413, { message: 'Request body is too large.' });
}

export function unsupportedMediaType(requestId: string): Response {
  return err(requestId, 'unsupported_content_type', 415, { message: 'Content-Type must be application/json.' });
}
