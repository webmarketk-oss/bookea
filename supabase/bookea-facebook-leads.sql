-- Liaison optionnelle entre les formulaires Facebook Lead Ads et les centres Bookea.
-- A executer dans Supabase SQL Editor si un centre doit recevoir les leads d'un formulaire precis.

create table if not exists public.facebook_lead_forms (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  page_id text,
  form_id text not null,
  form_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(form_id)
);

create index if not exists idx_facebook_lead_forms_center
  on public.facebook_lead_forms(center_id);

alter table public.facebook_lead_forms enable row level security;

drop policy if exists "Facebook lead forms are readable by center members"
  on public.facebook_lead_forms;

create policy "Facebook lead forms are readable by center members"
  on public.facebook_lead_forms
  for select
  to authenticated
  using (public.is_bookea_admin() or public.can_access_center(center_id));

drop policy if exists "Facebook lead forms are manageable by admins"
  on public.facebook_lead_forms;

create policy "Facebook lead forms are manageable by admins"
  on public.facebook_lead_forms
  for all
  to authenticated
  using (public.is_bookea_admin())
  with check (public.is_bookea_admin());

-- Exemple a adapter quand vous avez l'identifiant du formulaire Meta :
-- insert into public.facebook_lead_forms (center_id, page_id, form_id, form_name)
-- select id, 'PAGE_ID_META', 'FORM_ID_META', 'Nom du formulaire'
-- from public.centers
-- where slug = 'jfg-clinique-clermont'
-- on conflict (form_id) do update set
--   center_id = excluded.center_id,
--   page_id = excluded.page_id,
--   form_name = excluded.form_name,
--   is_active = true,
--   updated_at = now();
