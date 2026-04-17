const TURNSTILE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

export async function verifyTurnstileToken(
  request: Request,
  secret: string | undefined,
  token: string,
): Promise<TurnstileResult> {
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing_turnstile' };

  try {
    const body = new FormData();
    body.set('secret', secret);
    body.set('response', token);

    const ip = request.headers.get('cf-connecting-ip');
    if (ip) body.set('remoteip', ip);

    const res = await fetch(TURNSTILE_ENDPOINT, { method: 'POST', body });
    if (!res.ok) return { ok: false, reason: 'turnstile_failed' };

    const payload = (await res.json()) as { success?: boolean };
    return payload?.success
      ? { ok: true }
      : { ok: false, reason: 'turnstile_failed' };
  } catch {
    return { ok: false, reason: 'turnstile_failed' };
  }
}
