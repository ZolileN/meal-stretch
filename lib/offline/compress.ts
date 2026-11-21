/** RCP-1: shrink a photo on the device to ≤ 2 MB JPEG before upload. Client only. */
export async function compressImage(file: File, maxBytes = 2 * 1024 * 1024): Promise<Blob> {
  if (file.size <= maxBytes && file.type === 'image/jpeg') return file;
  const bitmap = await createImageBitmap(file);
  let max = 2000;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.75 - attempt * 0.08));
    if (blob && blob.size <= maxBytes) return blob;
    max = Math.round(max * 0.8);
  }
  throw new Error('too_large');
}
