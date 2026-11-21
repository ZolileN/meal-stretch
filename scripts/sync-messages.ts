/**
 * 1) Mirrors messages/en.json into xh.json and af.json: missing keys are added as "TODO: <English>",
 *    keys no longer in en are removed, reviewed translations are kept.
 * 2) Writes messages/runtime/<locale>.json: what the app loads. Strings still marked TODO fall back to
 *    English there, so un-reviewed translations are never shown (I18N-2/4).
 * Run after editing any messages file (also runs before `pnpm build`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Msgs = { [k: string]: string | Msgs };
const dir = join(process.cwd(), 'messages');
const read = (f: string): Msgs | undefined => {
  try {
    return JSON.parse(readFileSync(join(dir, f), 'utf8')) as Msgs;
  } catch {
    return undefined;
  }
};
const en = read('en.json')!;

function mirror(base: Msgs, existing: Msgs | undefined): Msgs {
  const out: Msgs = {};
  for (const [k, v] of Object.entries(base)) {
    const cur = existing?.[k];
    if (typeof v === 'string') out[k] = typeof cur === 'string' ? cur : `TODO: ${v}`;
    else out[k] = mirror(v, typeof cur === 'object' ? cur : undefined);
  }
  return out;
}

export function runtimeMessages(base: Msgs, translated: Msgs): Msgs {
  const out: Msgs = {};
  for (const [k, v] of Object.entries(base)) {
    const t = translated[k];
    if (typeof v === 'string') out[k] = typeof t === 'string' && !t.startsWith('TODO:') ? t : v;
    else out[k] = runtimeMessages(v, typeof t === 'object' ? t : {});
  }
  return out;
}

const json = (m: Msgs) => JSON.stringify(m, null, 2) + '\n';
mkdirSync(join(dir, 'runtime'), { recursive: true });
writeFileSync(join(dir, 'runtime', 'en.json'), json(en));
for (const loc of ['xh', 'af']) {
  const mirrored = mirror(en, read(`${loc}.json`));
  writeFileSync(join(dir, `${loc}.json`), json(mirrored));
  writeFileSync(join(dir, 'runtime', `${loc}.json`), json(runtimeMessages(en, mirrored)));
}
console.log('messages synced');
