/** Private Vercel Blob storage for receipt images (RCP-1). Without a token, images are not stored at all. */
import { del, put } from '@vercel/blob';
import { env } from '@/lib/env';

export async function putPrivate(path: string, bytes: Uint8Array, contentType: string): Promise<string | null> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const res = await put(path, Buffer.from(bytes), { access: 'private', contentType, token, addRandomSuffix: true });
  return res.url;
}

export async function deleteBlob(url: string): Promise<void> {
  const token = env().BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  await del(url, { token });
}
