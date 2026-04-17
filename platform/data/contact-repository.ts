import type { Env } from '../../app/lib/config/env';

export interface ContactRecord {
  name: string;
  email: string;
  phone: string;
  enquiry: string;
  preferredDate: string;
  message: string;
  requestId: string;
  ipHash: string;
  createdAt: string;
}

export async function storeContact(env: Env, input: ContactRecord): Promise<void> {
  if (!env.CONTACT_DB) {
    return;
  }

  await env.CONTACT_DB.prepare(
    `INSERT INTO contacts
      (name, email, phone, enquiry, preferred_date, message, ip_hash, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.name,
      input.email,
      input.phone,
      input.enquiry,
      input.preferredDate,
      input.message,
      input.ipHash,
      input.requestId,
      input.createdAt,
    )
    .run();
}
