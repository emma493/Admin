/**
 * Cloudinary unsigned upload (Admin browser → Cloudinary, no backend).
 *
 * The baked 1200x630 JPEG is POSTed to an *unsigned* upload preset, so no API
 * secret ever ships in the Admin bundle. Abuse is bounded by the preset's own
 * restrictions (folder `shortxx/previews`, jpg/png only).
 *
 * Config: VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_PRESET, defaulting to
 * the values below. These are public identifiers, not secrets.
 */

const CLOUD_NAME =
  (import.meta as any)?.env?.VITE_CLOUDINARY_CLOUD_NAME || 'nonzehj3';
const UPLOAD_PRESET =
  (import.meta as any)?.env?.VITE_CLOUDINARY_PRESET || 'shortxx_preview';

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('Baked image data is missing.');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/**
 * Upload a baked thumbnail dataURL to Cloudinary. Resolves with the CDN URL
 * that becomes the og:image. Each upload gets a random public ID (preset has
 * `unique filename: false` + `use filename: false`), so every publish is a
 * brand-new URL and crawler caches bust automatically.
 */
export async function uploadBakedImage(dataUrl: string): Promise<CloudinaryUploadResult> {
  const blob = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append('file', blob, 'preview.jpg');
  form.append('upload_preset', UPLOAD_PRESET);

  let res: Response;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: form,
    });
  } catch {
    throw new Error('Upload failed — check your connection and try again.');
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body?.secure_url) {
    const detail = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Cloudinary upload failed (${detail}). Check the preset is Unsigned.`);
  }
  return { secureUrl: body.secure_url as string, publicId: body.public_id as string };
}
