-- LOCAL DEVELOPMENT ONLY — never run against a cloud project.
--
-- config.toml's [db.seed] runs this alongside ../seed.sql only for the
-- *local* stack (`supabase db reset` / `supabase start`). It is
-- deliberately kept out of seed.sql itself: `supabase db push
-- --include-seed` runs seed.sql against a linked cloud project (that's how
-- the catalogue and branches get bootstrapped there — see
-- scripts/seed-users.mjs's header), and seed.sql must stay safe to run
-- there. This file, with a committed password, must not.
--
-- For a cloud project's staff accounts, use `npm run seed:users` instead —
-- it creates users through the Admin API with a password you choose
-- (SEED_USER_PASSWORD in your own .env.cloud, never committed).
--
-- Password for all four users below: herbal-dev-2026
create temporary table seed_users (id uuid, email text, full_name text, role text, branch_code text);
insert into seed_users values
  ('00000000-0000-4000-8000-000000000001', 'owner@herbalpos.test',          'Owner',          'owner',   null),
  ('00000000-0000-4000-8000-000000000002', 'manager@herbalpos.test',        'Manager',        'manager', null),
  ('00000000-0000-4000-8000-000000000003', 'cashier.mnla@herbalpos.test',   'MNLA Cashier',   'cashier', 'MNLA'),
  ('00000000-0000-4000-8000-000000000004', 'cashier.baguio@herbalpos.test', 'BAGUIO Cashier', 'cashier', 'BAGUIO');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('herbal-dev-2026', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.full_name), now(), now(),
       '', '', '', '', '', '', '', ''
from seed_users u;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from seed_users u;

insert into public.profiles (id, full_name, role, branch_id)
select u.id, u.full_name, u.role, b.id
from seed_users u
left join public.branches b on b.code = u.branch_code;

drop table seed_users;
