import type { Env } from '../../app/lib/config/env';
import { submitContact } from '../../app/lib/mail/web3forms';
import { storeContact } from '../data/contact-repository';
import { enqueueContactJob } from '../jobs/contact-jobs';

export interface ContactInput {
  name: string;
  email: string;
  phone: string;
  enquiry: string;
  preferredDate: string;
  message: string;
  requestId: string;
  ipHash: string;
}

export interface ContactServiceResult {
  accepted: boolean;
  queued: boolean;
}

export async function processContact(env: Env, input: ContactInput): Promise<ContactServiceResult> {
  await storeContact(env, {
    ...input,
    createdAt: new Date().toISOString(),
  });

  const queued = await enqueueContactJob(env, {
    ...input,
    submittedAt: new Date().toISOString(),
  });

  if (queued) {
    return { accepted: true, queued: true };
  }

  const submission = await submitContact(env.WEB3FORMS_ACCESS_KEY, {
    name: input.name,
    email: input.email,
    phone: input.phone,
    enquiry: input.enquiry,
    preferredDate: input.preferredDate,
    message: input.message,
  });

  if (!submission.ok) {
    return { accepted: false, queued: false };
  }

  return { accepted: true, queued: false };
}
