/**
 * Mirrors messages/en.json into xh.json and af.json: missing keys are added as "TODO: <English>",
 * keys no longer in en are removed, reviewed translations are kept. Run after editing en.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Msgs = { [k: string]: string | Msgs };
const dir = join(process.cwd(), 'messages');
const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')) as Msgs;

function mirror(base: Msgs, existing: Msgs | undefined): Msgs {
  const out: Msgs = {};
  for (const [k, v] of Object.entries(base)) {
    const cur = existing?.[k];
    if (typeof v === 'string') out[k] = typeof cur === 'string' ? cur : `TODO: ${v}`;
    else out[k] = mirror(v, typeof cur === 'object' ? cur : undefined);
  }
  return out;
}

for (const loc of ['xh', 'af']) {
  const file = join(dir, `${loc}.json`);
  let existing: Msgs | undefined;
  try {
    existing = JSON.parse(readFileSync(file, 'utf8')) as Msgs;
  } catch {
    existing = undefined;
  }
  writeFileSync(file, JSON.stringify(mirror(en, existing), null, 2) + '\n');
}
console.log('messages synced');
