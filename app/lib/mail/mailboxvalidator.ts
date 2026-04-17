const ENDPOINT = 'https://api.mailboxvalidator.com/v2/validation/single';
const SYNTAX_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailValidationResult {
  ok: boolean;
  status: number;
  reason: string;
  score: number | null;
  details: Record<string, unknown>;
}

function asBoolean(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const n = v.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(n)) return true;
    if (['false', 'no', '0'].includes(n)) return false;
  }
  return null;
}

export async function validateEmail(
  apiKey: string | undefined,
  email: string,
): Promise<EmailValidationResult> {
  if (!apiKey || apiKey === '__SET_THIS_OUTSIDE_SOURCE_CONTROL__') {
    return {
      ok: false,
      status: 500,
      reason: 'validation_service_unavailable',
      score: null,
      details: { message: 'Email validation service is not configured.' },
    };
  }

  if (!email) {
    return {
      ok: false,
      status: 400,
      reason: 'missing_email',
      score: null,
      details: { message: 'An email address is required.' },
    };
  }

  if (!SYNTAX_REGEX.test(email)) {
    return {
      ok: false,
      status: 400,
      reason: 'invalid_syntax',
      score: null,
      details: { email, is_syntax: false },
    };
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set('email', email);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        reason: 'validation_service_error',
        score: null,
        details: { status_code: res.status },
      };
    }

    const payload = (await res.json()) as Record<string, unknown>;

    const isSyntax = asBoolean(payload['is_syntax']);
    const isDomain = asBoolean(payload['is_domain']);
    const isDisposable = asBoolean(payload['is_disposable']);
    const status = asBoolean(payload['status']);

    const passed =
      isSyntax === true &&
      isDomain !== false &&
      isDisposable !== true &&
      status === true;

    const score =
      typeof payload['score'] === 'number' ? payload['score'] : null;

    return {
      ok: passed,
      status: passed ? 200 : 400,
      reason: passed ? 'accepted' : 'rejected',
      score,
      details: { is_syntax: isSyntax, is_domain: isDomain, is_disposable: isDisposable, status },
    };
  } catch {
    return {
      ok: false,
      status: 502,
      reason: 'validation_service_error',
      score: null,
      details: { message: 'MailboxValidator request failed.' },
    };
  }
}
