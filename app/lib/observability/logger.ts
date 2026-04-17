export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  type: string;
  requestId?: string;
  [key: string]: unknown;
}

export function log(entry: LogEntry): void {
  const record = { timestamp: new Date().toISOString(), ...entry };
  const line = JSON.stringify(record);
  switch (entry.level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export function securityEvent(
  event: string,
  endpoint: string,
  ip: string,
  requestId: string,
  extra: Record<string, unknown> = {},
): void {
  log({
    level: 'warn',
    type: 'security_event',
    event,
    endpoint,
    ip,
    requestId,
    ...extra,
  });
}

export function apiRequest(
  method: string,
  path: string,
  status: number,
  ip: string,
  requestId: string,
): void {
  log({ level: 'info', type: 'api_request', method, path, status, ip, requestId });
}
