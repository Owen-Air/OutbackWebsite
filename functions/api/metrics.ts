import type { Env } from '../../app/lib/config/env';
import { methodNotAllowed, ok } from '../../app/lib/response/index';
import { metricsSnapshot } from '../../platform/observability/metrics';

function rid(data: Record<string, unknown>): string {
  return (data['requestId'] as string | undefined) ?? 'unknown';
}

export const onRequestGet: PagesFunction<Env> = (context) => {
  return ok(rid(context.data as Record<string, unknown>), {
    route: '/api/metrics',
    metrics: metricsSnapshot(),
  });
};

export const onRequestHead: PagesFunction<Env> = (context) => {
  return ok(rid(context.data as Record<string, unknown>), {
    route: '/api/metrics',
    metrics: metricsSnapshot(),
  });
};

export const onRequest: PagesFunction<Env> = (context) => methodNotAllowed(rid(context.data as Record<string, unknown>));
