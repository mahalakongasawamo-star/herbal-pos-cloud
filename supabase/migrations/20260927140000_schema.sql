-- Herbal POS Cloud — core schema (SPEC §3).
--
-- Tables are created in SPEC order. Money is numeric(14,2) PHP; timestamps
-- are timestamptz (stored UTC, shown Asia/Manila). The guard triggers at the
-- bottom enforce SPEC §4 in the database itself, so a bug in an RPC or a
-- stray SQL-editor session can't break the golden rules:
--   * stock_ledger is append-only (no UPDATE / DELETE / TRUNCATE)
--   * stock_balances is derived — only the ledger trigger may write it
--   * sales / sale_items / stock_ins are voided or reversed, never deleted

-- Internal helpers (trigger functions, RLS helpers, receipt counters) live in
-- a schema PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------- branches
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[A-Z0-9]{2,12}$'),
  name       text not null check (length(btrim(name)) > 0),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on column public.branches.code is 'Short uppercase code; prefixes receipt numbers (SPEC §7).';

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null check (role in ('owner', 'manager', 'cashier')),
  branch_id  uuid references public.branches (id),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profiles_cashier_has_branch check (role <> 'cashier' or branch_id is not null),
  constraint profiles_owner_all_branches check (role <> 'owner' or branch_id is null)
);
comment on column public.profiles.branch_id is 'null = all branches (owner, or a multi-branch manager). Cashiers always have one.';
create index profiles_branch_id_idx on public.profiles (branch_id);

-- -------------------------------------------------------------- categories
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  is_package boolean not null default false,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------- products
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique check (sku ~ '^[A-Z0-9_.-]+$'),
  name          text not null check (length(btrim(name)) > 0),
  category_id   uuid not null references public.categories (id),
  is_package    boolean not null default false,
  price         numeric(14,2) not null default 0 check (price >= 0),
  -- 0 means "not set" (legacy semantics): pricing falls through to the tier discount.
  member_price  numeric(14,2) not null default 0 check (member_price >= 0),
  -- { "<member tier name>": price }; only positive numbers count (SPEC §5).
  tier_prices   jsonb not null default '{}'::jsonb check (jsonb_typeof(tier_prices) = 'object'),
  reorder_level int not null default 10 check (reorder_level >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);

-- ------------------------------------------------------ package_inclusions
create table public.package_inclusions (
  package_product_id   uuid not null references public.products (id) on delete cascade,
  component_product_id uuid not null references public.products (id),
  qty                  int not null check (qty >= 1),
  primary key (package_product_id, component_product_id),
  check (package_product_id <> component_product_id)
);
create index package_inclusions_component_idx on public.package_inclusions (component_product_id);

-- ------------------------------------------------------------ member_tiers
create table public.member_tiers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique check (length(btrim(name)) > 0),
  -- At most 1 decimal place: private.pct_label's label must match legacy
  -- pct()'s Number.prototype.toFixed(1) exactly, and the two only agree
  -- when there's no second decimal digit to round differently (e.g. 1.45
  -- rounds to 1.5 by SQL's exact numeric rounding but to 1.4 by toFixed's
  -- IEEE-double behaviour).
  discount_pct numeric(4,1) not null default 0 check (discount_pct between 0 and 100),
  sort_order   int not null default 0
);

-- --------------------------------------------------------- payment_methods
create table public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  is_cash    boolean not null default false,
  sort_order int not null default 0
);

-- ------------------------------------------------------------ stock_ledger
-- APPEND-ONLY. Every stock movement is one signed row; stock_balances is a
-- cache of sum(delta) per (branch, product). ref_* FKs are added once
-- sales / stock_ins exist (below).
create table public.stock_ledger (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references public.branches (id),
  product_id      uuid not null references public.products (id),
  delta           int not null check (delta <> 0),
  reason          text not null check (reason in ('receive', 'sale', 'void_restock', 'reversal', 'adjustment')),
  ref_sale_id     uuid,
  ref_stock_in_id uuid,
  note            text not null default '',
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  -- Each reason has one legal shape, so a correction always points at what it corrects.
  constraint stock_ledger_reason_shape check (
       (reason = 'receive'      and delta > 0 and ref_stock_in_id is not null and ref_sale_id is null)
    or (reason = 'reversal'     and delta < 0 and ref_stock_in_id is not null and ref_sale_id is null)
    or (reason = 'sale'         and delta < 0 and ref_sale_id is not null and ref_stock_in_id is null)
    or (reason = 'void_restock' and delta > 0 and ref_sale_id is not null and ref_stock_in_id is null)
    or (reason = 'adjustment'   and ref_sale_id is null and ref_stock_in_id is null)
  )
);
create index stock_ledger_branch_product_idx on public.stock_ledger (branch_id, product_id, created_at);
create index stock_ledger_ref_sale_idx on public.stock_ledger (ref_sale_id) where ref_sale_id is not null;
create index stock_ledger_ref_stock_in_idx on public.stock_ledger (ref_stock_in_id) where ref_stock_in_id is not null;

