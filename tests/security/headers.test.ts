import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('_headers security posture', () => {
  const headers = readFileSync(resolve(process.cwd(), '_headers'), 'utf8');

  it('contains strict transport security', () => {
    expect(headers).toContain('Strict-Transport-Security');
  });

  it('contains a CSP declaration', () => {
    expect(headers).toContain('Content-Security-Policy');
  });

  it('enforces nosniff', () => {
    expect(headers).toContain('X-Content-Type-Options: nosniff');
  });
});
