-- Liaison optionnelle entre les formulaires Facebook Lead Ads et les centres Bookea.
-- A executer dans Supabase SQL Editor si un centre doit recevoir les leads d'un formulaire precis.
--
-- Webhook SaveMyLeads / POST manuel vers le CRM :
-- POST https://www.bookeai.fr/api/meta/saveleads?center=clinicgap
-- Champs : full_name, phone, email, form_name, page_name, center_slug
-- Le slug doit exister dans public.centers (exemple : clinicgap).

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

create index if not exists idx_facebook_lead_forms_page
  on public.facebook_lead_forms(page_id)
  where page_id is not null;

create table if not exists public.facebook_page_connections (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  page_id text not null unique,
  page_name text not null,
  page_access_token text not null,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_facebook_page_connections_center
  on public.facebook_page_connections(center_id);

alter table public.facebook_lead_forms enable row level security;
alter table public.facebook_page_connections enable row level security;

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

drop policy if exists "Facebook page connections are readable by center members"
  on public.facebook_page_connections;

drop policy if exists "Facebook page connections are readable by admins"
  on public.facebook_page_connections;

create policy "Facebook page connections are readable by admins"
  on public.facebook_page_connections
  for select
  to authenticated
  using (public.is_bookea_admin());

drop policy if exists "Facebook page connections are manageable by admins"
  on public.facebook_page_connections;

create policy "Facebook page connections are manageable by admins"
  on public.facebook_page_connections
  for all
  to authenticated
  using (public.is_bookea_admin())
  with check (public.is_bookea_admin());

-- Option simple : rattacher toute une page Facebook a un centre.
-- Tous les formulaires de cette page iront vers ce centre.
-- Remplacez PAGE_ID_META par l'identifiant de la page Facebook.
-- Remplacez jfg-clinique-clermont par le slug du centre cible.
-- insert into public.facebook_lead_forms (center_id, page_id, form_id, form_name)
-- select id, 'PAGE_ID_META', 'PAGE:PAGE_ID_META', 'Page Facebook du centre'
-- from public.centers
-- where slug = 'jfg-clinique-clermont'
-- on conflict (form_id) do update set
--   center_id = excluded.center_id,
--   page_id = excluded.page_id,
--   form_name = excluded.form_name,
--   is_active = true,
--   updated_at = now();

-- Option precise : rattacher un formulaire Meta a un centre.
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
