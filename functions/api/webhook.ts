import type { Env } from '../../app/lib/config/env';
import { err, methodNotAllowed, ok } from '../../app/lib/response/index';
import { verifyWebhookSignature } from '../../app/lib/auth/index';
import { log } from '../../app/lib/observability/logger';

function rid(data: Record<string, unknown>): string {
  return (data['requestId'] as string | undefined) ?? 'unknown';
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const requestId = rid(context.data as Record<string, unknown>);
  const sig = context.request.headers.get('x-webhook-signature') ?? '';
  const raw = await context.request.text();

  const secret = context.env.WEBHOOK_SECRET ?? '';
  if (!secret) {
    return err(requestId, 'webhook_unavailable', 503);
  }

  if (!(await verifyWebhookSignature(raw, sig, secret))) {
    return err(requestId, 'invalid_signature', 401);
  }

  log({ level: 'info', type: 'webhook_received', requestId, length: raw.length });
  return ok(requestId, undefined, undefined, 'accepted');
};

export const onRequest: PagesFunction<Env> = (context) =>
  methodNotAllowed(rid(context.data as Record<string, unknown>));
