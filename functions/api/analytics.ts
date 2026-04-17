import type { Env } from '../../app/lib/config/env';
import { err, methodNotAllowed, ok, payloadTooLarge, unsupportedMediaType } from '../../app/lib/response/index';
import { isContentLengthTooLarge } from '../../app/lib/security/sanitize';
import { track } from '../../app/lib/analytics/edge';

const MAX_ANALYTICS_BODY_BYTES = 8 * 1024;

function rid(data: Record<string, unknown>): string {
  return (data['requestId'] as string | undefined) ?? 'unknown';
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const requestId = rid(context.data as Record<string, unknown>);

  if (isContentLengthTooLarge(context.request, MAX_ANALYTICS_BODY_BYTES)) {
    return payloadTooLarge(requestId);
  }

  const ct = context.request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return unsupportedMediaType(requestId);

  let body: { event?: string; path?: string; meta?: Record<string, unknown> };
  try {
    body = (await context.request.json()) as { event?: string; path?: string; meta?: Record<string, unknown> };
  } catch {
    return err(requestId, 'invalid_json', 400);
  }

  if (!body.event || !body.path) {
    return err(requestId, 'invalid_payload', 400, { message: 'event and path are required.' });
  }

  track({ event: body.event, path: body.path, ts: new Date().toISOString(), meta: body.meta });
  return ok(requestId, undefined, undefined, 'accepted');
};

export const onRequest: PagesFunction<Env> = (context) =>
  methodNotAllowed(rid(context.data as Record<string, unknown>));
