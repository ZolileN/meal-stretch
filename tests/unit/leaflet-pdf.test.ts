import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfChunks } from '@/scripts/leaflet-pdf';

async function pdfWithPages(n: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([200, 300]);
  return doc.save();
}

describe('leaflet PDF chunks (pnpm import:leaflet)', () => {
  it('splits a 20-page leaflet into 8 + 8 + 4 standalone PDFs', async () => {
    const chunks = await pdfChunks(await pdfWithPages(20), 8);
    expect(chunks.map((c) => c.pages)).toEqual([8, 8, 4]);
    expect(chunks.map((c) => c.label)).toEqual(['pages 1–8 of 20', 'pages 9–16 of 20', 'pages 17–20 of 20']);
    for (const c of chunks) {
      const back = await PDFDocument.load(Buffer.from(c.base64, 'base64'));
      expect(back.getPageCount()).toBe(c.pages);
    }
  });
  it('a short leaflet is one chunk', async () => {
    expect((await pdfChunks(await pdfWithPages(3), 8)).map((c) => c.pages)).toEqual([3]);
  });
});
