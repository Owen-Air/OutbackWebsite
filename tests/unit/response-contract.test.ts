import { describe, expect, it } from 'vitest';
import { err, ok } from '../../app/lib/response/index';

describe('API response contract', () => {
  it('builds success responses with meta', async () => {
    const response = ok('req-123', { hello: 'world' });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect((json.meta as Record<string, unknown>).requestId).toBe('req-123');
    expect(typeof (json.meta as Record<string, unknown>).timestamp).toBe('string');
    expect((json.data as Record<string, unknown>).hello).toBe('world');
  });

  it('builds error responses with structured error object', async () => {
    const response = err('req-456', 'invalid_payload', 400, { message: 'Bad input' });
    const json = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect((json.error as Record<string, unknown>).code).toBe('invalid_payload');
    expect((json.error as Record<string, unknown>).message).toBe('Bad input');
    expect((json.meta as Record<string, unknown>).requestId).toBe('req-456');
  });
});