-- ---------------------------------------------------------- stock_balances
-- Derived. Never write directly — insert into stock_ledger instead. The check
-- constraint is the last line of defence against overselling: a ledger row
-- that would take a shelf below zero fails and rolls its whole RPC back.
create table public.stock_balances (
  branch_id  uuid not null references public.branches (id),
  product_id uuid not null references public.products (id),
  qty        int not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);
create index stock_balances_product_idx on public.stock_balances (product_id);

-- --------------------------------------------------------------- stock_ins
-- A receiving batch. Its ledger rows carry ref_stock_in_id.
create table public.stock_ins (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches (id),
  date        date not null default ((now() at time zone 'Asia/Manila')::date),
  note        text not null default '',
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  reversed    boolean not null default false,
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id),
  constraint stock_ins_reversed_shape check (reversed = (reversed_at is not null))
);
create index stock_ins_branch_created_idx on public.stock_ins (branch_id, created_at desc);

-- ------------------------------------------------------------------- sales
create table public.sales (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references public.branches (id),
  receipt_no          text not null unique,
  -- Idempotency key from the till's draft: a retried commit_sale after a
  -- dropped connection returns the original sale instead of selling twice.
  client_ref          uuid not null unique,
  -- md5 of the payload that created this sale. A retry with the SAME
  -- client_ref but a CHANGED payload (the cashier edited the still-unsaved
  -- ticket before retrying, SPEC §11) must not silently return the old
  -- sale as if it matched — commit_sale checks this before replaying.
  request_hash         text not null,
  customer_name       text not null check (length(btrim(customer_name)) > 0),
  leader_name         text not null default '',
  upline_name         text not null default '',
  customer_tier       text not null check (customer_tier in ('New', 'Member')),
  member_tier         text,
  cashier_id          uuid not null references public.profiles (id),
  payment_method_id   uuid not null references public.payment_methods (id),
  payment_method_name text not null,
  is_cash             boolean not null,
  reference           text not null default '',
  gross_total         numeric(14,2) not null check (gross_total >= 0),
  discount_total      numeric(14,2) not null check (discount_total >= 0),
  total_due           numeric(14,2) not null check (total_due >= 0),
  tendered            numeric(14,2) not null check (tendered >= 0),
  change              numeric(14,2) not null check (change >= 0),
  status              text not null default 'completed' check (status in ('completed', 'void')),
  void_reason         text,
  voided_at           timestamptz,
  voided_by           uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  constraint sales_member_tier_shape check ((customer_tier = 'Member') = (member_tier is not null)),
  constraint sales_void_shape check (
    (status = 'completed' and voided_at is null and voided_by is null and void_reason is null)
    or (status = 'void' and voided_at is not null and voided_by is not null and length(btrim(coalesce(void_reason, ''))) > 0)
  ),
  constraint sales_totals_shape check (total_due = gross_total - discount_total and tendered >= total_due and change = tendered - total_due)
);
comment on column public.sales.payment_method_name is 'Snapshot, like sale_items.name: renaming a method must not rewrite old receipts.';
create index sales_branch_created_idx on public.sales (branch_id, created_at desc);
create index sales_cashier_idx on public.sales (cashier_id);

-- -------------------------------------------------------------- sale_items
-- Snapshots (sku, name, category, is_package, rule_label, inclusions) keep an
-- old receipt saying exactly what it sold after a rename or reprice.
create table public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales (id),
  line_no      int not null check (line_no >= 1),
  product_id   uuid not null references public.products (id),
  sku          text not null,
  name         text not null,
  category     text not null,
  is_package   boolean not null,
  qty          int not null check (qty >= 1),
  unit_price   numeric(14,2) not null check (unit_price >= 0),
  charged_unit numeric(14,2) not null check (charged_unit >= 0),
  gross        numeric(14,2) not null check (gross >= 0),
  discount     numeric(14,2) not null check (discount >= 0),
  net          numeric(14,2) not null check (net >= 0),
  rule_label   text not null,
  inclusions   jsonb check (inclusions is null or jsonb_typeof(inclusions) = 'array'),
  unique (sale_id, line_no),
  constraint sale_items_math check (discount = gross - net)
);
create index sale_items_product_idx on public.sale_items (product_id);

-- Ledger references, now that their targets exist.
alter table public.stock_ledger
  add constraint stock_ledger_ref_sale_fk foreign key (ref_sale_id) references public.sales (id),
  add constraint stock_ledger_ref_stock_in_fk foreign key (ref_stock_in_id) references public.stock_ins (id);

