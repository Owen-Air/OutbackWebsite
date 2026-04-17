/**
 * Typed environment bindings shared across all Functions.
 * Optional bindings (D1, R2, Queue) gracefully degrade when not provisioned.
 */

export interface ContactQueueMessage {
  type: 'contact_submission';
  payload: {
    name: string;
    email: string;
    phone: string;
    enquiry: string;
    preferredDate: string;
    message: string;
    submittedAt: string;
    requestId: string;
    ipHash: string;
  };
}

export interface Env {
  // Always required in production
  RATE_LIMIT: KVNamespace;
  TURNSTILE_SECRET: string;
  MAILBOXVALIDATOR_API_KEY: string;
  WEB3FORMS_ACCESS_KEY: string;
  WEBHOOK_SECRET?: string;

  // Provision via Cloudflare dashboard before enabling
  CONTACT_DB?: D1Database;
  MEDIA_BUCKET?: R2Bucket;
  CONTACT_QUEUE?: Queue<ContactQueueMessage>;
}

export function missingSecrets(env: Env): string[] {
  const required: Array<keyof Pick<Env, 'TURNSTILE_SECRET' | 'MAILBOXVALIDATOR_API_KEY' | 'WEB3FORMS_ACCESS_KEY'>> = [
    'TURNSTILE_SECRET',
    'MAILBOXVALIDATOR_API_KEY',
    'WEB3FORMS_ACCESS_KEY',
  ];
  return required.filter(
    (k) => !env[k] || env[k] === '__SET_THIS_OUTSIDE_SOURCE_CONTROL__',
  );
}
