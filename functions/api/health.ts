import type { Env } from '../../app/lib/config/env';
import { methodNotAllowed, ok } from '../../app/lib/response/index';

interface HealthData {
  ok: true;
  timestamp: string;
  services: Record<string, boolean>;
}

function buildHealth(env: Env): HealthData {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    services: {
      rateLimitKv: !!env.RATE_LIMIT,
      contactDb: !!env.CONTACT_DB,
      mediaBucket: !!env.MEDIA_BUCKET,
      contactQueue: !!env.CONTACT_QUEUE,
      turnstileConfigured: !!env.TURNSTILE_SECRET,
      mailboxValidatorConfigured: !!env.MAILBOXVALIDATOR_API_KEY,
      web3formsConfigured: !!env.WEB3FORMS_ACCESS_KEY,
    },
  };
}

export const onRequestGet: PagesFunction<Env> = (context) => {
  const requestId =
    ((context.data as Record<string, unknown>)['requestId'] as string | undefined) ??
    'unknown';

  const health = buildHealth(context.env);

  return ok(requestId, health);
};

export const onRequestHead: PagesFunction<Env> = (context) => {
  const requestId =
    ((context.data as Record<string, unknown>)['requestId'] as string | undefined) ??
    'unknown';
  return new Response(null, {
    status: 200,
    headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
  });
};

export const onRequest: PagesFunction<Env> = (context) => {
  return methodNotAllowed(
    ((context.data as Record<string, unknown>)['requestId'] as string | undefined) ??
      'unknown',
  );
};