-- -------------------------------------------------- receipt counter (§7)
-- One row per (branch, Manila calendar day), incremented under a row lock
-- inside commit_sale. Never derived from count(*), never from the client.
create table private.sale_sequences (
  branch_id uuid not null references public.branches (id),
  sale_date date not null,
  last_seq  int not null check (last_seq >= 1),
  primary key (branch_id, sale_date)
);

-- =================================================================
-- Triggers
-- =================================================================

-- stock_ledger insert -> stock_balances (the only writer of that table).
create or replace function private.apply_stock_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select p.is_package from public.products p where p.id = new.product_id) then
    raise exception 'Packages are not stock items; move stock on their components instead.'
      using errcode = 'check_violation';
  end if;

  -- UPDATE first, INSERT only when no row exists yet. Postgres checks
  -- CHECK(qty >= 0) against the *proposed* INSERT row before it ever
  -- probes for a conflict (ExecConstraints runs ahead of the speculative
  -- insert), so a plain "INSERT ... ON CONFLICT DO UPDATE" fails on every
  -- negative delta even when the existing balance would stay >= 0 — i.e.
  -- on every sale and reversal. Doing the UPDATE ourselves sidesteps that;
  -- the CHECK then runs against the real resulting balance, as intended.
  update public.stock_balances b
     set qty = b.qty + new.delta, updated_at = now()
   where b.branch_id = new.branch_id and b.product_id = new.product_id;

  if not found then
    insert into public.stock_balances as b (branch_id, product_id, qty, updated_at)
    values (new.branch_id, new.product_id, new.delta, now())
    on conflict (branch_id, product_id)
    do update set qty = b.qty + excluded.qty, updated_at = now();
  end if;

  return null;
end;
$$;

create trigger stock_ledger_apply
  after insert on public.stock_ledger
  for each row execute function private.apply_stock_ledger();

-- Generic "this operation is not allowed" guard.
create or replace function private.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%.% does not allow %: %', tg_table_schema, tg_table_name, tg_op, tg_argv[0]
    using errcode = 'restrict_violation';
end;
$$;

create trigger stock_ledger_append_only
  before update or delete on public.stock_ledger
  for each row execute function private.forbid_mutation('the ledger is append-only; insert a correcting row instead');
create trigger stock_ledger_no_truncate
  before truncate on public.stock_ledger
  for each statement execute function private.forbid_mutation('the ledger is append-only');

-- stock_balances may only be written by the ledger trigger (trigger depth > 1)
-- or by private.recompute_stock_balances().
create or replace function private.guard_stock_balances()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 or current_setting('herbal.balance_recompute', true) = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'stock_balances is derived from stock_ledger; insert a ledger row instead'
    using errcode = 'restrict_violation';
end;
$$;

create trigger stock_balances_guard
  before insert or update or delete on public.stock_balances
  for each row execute function private.guard_stock_balances();

-- Sales: never deleted; the only legal update is completed -> void.
create or replace function private.guard_sales_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  void_cols constant text[] := array['status', 'void_reason', 'voided_at', 'voided_by'];
begin
  if old.status <> 'completed' or new.status <> 'void' then
    raise exception 'A sale can only change from completed to void (receipt %).', old.receipt_no
      using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - void_cols) is distinct from (to_jsonb(old) - void_cols) then
    raise exception 'Voiding a sale may not change anything but its void fields (receipt %).', old.receipt_no
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger sales_guard_update
  before update on public.sales
  for each row execute function private.guard_sales_update();
create trigger sales_no_delete
  before delete on public.sales
  for each row execute function private.forbid_mutation('void the sale instead');
create trigger sales_no_truncate
  before truncate on public.sales
  for each statement execute function private.forbid_mutation('void sales instead');

create trigger sale_items_immutable
  before update or delete on public.sale_items
  for each row execute function private.forbid_mutation('sale lines are a permanent record');
create trigger sale_items_no_truncate
  before truncate on public.sale_items
  for each statement execute function private.forbid_mutation('sale lines are a permanent record');

-- Stock-ins: never deleted; the only legal update is marking one reversed.
create or replace function private.guard_stock_ins_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  rev_cols constant text[] := array['reversed', 'reversed_at', 'reversed_by'];
begin
  if old.reversed or not new.reversed then
    raise exception 'A stock-in can only change from active to reversed.'
      using errcode = 'restrict_violation';
  end if;
  if (to_jsonb(new) - rev_cols) is distinct from (to_jsonb(old) - rev_cols) then
    raise exception 'Reversing a stock-in may not change anything but its reversal fields.'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger stock_ins_guard_update
  before update on public.stock_ins
  for each row execute function private.guard_stock_ins_update();
create trigger stock_ins_no_delete
  before delete on public.stock_ins
  for each row execute function private.forbid_mutation('reverse the stock-in instead');
