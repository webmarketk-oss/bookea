create table if not exists public.admin_agency_billing (
  company text primary key check (company in ('webk', 'bookea')),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.admin_agency_billing enable row level security;

drop policy if exists "Bookea admins manage agency billing" on public.admin_agency_billing;
create policy "Bookea admins manage agency billing"
on public.admin_agency_billing
for all
using (public.is_bookea_admin())
with check (public.is_bookea_admin());
