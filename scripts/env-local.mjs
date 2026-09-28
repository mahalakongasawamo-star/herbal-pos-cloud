// Writes .env.local from the running local Supabase stack (`supabase status`),
// so `npm run dev` and the tests talk to it. Run after `npm run db:start`.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', shell: true });
const env = Object.fromEntries(
  out
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const pick = (...keys) => keys.map((k) => env[k]).find(Boolean) ?? '';
const url = pick('API_URL');
const anon = pick('ANON_KEY', 'PUBLISHABLE_KEY');
const service = pick('SERVICE_ROLE_KEY', 'SECRET_KEY');
const db = pick('DB_URL');
if (!url || !anon) throw new Error('supabase status gave no API_URL / ANON_KEY — is the local stack running? (npm run db:start)');

writeFileSync(
  '.env.local',
  `# Local Supabase stack — written by \`npm run env:local\` from \`supabase status\`.
NEXT_PUBLIC_SUPABASE_URL=${url}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}
# Server-only. Never prefix with NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=${service}
SUPABASE_DB_URL=${db}
`,
);
console.log(`.env.local -> ${url}`);
