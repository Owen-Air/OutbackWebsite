import { describe, expect, it } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from '../../app/lib/auth/index';

describe('webhook signature verification', () => {
  it('verifies valid signatures', async () => {
    const raw = '{"ok":true}';
    const secret = 'test-secret';
    const signature = await signWebhookPayload(raw, secret);

    await expect(verifyWebhookSignature(raw, signature, secret)).resolves.toBe(true);
  });

  it('rejects invalid signatures', async () => {
    const raw = '{"ok":true}';

    await expect(verifyWebhookSignature(raw, 'invalid-signature', 'test-secret')).resolves.toBe(false);
  });
});
