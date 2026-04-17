import { sanitizeSingleLine } from '../../app/lib/security/sanitize';

export interface UploadContract {
  uploadKey: string;
  maxBytes: number;
  contentType: string;
}

export function createUploadContract(rawKey: unknown, rawContentType: unknown): UploadContract | null {
  const key = sanitizeSingleLine(rawKey, 240).replace(/^\/+/, '');
  const contentType = sanitizeSingleLine(rawContentType, 80).toLowerCase();

  if (!key || !contentType.startsWith('image/')) {
    return null;
  }

  return {
    uploadKey: `draft/${Date.now()}-${key}`,
    maxBytes: 8 * 1024 * 1024,
    contentType,
  };
}
