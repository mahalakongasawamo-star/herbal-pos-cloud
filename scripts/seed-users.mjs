// Creates the Phase 0 seed staff (one owner, one all-branch manager, one
// cashier per branch) through the Supabase Admin API and gives each a
// profiles row. Idempotent: existing users keep their password unless
// --reset-passwords is passed.
//
//   node scripts/seed-users.mjs --env .env.cloud          (cloud project)
//   node scripts/seed-users.mjs --env .env.cloud --reset-passwords
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// SEED_USER_PASSWORD (min 12 chars for the cloud) from the env file.
// Locally, `supabase db reset` already seeds these users (supabase/seed.sql).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const envFile = args.includes('--env') ? args[args.indexOf('--env') + 1] : '.env.local';
const resetPasswords = args.includes('--reset-passwords');

const fileEnv = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const env = { ...fileEnv, ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const password = env.SEED_USER_PASSWORD;
if (!url || !serviceKey) throw new Error(`${envFile}: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required`);
if (!password || password.length < 12) throw new Error(`${envFile}: SEED_USER_PASSWORD (12+ characters) is required`);

const USERS = [
  { email: 'owner@herbalpos.test', full_name: 'Owner', role: 'owner', branch: null },
  { email: 'manager@herbalpos.test', full_name: 'Manager', role: 'manager', branch: null },
  { email: 'cashier.mnla@herbalpos.test', full_name: 'MNLA Cashier', role: 'cashier', branch: 'MNLA' },
  { email: 'cashier.baguio@herbalpos.test', full_name: 'BAGUIO Cashier', role: 'cashier', branch: 'BAGUIO' },
];

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: branches, error: branchErr } = await supabase.from('branches').select('id, code');
if (branchErr) throw branchErr;
const branchId = Object.fromEntries(branches.map((b) => [b.code, b.id]));

const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) existing.set(u.email, u);
  if (data.users.length < 200) break;
}

for (const u of USERS) {
  if (u.branch && !branchId[u.branch]) throw new Error(`branch ${u.branch} not found — push the migrations and seed branches first`);
  let user = existing.get(u.email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });
    if (error) throw error;
    user = data.user;
    console.log(`created  ${u.email}`);
  } else if (resetPasswords) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log(`password ${u.email}`);
  } else {
    console.log(`exists   ${u.email}`);
  }
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    full_name: u.full_name,
    role: u.role,
    branch_id: u.branch ? branchId[u.branch] : null,
    active: true,
  });
  if (error) throw error;
}
console.log('done');
