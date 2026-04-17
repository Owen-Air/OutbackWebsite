import type { Env } from '../config/env';

export async function saveContact(
  env: Env,
  contact: {
    name: string;
    email: string;
    phone: string;
    enquiry: string;
    preferredDate: string;
    message: string;
    ipHash: string;
    requestId: string;
    createdAt: string;
  },
): Promise<void> {
  if (!env.CONTACT_DB) return;
  await env.CONTACT_DB.prepare(
    `INSERT INTO contacts
      (name, email, phone, enquiry, preferred_date, message, ip_hash, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      contact.name,
      contact.email,
      contact.phone,
      contact.enquiry,
      contact.preferredDate,
      contact.message,
      contact.ipHash,
      contact.requestId,
      contact.createdAt,
    )
    .run();
}
