import type { ContactQueueMessage, Env } from '../../app/lib/config/env';

export interface ContactJobPayload {
  name: string;
  email: string;
  phone: string;
  enquiry: string;
  preferredDate: string;
  message: string;
  submittedAt: string;
  requestId: string;
  ipHash: string;
}

export async function enqueueContactJob(env: Env, payload: ContactJobPayload): Promise<boolean> {
  if (!env.CONTACT_QUEUE) {
    return false;
  }

  const message: ContactQueueMessage = {
    type: 'contact_submission',
    payload,
  };

  await env.CONTACT_QUEUE.send(message);
  return true;
}
