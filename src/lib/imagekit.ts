// Frontend helper for ImageKit direct browser uploads.
// Gets a one-time signature from the imagekit-auth Edge Function, then uploads
// the file straight to ImageKit. The private key never touches the browser.

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/oy2vruqkz';

interface UploadAuth {
  token: string;
  signature: string;
  expire: number;
  publicKey: string;
  folder: string;
  urlEndpoint: string;
}

async function getUploadAuth(folder: string): Promise<UploadAuth> {
  const res = await fetch(`${FUNCTIONS_URL}/imagekit-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ folder }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to get upload signature (${res.status})`);
  }
  return res.json();
}

export interface UploadResult {
  url: string;
  fileId: string;
}

/** Uploads a file to ImageKit from the browser. Throws on failure. */
export async function uploadToImageKit(
  file: File,
  folder: 'products' | 'categories' | 'hero' = 'products'
): Promise<UploadResult> {
  const auth = await getUploadAuth(folder);

  const form = new FormData();
  form.append('file', file);
  form.append('fileName', `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`);
  form.append('folder', `/${folder}`);
  form.append('publicKey', auth.publicKey);
  form.append('token', auth.token);
  form.append('signature', auth.signature);
  form.append('expire', String(auth.expire));
  form.append('useUniqueFileName', 'true');

  const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `ImageKit upload failed (${res.status})`);
  }

  const data = await res.json();
  // ImageKit returns a full URL; normalize it through our endpoint
  const url: string = data.url ?? `${IMAGEKIT_URL_ENDPOINT}/${data.filePath}`;
  return { url, fileId: data.fileId };
}

/**
 * Appends ImageKit transformations for fast delivery (auto WebP/AVIF + width cap).
 * Safe to call on ANY image url — non-ImageKit URLs are returned untouched.
 */
export function ikImage(url: string | null | undefined, width = 800): string {
  if (!url) return '';
  if (!url.includes('ik.imagekit.io')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}tr=w-${width},f-auto,q-80`;
}
