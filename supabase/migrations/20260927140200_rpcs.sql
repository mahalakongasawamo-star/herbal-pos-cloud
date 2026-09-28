-- Herbal POS Cloud — the four money/stock RPCs (SPEC §6) and receipt numbers (§7).
--
-- Each RPC is one Postgres function = one transaction: all of it lands or
-- none of it does. They are security definer (the tables have no write
-- policies), so each one does its own caller/role/branch checks against
-- public.profiles, and never trusts a total, price, receipt number or role
-- from the client.
--
-- Errors: every raise carries a human-readable message (the POS can show it
-- as-is) and a machine-readable HINT code (not_staff, forbidden, invalid,
-- insufficient_stock, price_mismatch, not_found, already_void,
-- already_reversed, would_go_negative). Details, where useful, are JSON.
--
-- Lock order, identical everywhere, so concurrent calls can't deadlock:
--   (commit_sale) client_ref advisory lock
--   -> the sale / stock-in header row being changed
--   -> stock_balances rows, ascending product_id
--   -> (commit_sale) the day's receipt counter row

-- (The global "revoke execute on functions from public" in
-- 20260927140100_rls.sql already covers every schema, including this one —
-- a per-schema revoke here would be a no-op, see that file's comment.)

-- =================================================================
-- Small pure helpers (ports of legacy lib/format.js)
-- =================================================================

-- norm(): collapse whitespace and trim.
create or replace function private.norm(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(s, ''), '\s+', ' ', 'g'));
$$;

