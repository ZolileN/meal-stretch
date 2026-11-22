/** POST /api/receipts: multipart image → { receiptId, status }; processing continues after the response (RCP-1/2). */
import { after, NextResponse } from 'next/server';
import { apiError, limitOr429 } from '@/lib/api';
import { getDb } from '@/lib/db';
import { ensureHousehold, householdById } from '@/lib/household';
import { ClaudeError } from '@/lib/claude';
import { createReceipt, IMAGE_TYPES, processReceipt, ReceiptError } from '@/lib/receipts/pipeline';

export const maxDuration = 120;

export async function POST(req: Request) {
  const limited = await limitOr429(req, 'receipts', 10, 3600);
  if (limited) return limited;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, 'invalid_body', 'Send the photo as multipart/form-data');
  }
  const file = form.get('image');
  if (!(file instanceof File)) return apiError(400, 'invalid_body', 'Missing image');
  const db = getDb();
  const h = await ensureHousehold(db);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const id = await createReceipt(db, h, { bytes, type: file.type }, { consent: form.get('consent') === 'true' });
    const fresh = (await householdById(db, h.id))!;
    after(() => processReceipt(db, fresh, id, { householdId: h.id, imageBase64: Buffer.from(bytes).toString('base64'), mediaType: file.type as (typeof IMAGE_TYPES)[number] }));
    return NextResponse.json({ receiptId: id, status: 'processing' }, { status: 202 });
  } catch (e) {
    if (e instanceof ReceiptError) return apiError(e.status, e.code, e.message);
    if (e instanceof ClaudeError && e.code === 'cap_reached') return apiError(429, 'cap_reached', 'You can scan 5 slips a day. Try again tomorrow.');
    if (e instanceof ClaudeError && e.code === 'global_cap') return apiError(503, 'global_cap', 'Slip scanning is busy today. Please try again tomorrow.');
    throw e;
  }
}
