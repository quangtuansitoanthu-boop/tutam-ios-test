import { createBrowserId } from './random-id';
import { fetchWithSessionRefresh } from './session-csrf';
import { mediaFileContentType } from '$lib/utils/media-file-content-type';
export { mediaFileContentType } from '$lib/utils/media-file-content-type';

export function encodeMediaFileNameHeader(fileName: string): string {
  return encodeURIComponent(fileName);
}

/** Keep the raw upload contract and session/policy owner on web and native.
 * Native patched fetch serializes this typed Blob as a base64 file body. */
export async function uploadMediaFile(file: File, prefix: 'covers' | 'content' | 'pdfs', csrfToken: string): Promise<Response> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  const hash = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  const contentType = mediaFileContentType(file);
  return fetchWithSessionRefresh('/api/media', {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-content-sha256': hash,
      'x-csrf-token': csrfToken,
      'x-file-name': encodeMediaFileNameHeader(file.name),
      'x-media-prefix': prefix,
      'idempotency-key': createBrowserId(),
    },
    body: file.type === contentType ? file : file.slice(0, file.size, contentType),
  });
}