create trigger stock_ins_no_truncate
  before truncate on public.stock_ins
  for each statement execute function private.forbid_mutation('reverse stock-ins instead');

-- Branches: the code is fixed once created. Receipt numbers embed it
-- (private.next_receipt_no) and sales.receipt_no is globally unique, so
-- renaming a branch's code onto another branch's code would make that
-- branch collide with receipts the other branch already issued — and every
-- sale it tries to save for the rest of that Manila day would then fail.
create or replace function private.guard_branches_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code then
    raise exception 'A branch''s code cannot change (%): receipt numbers depend on it.', old.code
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger branches_guard_update
  before update on public.branches
  for each row execute function private.guard_branches_update();

-- Products: SKU and package-ness are fixed once created (legacy UPDATE_PRODUCT
-- behaviour) — checked on UPDATE only, there being no "old" row on INSERT.
-- Also canonicalizes tier_prices on every write, INSERT or UPDATE, so the
-- database and the client (lib/pricing.js resolveUnitPrice) always read the
-- exact same values: only positive numbers survive, rounded to 2 dp,
-- exactly as legacy normalizeProduct filters tierPrices. Without this, a
-- PostgREST PATCH straight from Product master could store a string, an
-- exponent, a zero, or an unrounded fraction that private.resolve_unit_price
-- and the JS preview would then price differently.
create or replace function private.guard_products_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.sku is distinct from old.sku then
      raise exception 'A product''s SKU cannot change (%).', old.sku using errcode = 'restrict_violation';
    end if;
    if new.is_package is distinct from old.is_package then
      raise exception 'A product cannot switch between package and stock item (%).', old.sku using errcode = 'restrict_violation';
    end if;
    new.updated_at := now();
  end if;

  new.tier_prices := coalesce(
    (select jsonb_object_agg(e.key, round((e.value #>> '{}')::numeric, 2))
       from jsonb_each(new.tier_prices) e
      where jsonb_typeof(e.value) = 'number' and round((e.value #>> '{}')::numeric, 2) > 0),
    '{}'::jsonb
  );

  return new;
end;
$$;

create trigger products_guard_write
  before insert or update on public.products
  for each row execute function private.guard_products_write();

-- Package contents: a package holds stock items, never other packages.
create or replace function private.check_package_inclusion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.products p where p.id = new.package_product_id and p.is_package) then
    raise exception 'Only package products can have inclusions.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.products p where p.id = new.component_product_id and p.is_package) then
    raise exception 'A package cannot contain another package.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger package_inclusions_check
  before insert or update on public.package_inclusions
  for each row execute function private.check_package_inclusion();

-- =================================================================
-- Ledger / balance maintenance (SPEC §4.1: if they disagree, the ledger wins)
-- =================================================================

-- Rows where the cached balance disagrees with the ledger. Empty = healthy.
create or replace function private.stock_drift()
returns table (branch_id uuid, product_id uuid, balance_qty int, ledger_qty bigint)
language sql
stable
set search_path = ''
as $$
  with l as (
    select sl.branch_id, sl.product_id, sum(sl.delta) as qty
    from public.stock_ledger sl
    group by sl.branch_id, sl.product_id
  )
  select coalesce(b.branch_id, l.branch_id), coalesce(b.product_id, l.product_id),
         coalesce(b.qty, 0), coalesce(l.qty, 0)
  from public.stock_balances b
  full join l on l.branch_id = b.branch_id and l.product_id = b.product_id
  where coalesce(b.qty, 0) <> coalesce(l.qty, 0);
$$;

-- Rebuilds stock_balances from the ledger. Admin-only (not granted to API roles).
create or replace function private.recompute_stock_balances()
returns int
language plpgsql
set search_path = ''
as $$
declare
  fixed int;
begin
  perform set_config('herbal.balance_recompute', 'on', true);
  lock table public.stock_balances in exclusive mode;

  with l as (
    select sl.branch_id, sl.product_id, sum(sl.delta)::int as qty
    from public.stock_ledger sl
    group by sl.branch_id, sl.product_id
  ), up as (
    insert into public.stock_balances as b (branch_id, product_id, qty, updated_at)
    select l.branch_id, l.product_id, l.qty, now() from l
    on conflict (branch_id, product_id)
    do update set qty = excluded.qty, updated_at = now()
    where b.qty <> excluded.qty
    returning 1
  )
  select count(*) into fixed from up;

  delete from public.stock_balances b
  where not exists (
    select 1 from public.stock_ledger sl where sl.branch_id = b.branch_id and sl.product_id = b.product_id
  );

  perform set_config('herbal.balance_recompute', 'off', true);
  return fixed;
end;
$$;

-- =================================================================
-- Realtime (SPEC §8): Inventory/POS watch balances, Sales log watches sales.
-- =================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.stock_balances, public.sales;
  end if;
end;
$$;
