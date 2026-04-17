import type { Env } from '../config/env';

const PREFIX = 'rl:v1';

export interface RateLimitResult {
  ok: boolean;
  retryAfter?: number;
}

function sanitizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._:-]/g, '_')
    .slice(0, 120);
}

export async function consumeRateLimit(
  env: Env,
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!env.RATE_LIMIT) return { ok: true };

  const key = `${PREFIX}:${bucket}:${sanitizeKey(subject)}`;

  try {
    const existing = await env.RATE_LIMIT.get(key);
    const count = Number.parseInt(existing ?? '0', 10);
    const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;

    if (safeCount >= limit) {
      return { ok: false, retryAfter: windowSeconds };
    }

    await env.RATE_LIMIT.put(key, String(safeCount + 1), {
      expirationTtl: windowSeconds,
    });
    return { ok: true };
  } catch {
    // Fail open if KV is unavailable — never block legitimate traffic
    return { ok: true };
  }
}
