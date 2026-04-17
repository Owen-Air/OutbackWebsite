import { log } from '../observability/logger';

export interface AnalyticsEvent {
  event: string;
  path: string;
  ts: string;
  meta?: Record<string, unknown> | undefined;
}

export function track(event: AnalyticsEvent): void {
  log({ level: 'info', type: 'analytics_event', ...event });
}