-- cleanSku(): uppercase, spaces -> '-', drop anything outside A-Z 0-9 - _ .
create or replace function private.clean_sku(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(regexp_replace(upper(private.norm(s)), '\s+', '-', 'g'), '[^A-Z0-9_.-]', '', 'g');
$$;

-- pct(): 10 -> '10%', 7.5 -> '7.5%'.
create or replace function private.pct_label(v numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when v = trunc(v) then trunc(v)::bigint::text
              else to_char(round(v, 1), 'FM999990.0') end || '%';
$$;

-- peso(): 1234.5 -> '₱1,234.50'.
create or replace function private.peso(v numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₱' || to_char(round(v, 2), 'FM999,999,999,990.00');
$$;

-- A uuid, or null when the text isn't one (no exception, no subtransaction).
create or replace function private.try_uuid(s text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then s::uuid end;
$$;

-- A whole number >= 1 from a JSON value, or null.
create or replace function private.json_pos_int(v jsonb)
returns int
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(v) = 'number'
         and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
         and (v #>> '{}')::numeric between 1 and 1000000
    then (v #>> '{}')::numeric::int
  end;
$$;

-- A non-negative money amount from a JSON number, or null.
create or replace function private.json_money(v jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric between 0 and 999999999999.99
    then (v #>> '{}')::numeric
  end;
$$;

-- =================================================================
-- Pricing — exact port of legacy lib/pricing.js resolveUnitPrice (SPEC §5)
-- =================================================================
-- New customers pay retail. Members, in order: the product's price for their
-- tier, else its member price, else retail less the tier's discount %.
-- Prices of 0 mean "not set" and fall through, as in the Vite app.
create or replace function private.resolve_unit_price(
  p_price        numeric,
  p_member_price numeric,
  p_tier_prices  jsonb,
  p_customer_tier text,
  p_member_tier  text,
  p_discount_pct numeric,
  out retail numeric,
  out unit   numeric,
  out rule   text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raw        jsonb;
  v_tier_price numeric;
  v_off        numeric;
begin
  retail := greatest(0, coalesce(p_price, 0));

  if p_customer_tier is distinct from 'Member' or coalesce(p_member_tier, '') = '' then
    unit := retail;
    rule := 'Retail price';
    return;
  end if;

  v_raw := coalesce(p_tier_prices, '{}'::jsonb) -> p_member_tier;
  if jsonb_typeof(v_raw) = 'number' then
    v_tier_price := round((v_raw #>> '{}')::numeric, 2);
  elsif jsonb_typeof(v_raw) = 'string' and btrim(v_raw #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' then
    v_tier_price := round(btrim(v_raw #>> '{}')::numeric, 2);
  end if;
  if v_tier_price > 0 then
    unit := v_tier_price;
    rule := p_member_tier || ' price';
    return;
  end if;

  if coalesce(p_member_price, 0) > 0 then
    unit := p_member_price;
    rule := 'Member price';
    return;
  end if;

  v_off := least(100, greatest(0, coalesce(p_discount_pct, 0)));
  if v_off > 0 and retail > 0 then
    unit := round(retail * (1 - v_off / 100), 2);
    rule := p_member_tier || ' ' || private.pct_label(v_off) || ' off';
    return;
  end if;

  unit := retail;
  rule := 'Retail price';
end;
$$;

-- =================================================================
-- Receipt numbers (SPEC §7): {BRANCH}-{YYYYMMDD}-{daily seq}
-- =================================================================
-- The per-(branch, Manila day) counter row is upserted under its row lock, so
-- concurrent sales at one branch serialize here and each gets the next
-- number. Rolled-back sales roll their increment back too: no gaps, no
-- duplicates. 4 digits, widening (not wrapping) past 9999.
create or replace function private.next_receipt_no(p_branch_id uuid, p_branch_code text, p_day date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq int;
begin
  insert into private.sale_sequences as q (branch_id, sale_date, last_seq)
  values (p_branch_id, p_day, 1)
  on conflict (branch_id, sale_date) do update set last_seq = q.last_seq + 1
  returning q.last_seq into v_seq;

  return p_branch_code || '-' || to_char(p_day, 'YYYYMMDD') || '-'
         || case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end;
end;
$$;

-- The signed-in, active caller's profile, or an error.
create or replace function private.require_staff()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles p where p.id = (select auth.uid()) and p.active;
  if not found then
    raise exception 'You are not signed in as active staff.'
      using errcode = '42501', hint = 'not_staff';
  end if;
  return me;
end;
$$;

-- =================================================================
-- commit_sale(payload jsonb) -> sales
-- =================================================================
-- payload:
--   client_ref        uuid   required — the POS draft's id (idempotency key)
--   branch_id         uuid   optional for single-branch staff (defaults to theirs,
--                            must match if given); required for owner / all-branch manager
--   customer_name     text   required
--   leader_name, upline_name text
--   customer_tier     'New' | 'Member' (default 'New')
--   member_tier       text   tier name, required when Member
--   payment_method_id uuid   required
--   tendered          number required for cash methods (>= total)
--   reference         text   non-cash reference no.
--   expected_total    number the total the POS showed; rejected if the server's
--                            recomputed total differs by more than ₱0.01
--   lines             [{ product_id uuid, qty int >= 1 }, ...]
create or replace function public.commit_sale(payload jsonb)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  me           public.profiles;
  v_client_ref uuid;
  v_req_hash   text;
  v_existing   public.sales;
  v_branch_id  uuid;
  v_branch     public.branches;
  v_customer   text;
  v_ctier      text;
  v_mtier_name text;
  v_mtier_pct  numeric;
  v_pm         public.payment_methods;
  v_lines      jsonb;
  v_line       jsonb;
  v_line_no    int := 0;
  v_qty        int;
  v_p          public.products;
  v_cat        text;
  v_price      record;
  v_base       numeric;
  v_l_gross    numeric;
  v_l_net      numeric;
  v_l_incl     jsonb;
  v_l_comp     jsonb;
  v_gross      numeric := 0;
  v_discount   numeric := 0;
  v_total      numeric := 0;
  v_items      jsonb := '[]'::jsonb;
  v_comp       jsonb := '[]'::jsonb;
  v_needs      jsonb := '[]'::jsonb;
  v_short      jsonb := '[]'::jsonb;
  v_short_msg  text := '';
  v_have       int;
  v_expected   numeric;
  v_tendered   numeric;
  v_change     numeric;
  v_reference  text;
  v_day        date := (now() at time zone 'Asia/Manila')::date;
  v_receipt    text;
  v_sale       public.sales;
  r            record;
begin
  me := private.require_staff();

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'The sale must be a JSON object.' using errcode = '22023', hint = 'invalid';
  end if;

  -- Idempotency: a retry of the same ticket (same client_ref, unchanged
  -- payload) returns the sale already saved instead of selling twice. jsonb
  -- normalizes key order on ::text, so this hash only changes when the
  -- ticket's actual content does.
  v_client_ref := private.try_uuid(payload ->> 'client_ref');
  if v_client_ref is null then
    raise exception 'client_ref (the ticket''s draft id) is required.' using errcode = '22023', hint = 'invalid';
  end if;
  v_req_hash := md5(payload::text);
  perform pg_advisory_xact_lock(hashtextextended('commit_sale:' || v_client_ref::text, 0));
  select * into v_existing from public.sales s where s.client_ref = v_client_ref;
  if found then
    if v_existing.cashier_id <> me.id then
      raise exception 'This ticket was already saved by someone else.' using errcode = '42501', hint = 'forbidden';
    end if;
    if v_existing.request_hash <> v_req_hash then
      raise exception 'Receipt % was already saved for this ticket, and the ticket has changed since. Start a new ticket for the changes.', v_existing.receipt_no
        using errcode = 'P0001', hint = 'already_saved',
              detail = jsonb_build_object('sale_id', v_existing.id, 'receipt_no', v_existing.receipt_no)::text;
    end if;
    return v_existing;
  end if;

  -- Branch: the caller's own, or (all-branch staff) the one they chose.
  if coalesce(payload ->> 'branch_id', '') = '' then
    v_branch_id := me.branch_id;
  else
    v_branch_id := private.try_uuid(payload ->> 'branch_id');
    if v_branch_id is null then
      raise exception 'branch_id is not a valid id.' using errcode = '22023', hint = 'invalid';
    end if;
  end if;
  if v_branch_id is null then
    raise exception 'Choose the branch this sale is for.' using errcode = '22023', hint = 'invalid';
  end if;
  if me.branch_id is not null and me.branch_id <> v_branch_id then
    raise exception 'You can only sell at your own branch.' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into v_branch from public.branches b where b.id = v_branch_id;
  if not found or not v_branch.active then
    raise exception 'That branch is not open for sales.' using errcode = '22023', hint = 'invalid';
  end if;

  -- Customer profile (same rules as the Vite POS's validate()).
  v_customer := private.norm(payload ->> 'customer_name');
  if v_customer = '' then
    raise exception 'Enter the customer’s name.' using errcode = '22023', hint = 'invalid';
  end if;
  v_ctier := coalesce(nullif(payload ->> 'customer_tier', ''), 'New');
  if v_ctier not in ('New', 'Member') then
    raise exception 'Customer tier must be New or Member.' using errcode = '22023', hint = 'invalid';
  end if;
  if v_ctier = 'Member' then
    v_mtier_name := private.norm(payload ->> 'member_tier');
    select t.discount_pct into v_mtier_pct from public.member_tiers t where t.name = v_mtier_name;
    if not found then
      raise exception 'Choose the member tier.' using errcode = '22023', hint = 'invalid';
    end if;
  end if;

  select * into v_pm from public.payment_methods m where m.id = private.try_uuid(payload ->> 'payment_method_id');
  if not found then
    raise exception 'Choose how the customer is paying.' using errcode = '22023', hint = 'invalid';
  end if;

  -- Lines: price every one server-side from current catalogue data.
  v_lines := payload -> 'lines';
  -- Two separate checks: SQL doesn't guarantee OR short-circuits, and
  -- jsonb_array_length() throws on a non-array.
  if jsonb_typeof(v_lines) is distinct from 'array' then
    raise exception 'Add at least one product to the order.' using errcode = '22023', hint = 'invalid';
  end if;
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Add at least one product to the order.' using errcode = '22023', hint = 'invalid';
  end if;
  if jsonb_array_length(v_lines) > 200 then
    raise exception 'A ticket can have at most 200 lines.' using errcode = '22023', hint = 'invalid';
  end if;

  for v_line in select e.value from jsonb_array_elements(v_lines) with ordinality as e(value, ord) order by e.ord loop
    v_line_no := v_line_no + 1;

    v_qty := private.json_pos_int(v_line -> 'qty');
    if v_qty is null then
      raise exception 'Line %: quantity must be a whole number of at least 1.', v_line_no
        using errcode = '22023', hint = 'invalid';
    end if;

    select * into v_p from public.products p where p.id = private.try_uuid(v_line ->> 'product_id');
    if not found then
      raise exception 'Line %: that product doesn’t exist.', v_line_no using errcode = '22023', hint = 'invalid';
    end if;
    if not v_p.active then
      raise exception 'Remove the products marked unavailable (%).', v_p.name using errcode = '22023', hint = 'invalid';
    end if;
    select c.name into v_cat from public.categories c where c.id = v_p.category_id;

    select * into v_price from private.resolve_unit_price(
      v_p.price, v_p.member_price, v_p.tier_prices, v_ctier, v_mtier_name, v_mtier_pct);

    -- Line math, as legacy computeCart: unit = max(retail, charged).
    v_base    := greatest(v_price.retail, v_price.unit);
    v_l_gross := round(v_base * v_qty, 2);
    v_l_net   := round(v_price.unit * v_qty, 2);
    v_gross    := v_gross + v_l_gross;
    v_discount := v_discount + (v_l_gross - v_l_net);
    v_total    := v_total + v_l_net;

    -- Read a package's contents exactly once and use that one read for both
    -- the receipt snapshot (v_l_incl) and the stock this line needs
    -- (v_l_comp, folded into v_comp below). Two separate reads here would
    -- open a window between pricing and deduction where the owner could
    -- edit the package's contents in between, leaving the receipt saying
    -- one thing and stock_ledger deducting another.
    if v_p.is_package then
      select coalesce(jsonb_agg(jsonb_build_object('sku', c.sku, 'name', c.name, 'qty', pi.qty) order by c.name), '[]'::jsonb),
             coalesce(jsonb_agg(jsonb_build_object('pid', c.id, 'q', pi.qty * v_qty)), '[]'::jsonb)
        into v_l_incl, v_l_comp
        from public.package_inclusions pi
        join public.products c on c.id = pi.component_product_id
       where pi.package_product_id = v_p.id;
    else
      v_l_incl := null;
      v_l_comp := jsonb_build_array(jsonb_build_object('pid', v_p.id, 'q', v_qty));
    end if;
    v_comp := v_comp || v_l_comp;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'line_no', v_line_no, 'product_id', v_p.id, 'sku', v_p.sku, 'name', v_p.name,
      'category', coalesce(v_cat, ''), 'is_package', v_p.is_package, 'qty', v_qty,
      'unit_price', v_base, 'charged_unit', v_price.unit,
      'gross', v_l_gross, 'discount', v_l_gross - v_l_net, 'net', v_l_net,
      'rule_label', v_price.rule, 'inclusions', v_l_incl));
  end loop;

  -- Stock this ticket needs at this branch (v_comp: packages already
  -- expanded to their components, from the same read as the receipt
  -- snapshot above). Lock each balance row (ascending product_id) and
  -- check it.
  for r in
    select n.pid, sum(n.q)::int as need, p.sku, p.name
    from jsonb_to_recordset(v_comp) as n(pid uuid, q int)
    join public.products p on p.id = n.pid
    group by n.pid, p.sku, p.name
    order by n.pid
  loop
    select b.qty into v_have
      from public.stock_balances b
     where b.branch_id = v_branch.id and b.product_id = r.pid
       for update;
    v_have := coalesce(v_have, 0);
    if v_have < r.need then
      v_short := v_short || jsonb_build_array(jsonb_build_object(
        'product_id', r.pid, 'sku', r.sku, 'name', r.name, 'need', r.need, 'have', greatest(0, v_have)));
      v_short_msg := v_short_msg || case when v_short_msg = '' then '' else ' ' end
        || format('%s: this order needs %s, %s in stock.', r.name, r.need, greatest(0, v_have));
    end if;
    v_needs := v_needs || jsonb_build_array(jsonb_build_object('pid', r.pid, 'need', r.need));
  end loop;
  if jsonb_array_length(v_short) > 0 then
    raise exception '%', v_short_msg
      using errcode = 'P0001', hint = 'insufficient_stock', detail = v_short::text;
  end if;

  -- Never trust the client's total: it must match the server's to the centavo.
  v_expected := private.json_money(payload -> 'expected_total');
  if v_expected is null then
    raise exception 'expected_total (the total the POS showed) is required.' using errcode = '22023', hint = 'invalid';
  end if;
  if abs(v_expected - v_total) > 0.01 then
    raise exception 'Prices changed since this ticket was opened: the total is now %, not %. Review the ticket and save again.',
      private.peso(v_total), private.peso(v_expected)
      using errcode = 'P0001', hint = 'price_mismatch',
            detail = jsonb_build_object('expected_total', v_expected, 'total_due', v_total)::text;
  end if;

  if v_pm.is_cash then
    v_tendered := private.json_money(payload -> 'tendered');
    if v_tendered is null then
      raise exception 'Enter the cash tendered.' using errcode = '22023', hint = 'invalid';
    end if;
    v_tendered := round(v_tendered, 2);
    if v_tendered < v_total then
      raise exception 'Cash tendered is % short of the total.', private.peso(v_total - v_tendered)
        using errcode = '22023', hint = 'invalid';
    end if;
    v_change := v_tendered - v_total;
    v_reference := '';
  else
    v_tendered := v_total;
    v_change := 0;
    v_reference := private.norm(payload ->> 'reference');
  end if;

  -- Everything checks out: take the next receipt number and write it all.
  v_receipt := private.next_receipt_no(v_branch.id, v_branch.code, v_day);

  insert into public.sales (
    branch_id, receipt_no, client_ref, request_hash, customer_name, leader_name, upline_name,
    customer_tier, member_tier, cashier_id, payment_method_id, payment_method_name,
    is_cash, reference, gross_total, discount_total, total_due, tendered, change
  ) values (
    v_branch.id, v_receipt, v_client_ref, v_req_hash, v_customer,
    private.norm(payload ->> 'leader_name'), private.norm(payload ->> 'upline_name'),
    v_ctier, v_mtier_name, me.id, v_pm.id, v_pm.name,
    v_pm.is_cash, v_reference, v_gross, v_discount, v_total, v_tendered, v_change
  )
  returning * into v_sale;

  insert into public.sale_items (
    sale_id, line_no, product_id, sku, name, category, is_package, qty,
    unit_price, charged_unit, gross, discount, net, rule_label, inclusions
  )
  select v_sale.id, x.line_no, x.product_id, x.sku, x.name, x.category, x.is_package, x.qty,
         x.unit_price, x.charged_unit, x.gross, x.discount, x.net, x.rule_label, x.inclusions
  from jsonb_to_recordset(v_items) as x(
    line_no int, product_id uuid, sku text, name text, category text, is_package boolean, qty int,
    unit_price numeric, charged_unit numeric, gross numeric, discount numeric, net numeric,
    rule_label text, inclusions jsonb)
  order by x.line_no;

  insert into public.stock_ledger (branch_id, product_id, delta, reason, ref_sale_id, note, created_by)
  select v_branch.id, x.pid, -x.need, 'sale', v_sale.id, v_receipt, me.id
  from jsonb_to_recordset(v_needs) as x(pid uuid, need int)
  where x.need > 0
  order by x.pid;

  return v_sale;
end;
$$;

-- =================================================================
-- void_sale(sale_id, reason) -> sales
-- =================================================================
-- Owner: any sale. Manager / cashier: sales at a branch in their scope.
-- Flips the sale to void and puts back exactly what it deducted.
create or replace function public.void_sale(sale_id uuid, reason text)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       public.profiles;
  v_sale   public.sales;
  v_reason text := private.norm(void_sale.reason);
begin
  me := private.require_staff();

  select * into v_sale from public.sales s where s.id = void_sale.sale_id for update;
  if not found then
    raise exception 'That sale doesn’t exist.' using errcode = '22023', hint = 'not_found';
  end if;
  if me.role <> 'owner' and me.branch_id is not null and me.branch_id <> v_sale.branch_id then
    raise exception 'You can only void sales from your own branch.' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_sale.status = 'void' then
    raise exception 'Receipt % is already void.', v_sale.receipt_no using errcode = 'P0001', hint = 'already_void';
  end if;
  if v_reason = '' then
    raise exception 'Enter a reason for the void.' using errcode = '22023', hint = 'invalid';
  end if;

  insert into public.stock_ledger (branch_id, product_id, delta, reason, ref_sale_id, note, created_by)
  select v_sale.branch_id, l.product_id, -sum(l.delta)::int, 'void_restock', v_sale.id,
         'Void of ' || v_sale.receipt_no, me.id
  from public.stock_ledger l
  where l.ref_sale_id = v_sale.id and l.reason = 'sale'
  group by l.product_id
  order by l.product_id;

  update public.sales s
     set status = 'void', void_reason = v_reason, voided_at = now(), voided_by = me.id
   where s.id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

-- =================================================================
-- receive_stock(branch_id, entries, new_products, stock_date, note) -> stock_ins
-- =================================================================
-- entries:      [{ product_id uuid | sku text, qty int >= 1, note text }]
-- new_products: [{ sku, name, category, is_package, price, member_price,
--                  tier_prices, reorder_level, inclusions: [{sku, qty}] }]
--   Registering products needs manager or owner; setting any price needs the
--   owner (SPEC §2). A SKU that already exists is left as-is (legacy
--   behaviour), so two tills registering the same new item don't collide.
-- stock_date / note: the batch header's date (default: today in Manila) and note.
-- Returns the new stock_ins header as a single-row set, or no rows when only
-- products were registered (setof, not a nullable composite: PostgREST's
-- `select * from receive_stock(...)` would otherwise turn a NULL composite
-- into one row of all-NULL columns instead of "no rows").
create or replace function public.receive_stock(
  branch_id    uuid,
  entries      jsonb[],
  new_products jsonb[] default '{}',
  stock_date   date default null,
  note         text default ''
)
returns setof public.stock_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  me          public.profiles;
  v_branch    public.branches;
  v_np        jsonb;
  v_inc       jsonb;
  v_sku       text;
  v_name      text;
  v_is_pkg    boolean;
  v_cat_name  text;
  v_cat_id    uuid;
  v_price     numeric;
  v_mprice    numeric;
  v_tiers     jsonb;
  v_reorder   int;
  v_pid       uuid;
  v_new_id    uuid;
  v_created   uuid[] := '{}';
  v_comp      public.products;
  v_inc_qty   int;
  v_e         jsonb;
  v_ord       int := 0;
  v_p         public.products;
  v_qty       int;
  v_rows      jsonb := '[]'::jsonb;
  v_note      text := private.norm(receive_stock.note);
  v_si        public.stock_ins;
begin
  me := private.require_staff();

  -- Scope check before the lookup: a single-branch cashier or manager must
  -- not learn whether another branch id exists or is active (branches RLS
  -- already hides that from them).
  if me.branch_id is not null and me.branch_id is distinct from receive_stock.branch_id then
    raise exception 'You can only receive stock at your own branch.' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into v_branch from public.branches b where b.id = receive_stock.branch_id;
  if not found or not v_branch.active then
    raise exception 'That branch is not open.' using errcode = '22023', hint = 'invalid';
  end if;

  -- 1. Register new products (pass 1: products; pass 2: package contents, so a
  --    package may include an item registered in the same call).
  if coalesce(cardinality(receive_stock.new_products), 0) > 0 then
    if me.role not in ('owner', 'manager') then
      raise exception 'Only a manager or the owner can register new products.' using errcode = '42501', hint = 'forbidden';
    end if;

    -- Category inserts first, in a canonical order (by name), so two
    -- concurrent calls that register overlapping new categories in
    -- different orders can't deadlock on each other's ON CONFLICT probes.
    -- Skips entries whose SKU already exists — an existing product is left
    -- entirely as-is (legacy RECEIVE_STOCK behaviour), so it must not leave
    -- a stray new category behind either.
    for v_cat_name, v_is_pkg in
      select distinct on (cat) cat, pkg
      from (
        select coalesce(nullif(private.norm(e.value ->> 'category'), ''),
                        case when coalesce(e.value -> 'is_package' = 'true'::jsonb, false)
                             then 'Entry Packages' else 'Uncategorized' end) as cat,
               coalesce(e.value -> 'is_package' = 'true'::jsonb, false) as pkg,
               e.ordinality as ord
        from unnest(receive_stock.new_products) with ordinality as e(value, ordinality)
        where not exists (
          select 1 from public.products p where p.sku = private.clean_sku(e.value ->> 'sku')
        )
      ) s
      order by cat, ord
    loop
      insert into public.categories as c (name, is_package, sort_order)
      values (v_cat_name, v_is_pkg, (select coalesce(max(c2.sort_order), 0) + 1 from public.categories c2))
      on conflict (name) do nothing;
    end loop;

    -- Products next, in SKU order for the same reason.
    for v_np in select e.value from unnest(receive_stock.new_products) with ordinality as e(value, ordinality)
                order by private.clean_sku(e.value ->> 'sku')
    loop
      if jsonb_typeof(v_np) is distinct from 'object' then
        raise exception 'Each new product must be a JSON object.' using errcode = '22023', hint = 'invalid';
      end if;
      v_sku := private.clean_sku(v_np ->> 'sku');
      v_name := private.norm(v_np ->> 'name');
      if v_sku = '' or v_name = '' then
        raise exception 'A new product needs a SKU and a name.' using errcode = '22023', hint = 'invalid';
      end if;
      -- An existing SKU is left entirely as-is (legacy RECEIVE_STOCK
      -- behaviour) — skip before any of its fields are even validated, so a
      -- till re-sending a product it already knows about can't be blocked
      -- by a price/name check whose result would be discarded anyway.
      continue when exists (select 1 from public.products p where p.sku = v_sku);

      v_is_pkg := coalesce(v_np -> 'is_package' = 'true'::jsonb, false);
      -- Packages are Product master's territory, not Add stock's: only the
      -- owner may create one, or hand it inclusions (SPEC §2 — a manager
      -- gets no price edits, and a package's contents fix its effective
      -- price on every future sale just as surely as a price field would).
      if v_is_pkg and me.role <> 'owner' then
        raise exception 'Only the owner can create packages (Product master).' using errcode = '42501', hint = 'forbidden';
      end if;
      if v_np ? 'inclusions' and me.role <> 'owner' then
        raise exception 'Only the owner can set a package''s contents (Product master).' using errcode = '42501', hint = 'forbidden';
      end if;

      v_cat_name := coalesce(nullif(private.norm(v_np ->> 'category'), ''),
                             case when v_is_pkg then 'Entry Packages' else 'Uncategorized' end);
      v_price  := coalesce(private.json_money(v_np -> 'price'), 0);
      v_mprice := coalesce(private.json_money(v_np -> 'member_price'), 0);
      select coalesce(jsonb_object_agg(t.key, round((t.value #>> '{}')::numeric, 2)), '{}'::jsonb)
        into v_tiers
        from jsonb_each(case when jsonb_typeof(v_np -> 'tier_prices') = 'object' then v_np -> 'tier_prices' else '{}'::jsonb end) t
       where jsonb_typeof(t.value) = 'number' and (t.value #>> '{}')::numeric > 0;
      if (v_price > 0 or v_mprice > 0 or v_tiers <> '{}'::jsonb) and me.role <> 'owner' then
        raise exception 'Only the owner can set prices. Register % at ₱0 and ask the owner to price it.', v_name
          using errcode = '42501', hint = 'forbidden';
      end if;
      v_reorder := case when v_is_pkg then 0
                        else coalesce(floor(private.json_money(v_np -> 'reorder_level'))::int, 10) end;

      select c.id into v_cat_id from public.categories c where c.name = v_cat_name;

      v_new_id := null;
      insert into public.products (sku, name, category_id, is_package, price, member_price, tier_prices, reorder_level)
      values (v_sku, v_name, v_cat_id, v_is_pkg, v_price, v_mprice, v_tiers, v_reorder)
      on conflict (sku) do nothing
      returning id into v_new_id;
      -- Only the transaction whose INSERT actually won holds the id, so two
      -- concurrent calls registering the same new package can never both
      -- think they created it (which is what pass 2 checks below).
      if v_new_id is not null then
        v_created := v_created || v_new_id;
      end if;
    end loop;

    foreach v_np in array receive_stock.new_products loop
      if coalesce(v_np -> 'is_package' = 'true'::jsonb, false) and jsonb_typeof(v_np -> 'inclusions') = 'array' then
        select p.id into v_pid from public.products p where p.sku = private.clean_sku(v_np ->> 'sku') and p.is_package;
        -- Only fill contents for a package THIS CALL created — not merely
        -- one with no inclusions yet, which a concurrent call could also
        -- believe (that let two racing calls double a package's contents).
        continue when v_pid is null or not (v_pid = any (v_created));
        for v_inc in select e.value from jsonb_array_elements(v_np -> 'inclusions') e loop
          select * into v_comp from public.products p where p.sku = private.clean_sku(v_inc ->> 'sku');
          if not found then
            raise exception 'Package %: no product with SKU %.', v_np ->> 'sku', v_inc ->> 'sku'
              using errcode = '22023', hint = 'invalid';
          end if;
          v_inc_qty := greatest(1, coalesce(floor(private.json_money(v_inc -> 'qty'))::int, 1));
          insert into public.package_inclusions as pi (package_product_id, component_product_id, qty)
          values (v_pid, v_comp.id, v_inc_qty)
          on conflict (package_product_id, component_product_id) do update set qty = pi.qty + excluded.qty;
        end loop;
      end if;
    end loop;
  end if;

  -- 2. Nothing to receive: products registered only — no rows.
  if coalesce(cardinality(receive_stock.entries), 0) = 0 then
    if coalesce(cardinality(receive_stock.new_products), 0) = 0 then
      raise exception 'Nothing to receive.' using errcode = '22023', hint = 'invalid';
    end if;
    return;
  end if;

  -- 3. Validate every entry before writing anything.
  foreach v_e in array receive_stock.entries loop
    v_ord := v_ord + 1;
    if jsonb_typeof(v_e) is distinct from 'object' then
      raise exception 'Entry %: must be a JSON object.', v_ord using errcode = '22023', hint = 'invalid';
    end if;
    if coalesce(v_e ->> 'product_id', '') <> '' then
      select * into v_p from public.products p where p.id = private.try_uuid(v_e ->> 'product_id');
    else
      select * into v_p from public.products p where p.sku = private.clean_sku(v_e ->> 'sku');
    end if;
    if not found then
      raise exception 'Entry %: that product doesn’t exist.', v_ord using errcode = '22023', hint = 'invalid';
    end if;
    if v_p.is_package then
      raise exception '% is a package — receive its contents instead.', v_p.name using errcode = '22023', hint = 'invalid';
    end if;
    v_qty := private.json_pos_int(v_e -> 'qty');
    if v_qty is null then
      raise exception 'Entry % (%): quantity must be a whole number of at least 1.', v_ord, v_p.name
        using errcode = '22023', hint = 'invalid';
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'pid', v_p.id, 'qty', v_qty, 'ord', v_ord,
      'note', coalesce(nullif(private.norm(v_e ->> 'note'), ''), v_note)));
  end loop;

  -- 4. Header + ledger rows (ascending product_id — the shared lock order).
  insert into public.stock_ins (branch_id, date, note, created_by)
  values (v_branch.id, coalesce(receive_stock.stock_date, (now() at time zone 'Asia/Manila')::date), v_note, me.id)
  returning * into v_si;

  insert into public.stock_ledger (branch_id, product_id, delta, reason, ref_stock_in_id, note, created_by)
  select v_branch.id, x.pid, x.qty, 'receive', v_si.id, x.note, me.id
  from jsonb_to_recordset(v_rows) as x(pid uuid, qty int, ord int, note text)
  order by x.pid, x.ord;

  return next v_si;
  return;
end;
$$;

-- =================================================================
-- reverse_stock_in(stock_in_id) -> void
-- =================================================================
-- Owner / manager (in scope): any batch. Cashier: only a batch they received
-- themselves. Refuses — changing nothing — if taking the batch back out
-- would push any product at that branch below zero (i.e. it's been sold).
create or replace function public.reverse_stock_in(stock_in_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me        public.profiles;
  v_si      public.stock_ins;
  v_have    int;
  v_short   jsonb := '[]'::jsonb;
  v_names   text := '';
  r         record;
begin
  me := private.require_staff();

  select * into v_si from public.stock_ins s where s.id = reverse_stock_in.stock_in_id for update;
  if not found then
    raise exception 'That stock-in doesn’t exist.' using errcode = '22023', hint = 'not_found';
  end if;
  if me.branch_id is not null and me.branch_id <> v_si.branch_id then
    raise exception 'You can only reverse stock-ins at your own branch.' using errcode = '42501', hint = 'forbidden';
  end if;
  if me.role = 'cashier' and v_si.created_by is distinct from me.id then
    raise exception 'Only a manager or the owner can reverse stock someone else received.' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_si.reversed then
    raise exception 'This stock-in was already reversed.' using errcode = 'P0001', hint = 'already_reversed';
  end if;

  for r in
    select l.product_id, sum(l.delta)::int as qty, p.name
    from public.stock_ledger l join public.products p on p.id = l.product_id
    where l.ref_stock_in_id = v_si.id and l.reason = 'receive'
    group by l.product_id, p.name
    order by l.product_id
  loop
    select b.qty into v_have
      from public.stock_balances b
     where b.branch_id = v_si.branch_id and b.product_id = r.product_id
       for update;
    v_have := coalesce(v_have, 0);
    if v_have - r.qty < 0 then
      v_short := v_short || jsonb_build_array(jsonb_build_object(
        'product_id', r.product_id, 'name', r.name, 'received', r.qty, 'on_hand', v_have));
      v_names := v_names || case when v_names = '' then '' else ', ' end || r.name;
    end if;
  end loop;
  if jsonb_array_length(v_short) > 0 then
    raise exception 'Can’t reverse this stock-in: some of it has already been sold (%).', v_names
      using errcode = 'P0001', hint = 'would_go_negative', detail = v_short::text;
  end if;

  insert into public.stock_ledger (branch_id, product_id, delta, reason, ref_stock_in_id, note, created_by)
  select v_si.branch_id, l.product_id, -sum(l.delta)::int, 'reversal', v_si.id,
         'Reversal of stock-in ' || to_char(v_si.date, 'YYYY-MM-DD'), me.id
  from public.stock_ledger l
  where l.ref_stock_in_id = v_si.id and l.reason = 'receive'
  group by l.product_id
  order by l.product_id;

  update public.stock_ins s
     set reversed = true, reversed_at = now(), reversed_by = me.id
   where s.id = v_si.id;
end;
$$;

-- =================================================================
-- Privileges: the four RPCs are the only write path for money and stock.
-- =================================================================
revoke all on function public.commit_sale(jsonb) from public, anon;
revoke all on function public.void_sale(uuid, text) from public, anon;
revoke all on function public.receive_stock(uuid, jsonb[], jsonb[], date, text) from public, anon;
revoke all on function public.reverse_stock_in(uuid) from public, anon;
grant execute on function public.commit_sale(jsonb) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
grant execute on function public.receive_stock(uuid, jsonb[], jsonb[], date, text) to authenticated;
grant execute on function public.reverse_stock_in(uuid) to authenticated;

-- Internal helpers are callable only from inside the RPCs above (which run as
-- the function owner).
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.can_see_branch(uuid) to authenticated;
grant execute on function private.my_branch() to authenticated;
