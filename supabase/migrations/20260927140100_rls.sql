-- Herbal POS Cloud — Row-Level Security (SPEC §2, §4.5).
--
-- Every check reads the caller's row in public.profiles (via auth.uid()),
-- never a role or branch the client sends. An auth user with no profile, or
-- an inactive one, can read nothing and write nothing.
--
-- Access matrix (R = read, W = direct insert/update/delete through the API):
--
--   table                 owner         manager (all | one branch)   cashier (one branch)
--   branches              R W           R (scope)                    R (own)
--   profiles              R W           R                            R
--   categories, products,
--   package_inclusions,
--   member_tiers,
--   payment_methods       R W           R                            R
--   stock_ledger          R             R (scope)                    R (own)
--   stock_balances        R             R (scope)                    R (own)
--   stock_ins             R             R (scope)                    R (own)
--   sales, sale_items     R             R (scope)                    R (own)
--
-- Money and stock tables have NO write policies at all: every sale, void and
-- stock movement goes through the security-definer RPCs (SPEC §6), which do
-- their own role/branch checks inside the transaction.

-- =================================================================
-- Helpers. security definer so they can read profiles without recursing
-- through profiles' own policies; stable so the planner evaluates them once
-- per statement.
-- =================================================================

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active
  );
$$;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role = 'owner'
  );
$$;

-- True when the caller may see data for this branch: owners and all-branch
-- managers (branch_id null) see every branch; everyone else sees their own.
create or replace function private.can_see_branch(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active
      and (p.branch_id is null or p.branch_id = target_branch)
  );
$$;

-- The caller's branch (null = all branches, or no active profile — always
-- pair with is_staff()). Used as (select private.my_branch()) in policies so
-- Postgres evaluates it once per statement rather than once per row.
create or replace function private.my_branch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.branch_id from public.profiles p
  where p.id = (select auth.uid()) and p.active;
$$;

revoke all on all functions in schema private from public;
grant usage on schema private to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.can_see_branch(uuid) to authenticated;
grant execute on function private.my_branch() to authenticated;

-- =================================================================
-- Table privileges. anon gets nothing. authenticated may SELECT everything
-- (RLS then filters rows) and may write only the owner-managed catalogue
-- tables (RLS then restricts those writes to the owner).
-- =================================================================

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

grant select on all tables in schema public to authenticated;
grant insert, update on public.branches to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update on public.products to authenticated;
grant insert, update, delete on public.package_inclusions to authenticated;
grant insert, update, delete on public.member_tiers to authenticated;
grant insert, update, delete on public.payment_methods to authenticated;

-- Stop Supabase's default privileges from silently granting future tables to
-- the API roles; every new table must opt in here. (Tables have no
-- hard-wired PUBLIC privileges, so the per-schema revoke below is enough on
-- its own.)
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Functions are different: PostgreSQL hard-wires EXECUTE-to-PUBLIC as a
-- *global* default, and a per-schema ALTER DEFAULT PRIVILEGES can only
-- undo a previous per-schema grant — it cannot override a global one (see
-- the ALTER DEFAULT PRIVILEGES docs: "you cannot revoke privileges
-- per-schema if they are granted globally"). So every later CREATE
-- FUNCTION in public or private needs its own explicit REVOKE unless the
-- global default itself is revoked here, once, for every schema:
alter default privileges for role postgres revoke execute on functions from public;
-- Undo Supabase's own per-schema grant of EXECUTE to anon in public, now
-- that anon no longer gets it globally either.
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- =================================================================
-- Enable RLS on every table (no exceptions — SPEC §4.5)
-- =================================================================
alter table public.branches           enable row level security;
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.package_inclusions enable row level security;
alter table public.member_tiers       enable row level security;
alter table public.payment_methods    enable row level security;
alter table public.stock_ledger       enable row level security;
alter table public.stock_balances     enable row level security;
alter table public.stock_ins          enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table private.sale_sequences    enable row level security;  -- no policies: RPC-only

-- =================================================================
-- Policies
-- =================================================================

-- branches
create policy branches_select on public.branches
  for select to authenticated
  using ((select private.is_staff()) and ((select private.my_branch()) is null or id = (select private.my_branch())));
create policy branches_owner_insert on public.branches
  for insert to authenticated
  with check ((select private.is_owner()));
create policy branches_owner_update on public.branches
  for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

-- profiles: any active staff member can read the staff list (names on
-- receipts and the sales log); only the owner manages accounts.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));
create policy profiles_owner_insert on public.profiles
  for insert to authenticated
  with check ((select private.is_owner()));
create policy profiles_owner_update on public.profiles
  for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));
create policy profiles_owner_delete on public.profiles
  for delete to authenticated
  using ((select private.is_owner()));

-- Catalogue + options: every active staff member reads (POS needs prices,
-- tiers and payment methods); only the owner edits (Product master, Options).
create policy categories_select on public.categories
  for select to authenticated using ((select private.is_staff()));
create policy categories_owner_insert on public.categories
  for insert to authenticated with check ((select private.is_owner()));
create policy categories_owner_update on public.categories
  for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy categories_owner_delete on public.categories
  for delete to authenticated using ((select private.is_owner()));

create policy products_select on public.products
  for select to authenticated using ((select private.is_staff()));
create policy products_owner_insert on public.products
  for insert to authenticated with check ((select private.is_owner()));
create policy products_owner_update on public.products
  for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
-- no delete: archive (active = false) instead; sale_items reference products.

create policy package_inclusions_select on public.package_inclusions
  for select to authenticated using ((select private.is_staff()));
create policy package_inclusions_owner_insert on public.package_inclusions
  for insert to authenticated with check ((select private.is_owner()));
create policy package_inclusions_owner_update on public.package_inclusions
  for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy package_inclusions_owner_delete on public.package_inclusions
  for delete to authenticated using ((select private.is_owner()));

create policy member_tiers_select on public.member_tiers
  for select to authenticated using ((select private.is_staff()));
create policy member_tiers_owner_insert on public.member_tiers
  for insert to authenticated with check ((select private.is_owner()));
create policy member_tiers_owner_update on public.member_tiers
  for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy member_tiers_owner_delete on public.member_tiers
  for delete to authenticated using ((select private.is_owner()));

create policy payment_methods_select on public.payment_methods
  for select to authenticated using ((select private.is_staff()));
create policy payment_methods_owner_insert on public.payment_methods
  for insert to authenticated with check ((select private.is_owner()));
create policy payment_methods_owner_update on public.payment_methods
  for update to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy payment_methods_owner_delete on public.payment_methods
  for delete to authenticated using ((select private.is_owner()));

-- Stock and money: read within branch scope; writes only via RPCs.
create policy stock_ledger_select on public.stock_ledger
  for select to authenticated
  using ((select private.is_staff()) and ((select private.my_branch()) is null or branch_id = (select private.my_branch())));
create policy stock_balances_select on public.stock_balances
  for select to authenticated
  using ((select private.is_staff()) and ((select private.my_branch()) is null or branch_id = (select private.my_branch())));
create policy stock_ins_select on public.stock_ins
  for select to authenticated
  using ((select private.is_staff()) and ((select private.my_branch()) is null or branch_id = (select private.my_branch())));
create policy sales_select on public.sales
  for select to authenticated
  using ((select private.is_staff()) and ((select private.my_branch()) is null or branch_id = (select private.my_branch())));
create policy sale_items_select on public.sale_items
  for select to authenticated
  -- A line is visible exactly when its sale is (the subquery runs under
  -- sales' own RLS policy).
  using (exists (select 1 from public.sales s where s.id = sale_items.sale_id));
