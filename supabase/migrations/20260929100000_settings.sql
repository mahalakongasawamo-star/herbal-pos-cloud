-- Adds the one thing SPEC.md §3's data model is missing: somewhere to keep
-- store/receipt branding (company name, receipt title/footer, logo, print
-- layout). The legacy Vite app kept this in its local `settings` object;
-- nothing in the current schema holds it. A DEFINITION-OF-DONE blocker for
-- Options and receipt printing, so it's added now rather than worked
-- around. Shown to the user before being applied, per CLAUDE.md.
--
-- Design: one global row, not per-branch — this is one company running two
-- branches, and the legacy app only ever had one settings object. Enforced
-- as a true singleton (id is always 1) so there's no "which row" ambiguity
-- for the client to get wrong, and no way to accidentally create a second.
create table public.settings (
  id               boolean primary key default true,
  company_name     text not null default '',
  company_details  text not null default '',
  receipt_title    text not null default 'Sales receipt',
  receipt_footer   text not null default 'Thank you for your purchase!',
  -- A data: URL (small, client-resized image — legacy's imageToDataUrl caps
  -- it at 360px, so this stays well under Postgres's per-value limits).
  logo             text not null default '',
  print_layout     text not null default 'stacked' check (print_layout in ('stacked', 'side')),
  -- SetupGuide's 4th checklist item: "has anyone opened Options yet."
  options_reviewed boolean not null default false,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id),
  constraint settings_is_singleton check (id)
);

insert into public.settings (id) values (true);

create or replace function private.touch_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function private.touch_settings();

alter table public.settings enable row level security;

-- Every active staff member reads it (POS/receipts need the branding);
-- only the owner writes it — same split as the rest of the catalog.
grant select on public.settings to authenticated;
grant update on public.settings to authenticated;

create policy settings_select on public.settings
  for select to authenticated using ((select private.is_staff()));
create policy settings_owner_update on public.settings
  for update to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()) and id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.settings;
  end if;
end;
$$;
