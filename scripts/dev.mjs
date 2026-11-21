// `pnpm dev`: starts the local DB (when DATABASE_HTTP_ENDPOINT points at localhost) and `next dev`.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const envFile = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const endpoint = /^DATABASE_HTTP_ENDPOINT=(.*)$/m.exec(envFile)?.[1]?.trim() ?? process.env.DATABASE_HTTP_ENDPOINT ?? '';
const children = [];
const run = (cmd, args, env = {}) => {
  const c = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  children.push(c);
  c.on('exit', (code) => { children.forEach((o) => o !== c && o.kill()); process.exit(code ?? 0); });
};
// Start Next only once the local DB answers: it takes ~30-40 s on first start (migrate + seed),
// and API calls made before then fail (e.g. "We couldn't get your location").
async function waitForDb(port) {
  const url = `http://localhost:${port}/health`;
  for (let i = 0; i < 180; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    if (i === 2) console.log('[dev] waiting for the local database before starting Next…');
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('[dev] local database did not answer after 3 minutes; starting Next anyway');
}

if (/localhost|127\.0\.0\.1/.test(endpoint)) {
  const port = new URL(endpoint).port || '4444';
  run('pnpm', ['db:local'], { LOCAL_DB_PORT: port });
  await waitForDb(port);
}
run('pnpm', ['dev:next']);
process.on('SIGINT', () => children.forEach((c) => c.kill('SIGINT')));
