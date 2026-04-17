import { describe, expect, it } from 'vitest';
import { ContactSchema, ValidateEmailSchema } from '../../app/lib/validation/schemas';
import {
  sanitizeSingleLine,
  sanitizeMultiline,
  isContentLengthTooLarge,
  isSameOriginRequest,
} from '../../app/lib/security/sanitize';

// ---------------------------------------------------------------------------
// ContactSchema
// ---------------------------------------------------------------------------

describe('ContactSchema', () => {
  const valid = {
    name: 'Owen',
    email: 'owen@example.com',
    enquiry: 'general',
    message: 'Hello, I have a question about booking a table.',
    turnstileToken: 'test-token',
  };

  it('accepts a complete valid payload', () => {
    expect(ContactSchema.safeParse(valid).success).toBe(true);
  });

  it('normalises email to lowercase', () => {
    const result = ContactSchema.safeParse({ ...valid, email: 'OWEN@EXAMPLE.COM' });
    expect(result.success && result.data.email).toBe('owen@example.com');
  });

  it('rejects an invalid email', () => {
    expect(ContactSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a message shorter than 10 characters', () => {
    expect(ContactSchema.safeParse({ ...valid, message: 'Short' }).success).toBe(false);
  });

  it('rejects a message longer than 2000 characters', () => {
    expect(ContactSchema.safeParse({ ...valid, message: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects an unknown enquiry type', () => {
    expect(ContactSchema.safeParse({ ...valid, enquiry: 'unknown-type' }).success).toBe(false);
  });

  it('rejects a malformed phone number', () => {
    expect(ContactSchema.safeParse({ ...valid, phone: 'abc!!!phone' }).success).toBe(false);
  });

  it('accepts an empty phone number', () => {
    expect(ContactSchema.safeParse({ ...valid, phone: '' }).success).toBe(true);
  });

  it('rejects a malformed preferred date', () => {
    expect(ContactSchema.safeParse({ ...valid, date: '11/04/2026' }).success).toBe(false);
  });

  it('accepts a valid ISO date', () => {
    expect(ContactSchema.safeParse({ ...valid, date: '2026-04-11' }).success).toBe(true);
  });

  it('rejects a missing turnstile token', () => {
    const { turnstileToken: _, ...rest } = valid;
    expect(ContactSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ValidateEmailSchema
// ---------------------------------------------------------------------------

describe('ValidateEmailSchema', () => {
  it('accepts a valid email', () => {
    expect(ValidateEmailSchema.safeParse({ email: 'test@example.com' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(ValidateEmailSchema.safeParse({ email: 'notvalid' }).success).toBe(false);
  });

  it('defaults turnstileToken to empty string', () => {
    const result = ValidateEmailSchema.safeParse({ email: 'a@b.com' });
    expect(result.success && result.data.turnstileToken).toBe('');
  });
});

// ---------------------------------------------------------------------------
// sanitizeSingleLine
// ---------------------------------------------------------------------------

describe('sanitizeSingleLine', () => {
  it('strips control characters', () => {
    expect(sanitizeSingleLine('\x00hello\x1F', 100)).toBe('hello');
  });

  it('removes HTML brackets', () => {
    expect(sanitizeSingleLine('<b>bold</b>', 100)).toBe('bbold/b');
  });

  it('respects maxLength', () => {
    expect(sanitizeSingleLine('hello world', 5)).toBe('hello');
  });

  it('normalises whitespace', () => {
    expect(sanitizeSingleLine('hello   world', 100)).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// sanitizeMultiline
// ---------------------------------------------------------------------------

describe('sanitizeMultiline', () => {
  it('preserves newlines', () => {
    expect(sanitizeMultiline('line1\nline2', 100)).toContain('\n');
  });

  it('removes null bytes', () => {
    expect(sanitizeMultiline('hello\x00world', 100)).toBe('helloworld');
  });

  it('normalises CRLF to LF', () => {
    expect(sanitizeMultiline('a\r\nb', 100)).toBe('a\nb');
  });
});

// ---------------------------------------------------------------------------
// isContentLengthTooLarge
// ---------------------------------------------------------------------------

describe('isContentLengthTooLarge', () => {
  const req = (cl: string | null) =>
    new Request('https://example.com', {
      method: 'POST',
      headers: cl !== null ? { 'content-length': cl } : {},
    });

  it('returns false when header is absent', () => {
    expect(isContentLengthTooLarge(req(null), 1024)).toBe(false);
  });

  it('returns true when over limit', () => {
    expect(isContentLengthTooLarge(req('2000'), 1024)).toBe(true);
  });

  it('returns false when under limit', () => {
    expect(isContentLengthTooLarge(req('500'), 1024)).toBe(false);
  });

  it('returns false for non-numeric value', () => {
    expect(isContentLengthTooLarge(req('abc'), 1024)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isSameOriginRequest
// ---------------------------------------------------------------------------

describe('isSameOriginRequest', () => {
  it('passes when Origin header matches', () => {
    const r = new Request('https://example.com/api/contact', {
      headers: { origin: 'https://example.com' },
    });
    expect(isSameOriginRequest(r)).toBe(true);
  });

  it('blocks when Origin header differs', () => {
    const r = new Request('https://example.com/api/contact', {
      headers: { origin: 'https://evil.com' },
    });
    expect(isSameOriginRequest(r)).toBe(false);
  });

  it('passes when Referer matches origin', () => {
    const r = new Request('https://example.com/api/contact', {
      headers: { referer: 'https://example.com/contact' },
    });
    expect(isSameOriginRequest(r)).toBe(true);
  });

  it('blocks when Referer origin differs', () => {
    const r = new Request('https://example.com/api/contact', {
      headers: { referer: 'https://evil.com/page' },
    });
    expect(isSameOriginRequest(r)).toBe(false);
  });
});
