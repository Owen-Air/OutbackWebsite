import type { Env } from '../../app/lib/config/env';
import { err, methodNotAllowed, ok } from '../../app/lib/response/index';

function rid(data: Record<string, unknown>): string {
  return (data['requestId'] as string | undefined) ?? 'unknown';
}

interface UploadUrlRequest {
  key: string;
  contentType: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const requestId = rid(context.data as Record<string, unknown>);
  const ct = context.request.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) return err(requestId, 'unsupported_content_type', 415);

  if (!context.env.MEDIA_BUCKET) {
    return err(requestId, 'media_bucket_unavailable', 503, {
      message: 'Upload service is not configured.',
    });
  }

  let payload: UploadUrlRequest;
  try {
    payload = (await context.request.json()) as UploadUrlRequest;
  } catch {
    return err(requestId, 'invalid_json', 400);
  }

  const key = String(payload.key ?? '').trim().replace(/^\/+/, '');
  if (!key || key.length > 240) {
    return err(requestId, 'invalid_key', 400, { message: 'Invalid upload key.' });
  }

  const contentType = String(payload.contentType ?? '').trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    return err(requestId, 'unsupported_content_type', 400, {
      message: 'Only image uploads are allowed.',
    });
  }

  // Placeholder signed upload contract for admin tooling.
  // For production, gate by authenticated role and short-lived signed token.
  return ok(requestId, {
    uploadKey: `draft/${Date.now()}-${key}`,
    maxBytes: 8 * 1024 * 1024,
    contentType,
  }, undefined, 'accepted');
};

export const onRequest: PagesFunction<Env> = (context) =>
  methodNotAllowed(rid(context.data as Record<string, unknown>));
