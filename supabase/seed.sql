-- Herbal POS Cloud — seed data (branches, catalogue, tiers, payment
-- methods only — no accounts; see seeds/local_users.sql for why).
--
-- Runs on `supabase db reset` and `supabase start`, and — unlike
-- seeds/local_users.sql — is safe to run against a cloud project via
-- `supabase db push --include-seed`, which is how a fresh cloud project
-- gets its branches and catalogue bootstrapped (see scripts/seed-users.mjs's
-- header for the cloud staff-account path that follows it).
--
-- Catalogue, member tiers and payment methods are copied exactly from the
-- Vite app's src/lib/seed.js (SEED_CATALOG, DEFAULT_OPTIONS): every price ₱0,
-- every tier discount 0%, as live today. Set real prices in Product master.
-- tests/db/seed.test.ts checks this file against seed.js.

-- ------------------------------------------------------------ branches
insert into public.branches (code, name) values
  ('MNLA',   'Manila'),
  ('BAGUIO', 'Baguio');

-- ---------------------------------------------------------- categories
insert into public.categories (name, is_package, sort_order) values
  ('Entry Packages', true,  1),
  ('Health Drink',   false, 2),
  ('Organic Coffee', false, 3),
  ('Organic Powder', false, 4),
  ('Organic Rub',    false, 5),
  ('Oils',           false, 6),
  ('Liquid',         false, 7);

-- ------------------------------------------------------------ products
-- Packages are compositions, not stock items (reorder level 0, as the Vite
-- app's normalizeProduct sets it).
insert into public.products (sku, name, category_id, is_package, price, member_price, tier_prices, reorder_level)
select v.sku, v.name, c.id, v.is_package, 0, 0, '{}'::jsonb, v.reorder_level
from (values
  ('PKG-AFF',   'Affiliate Package',            'Entry Packages', true,   0),
  ('PKG-SUP',   'Supervisor Package',           'Entry Packages', true,   0),
  ('PKG-MGR',   'Manager Package',              'Entry Packages', true,   0),
  ('PKG-PRS',   'Presidential Package',         'Entry Packages', true,   0),
  ('HD-TIB',    'Dok Honey’s Tibicos',          'Health Drink',   false, 10),
  ('OC-MAH',    'Maharlika Herbal Coffee',      'Organic Coffee', false, 10),
  ('OC-INS',    'Insulin Herbal Coffee',        'Organic Coffee', false, 10),
  ('OC-RC400',  'Rice Coffee (400g)',           'Organic Coffee', false, 10),
  ('OC-RC450',  'Rice Coffee (450g)',           'Organic Coffee', false, 10),
  ('OC-CC',     'Corn Coffee',                  'Organic Coffee', false, 10),
  ('OC-RCC',    'Rice-Corn Coffee',             'Organic Coffee', false, 10),
  ('OC-KRM',    'KapeRico Malunggay',           'Organic Coffee', false, 10),
  ('OC-KRT',    'KapeRico Turmeric',            'Organic Coffee', false, 10),
  ('OP-TUR',    'Turmeric Powder',              'Organic Powder', false,  5),
  ('OP-MAL',    'Malunggay Powder',             'Organic Powder', false,  5),
  ('OR-EUC',    'Herbal Rub Eucalyptus',        'Organic Rub',    false, 10),
  ('OR-LAV',    'Herbal Rub Lavender',          'Organic Rub',    false, 10),
  ('OIL-HER',   'Essential Oil Heritage',       'Oils',           false, 10),
  ('OIL-VIN',   'Essential Oil Vintage',        'Oils',           false, 10),
  ('OIL-MAN',   'Essential Oil Manang Biday',   'Oils',           false, 10),
  ('OIL-LUV',   'Essential Oil Luv',            'Oils',           false, 10),
  ('OIL-GIN',   'Essential Oil Ginger',         'Oils',           false, 10),
  ('OIL-ROS',   'Essential Oil Rosemary',       'Oils',           false, 10),
  ('OIL-TUI',   'Essential Oil Tui-na',         'Oils',           false, 10),
  ('HO-PEP',    'Herbal Oil Peppermint',        'Oils',           false, 10),
  ('HO-ALI',    'Herbal Oil Alingatong',        'Oils',           false, 10),
  ('HO-ORA',    'Herbal Oil Orange',            'Oils',           false, 10),
  ('LQ-PAR',    'PAREC Vinegar',                'Liquid',         false, 10),
  ('LQ-KEF',    'Kefiranza Wine',               'Liquid',         false, 10),
  ('LQ-HON150', 'Pure Honey (150mL)',           'Liquid',         false, 10),
  ('LQ-HON250', 'Pure Honey (250mL)',           'Liquid',         false, 10),
  ('LQ-HON350', 'Pure Honey (350mL)',           'Liquid',         false, 10)
) as v(sku, name, category, is_package, reorder_level)
join public.categories c on c.name = v.category;

-- -------------------------------------------------- package_inclusions
insert into public.package_inclusions (package_product_id, component_product_id, qty)
select pkg.id, comp.id, v.qty
from (values
  ('PKG-AFF', 'HD-TIB',  2),
  ('PKG-SUP', 'HD-TIB',  6),
  ('PKG-MGR', 'HD-TIB', 14),
  ('PKG-PRS', 'HD-TIB', 30)
) as v(package_sku, component_sku, qty)
join public.products pkg on pkg.sku = v.package_sku
join public.products comp on comp.sku = v.component_sku;

-- -------------------------------------------------------- member_tiers
insert into public.member_tiers (name, discount_pct, sort_order) values
  ('Affiliate',    0, 1),
  ('Supervisor',   0, 2),
  ('Manager',      0, 3),
  ('Presidential', 0, 4);

-- ----------------------------------------------------- payment_methods
insert into public.payment_methods (name, is_cash, sort_order) values
  ('Cash',          true,  1),
  ('GCash',         false, 2),
  ('GoTyme',        false, 3),
  ('Bank Transfer', false, 4);

-- Seed staff accounts (local dev only) live in seeds/local_users.sql, NOT
-- here — this file must stay safe to run against a cloud project (see
-- config.toml's [db.seed] and that file's own header for why).
