import { PDFDocument } from 'pdf-lib';

/** Split a PDF into chunks of `n` pages, each a standalone PDF (Claude reads ≤ 100 pages and ≤ 32 MB per request). */
export async function pdfChunks(bytes: Uint8Array, n: number): Promise<{ label: string; pages: number; base64: string }[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  const out: { label: string; pages: number; base64: string }[] = [];
  for (let start = 0; start < total; start += n) {
    const doc = await PDFDocument.create();
    const idx = Array.from({ length: Math.min(n, total - start) }, (_, k) => start + k);
    for (const page of await doc.copyPages(src, idx)) doc.addPage(page);
    out.push({ label: `pages ${start + 1}–${start + idx.length} of ${total}`, pages: idx.length, base64: Buffer.from(await doc.save()).toString('base64') });
  }
  return out;
}
