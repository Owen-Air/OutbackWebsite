export function sanitizeSingleLine(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMultiline(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeLogField(value: unknown, maxLength = 300): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function isContentLengthTooLarge(
  request: Request,
  maxBytes: number,
): boolean {
  const header = request.headers.get('content-length');
  if (!header) return false;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) && n > maxBytes;
}

export function isSameOriginRequest(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');

  if (origin) return origin === requestOrigin;

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
