const ENDPOINT = 'https://api.web3forms.com/submit';

export interface ContactPayload {
  name: string;
  email: string;
  phone: string;
  enquiry: string;
  preferredDate: string;
  message: string;
}

export interface SubmissionResult {
  ok: boolean;
  status: number;
  reason: string;
  details?: Record<string, unknown>;
}

export async function submitContact(
  accessKey: string | undefined,
  payload: ContactPayload,
): Promise<SubmissionResult> {
  if (!accessKey || accessKey === '__SET_THIS_OUTSIDE_SOURCE_CONTROL__') {
    return {
      ok: false,
      status: 500,
      reason: 'form_service_unavailable',
      details: { message: 'Contact form service is not configured.' },
    };
  }

  const body = new FormData();
  body.set('access_key', accessKey);
  body.set('subject', 'New enquiry from The Outback website');
  body.set('from_name', 'The Outback website');
  body.set('name', payload.name);
  body.set('email', payload.email);
  body.set('replyto', payload.email);
  // Send a confirmation copy to the submitter
  body.set('cc', payload.email);
  body.set('phone', payload.phone || 'Not provided');
  body.set('enquiry', payload.enquiry);
  body.set('date', payload.preferredDate || 'Not provided');
  body.set('message', payload.message);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { accept: 'application/json' },
      body,
    });

    const text = await res.text();
    let data: { success?: boolean } | null = null;
    try {
      data = text ? (JSON.parse(text) as { success?: boolean }) : null;
    } catch {
      data = null;
    }

    if (!res.ok || !data?.success) {
      return {
        ok: false,
        status: 502,
        reason: 'form_service_error',
        details: { message: 'Form delivery failed.' },
      };
    }

    return { ok: true, status: 200, reason: 'accepted' };
  } catch {
    return {
      ok: false,
      status: 502,
      reason: 'form_service_error',
      details: { message: 'Form delivery failed.' },
    };
  }
}
