create extension if not exists pgcrypto;
create extension if not exists citext;

alter table public.centers
  add column if not exists public_slug text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country text not null default 'FR',
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists is_public boolean not null default false,
  add column if not exists public_profile jsonb not null default '{}'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.campaigns
  add column if not exists is_global boolean not null default false,
  add column if not exists target_category_slug text,
  add column if not exists routing_radius_km numeric(8,2) not null default 30,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.leads
  add column if not exists source_channel text not null default 'crm',
  add column if not exists identity_key text,
  add column if not exists assigned_by text not null default 'manual',
  add column if not exists last_activity_at timestamptz not null default now();

create table if not exists public.bookea_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.bookea_features (
  key text primary key,
  label text not null,
  area text not null,
  description text,
  default_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.center_feature_flags (
  center_id uuid not null references public.centers(id) on delete cascade,
  feature_key text not null references public.bookea_features(key) on delete cascade,
  enabled boolean not null default true,
  configured_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (center_id, feature_key)
);

create table if not exists public.member_permission_overrides (
  center_id uuid not null references public.centers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null references public.bookea_features(key) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (center_id, profile_id, feature_key)
);

create table if not exists public.center_user_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  last_center_id uuid references public.centers(id) on delete set null,
  pinned_center_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_routing_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  campaign_id uuid references public.campaigns(id) on delete set null,
  assigned_center_id uuid references public.centers(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'duplicate', 'manual_review', 'rejected')),
  first_name text,
  last_name text,
  email citext,
  phone text,
  requested_service text,
  category_slug text,
  city text,
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  identity_key text,
  raw_payload jsonb not null default '{}'::jsonb
);

alter table public.leads
  add column if not exists routing_request_id uuid references public.lead_routing_requests(id) on delete set null;

create table if not exists public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  routing_request_id uuid not null references public.lead_routing_requests(id) on delete cascade,
  center_id uuid not null references public.centers(id) on delete cascade,
  score numeric(10,4) not null default 0,
  distance_km numeric(10,3),
  reason text,
  created_at timestamptz not null default now(),
  unique (routing_request_id, center_id)
);

insert into public.bookea_features (key, label, area, description, default_enabled)
values
  ('crm_leads', 'CRM Leads', 'crm', 'Prospects, statuts, relances et commentaires.', true),
  ('crm_clients', 'CRM Clients', 'crm', 'Fiches clientes, cures, documents et notes.', true),
  ('seya_crm', 'Seya CRM', 'crm', 'Agent IA CRM, doublons, relances et recommandations.', true),
  ('marketing', 'Marketing', 'marketing', 'Regroupe messagerie, mailing et SMS.', true),
  ('messagerie_bookea', 'Messagerie Bookea', 'marketing', 'Messages in-app avec les clientes.', true),
  ('mailing', 'Mailing', 'marketing', 'Campagnes email et automatisations.', true),
  ('envoi_sms', 'Envoi SMS', 'marketing', 'Campagnes SMS, rappels et crédits.', true),
  ('agenda', 'Agenda', 'planning', 'Planning cabines, praticiennes et rendez-vous.', true),
  ('planning_equipe', 'Planning équipe', 'planning', 'Horaires, repos, vacances et absences.', true),
  ('facturation', 'Facturation', 'finance', 'Devis, factures, règlements et avoirs.', true),
  ('documents', 'Documents', 'centre', 'Dossiers, consentements et fichiers client.', true),
  ('statistiques', 'Statistiques', 'analytics', 'KPI, organique, campagnes et activité Seya.', true),
  ('parametres_interface_client', 'Paramètres interface client', 'centre', 'Profil public, prestations, produits, sources et marque.', true),
  ('bookea_admin', 'Bookea Admin', 'admin', 'Administration globale Bookea.', false)
on conflict (key) do update set
  label = excluded.label,
  area = excluded.area,
  description = excluded.description,
  default_enabled = excluded.default_enabled;

create or replace function public.is_bookea_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookea_admins admin
    where admin.profile_id = auth.uid()
  );
$$;

create or replace function public.center_member_matches(target_center_id uuid, target_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_profile_id boolean;
  has_user_id boolean;
  matched boolean := false;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'center_members'
      and column_name = 'profile_id'
  ) into has_profile_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'center_members'
      and column_name = 'user_id'
  ) into has_user_id;

  if has_profile_id then
    execute 'select exists (select 1 from public.center_members where center_id = $1 and profile_id = $2)'
      using target_center_id, target_profile_id
      into matched;
  elsif has_user_id then
    execute 'select exists (select 1 from public.center_members where center_id = $1 and user_id = $2)'
      using target_center_id, target_profile_id
      into matched;
  end if;

  return coalesce(matched, false);
end;
$$;

create or replace function public.center_member_can_manage(target_center_id uuid, target_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_profile_id boolean;
  has_user_id boolean;
  has_role boolean;
  matched boolean := false;
begin
  if public.is_bookea_admin() then
    return true;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'center_members' and column_name = 'profile_id'
  ) into has_profile_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'center_members' and column_name = 'user_id'
  ) into has_user_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'center_members' and column_name = 'role'
  ) into has_role;

  if has_profile_id and has_role then
    execute 'select exists (select 1 from public.center_members where center_id = $1 and profile_id = $2 and lower(role::text) in (''owner'', ''admin'', ''manager'', ''responsable'', ''responsible''))'
      using target_center_id, target_profile_id into matched;
  elsif has_user_id and has_role then
    execute 'select exists (select 1 from public.center_members where center_id = $1 and user_id = $2 and lower(role::text) in (''owner'', ''admin'', ''manager'', ''responsable'', ''responsible''))'
      using target_center_id, target_profile_id into matched;
  else
    matched := public.center_member_matches(target_center_id, target_profile_id);
  end if;

  return coalesce(matched, false);
end;
$$;

create or replace function public.can_access_center(target_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_bookea_admin()
    or public.center_member_matches(target_center_id, auth.uid());
$$;

create or replace function public.can_manage_center(target_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_bookea_admin()
    or public.center_member_can_manage(target_center_id, auth.uid());
$$;

create or replace function public.normalize_phone(raw_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(raw_phone, ''), '[^0-9+]', '', 'g'), '');
$$;

create or replace function public.lead_identity_key(
  raw_email text,
  raw_phone text,
  first_name text,
  last_name text
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(lower(trim(raw_email)), ''),
    public.normalize_phone(raw_phone),
    nullif(lower(trim(coalesce(first_name, '') || ':' || coalesce(last_name, ''))), ':')
  );
$$;

create or replace function public.bookea_distance_km(
  lat1 numeric,
  lon1 numeric,
  lat2 numeric,
  lon2 numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
    else (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(lat1::double precision))
          * cos(radians(lat2::double precision))
          * cos(radians(lon2::double precision) - radians(lon1::double precision))
          + sin(radians(lat1::double precision))
          * sin(radians(lat2::double precision))
        ))
      )
    )::numeric
  end;
$$;

create or replace function public.refresh_lead_routing_identity()
returns trigger
language plpgsql
as $$
begin
  new.identity_key := public.lead_identity_key(new.email::text, new.phone, new.first_name, new.last_name);
  return new;
end;
$$;

drop trigger if exists lead_routing_identity_trigger on public.lead_routing_requests;
create trigger lead_routing_identity_trigger
before insert or update of email, phone, first_name, last_name
on public.lead_routing_requests
for each row
execute function public.refresh_lead_routing_identity();

create or replace function public.assign_public_lead_to_nearest_center(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.lead_routing_requests%rowtype;
  selected_center_id uuid;
  selected_distance numeric;
  radius_km numeric := 50;
  duplicate_exists boolean := false;
begin
  select *
  into request_row
  from public.lead_routing_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'Lead routing request % not found', request_id;
  end if;

  select coalesce(c.routing_radius_km, radius_km)
  into radius_km
  from public.campaigns c
  where c.id = request_row.campaign_id;

  if request_row.latitude is not null and request_row.longitude is not null then
    select c.id,
      public.bookea_distance_km(request_row.latitude, request_row.longitude, c.latitude, c.longitude)
    into selected_center_id, selected_distance
    from public.centers c
    where c.is_public = true
      and c.latitude is not null
      and c.longitude is not null
      and (
        request_row.category_slug is null
        or not (c.public_profile ? 'categories')
        or c.public_profile->'categories' ? request_row.category_slug
      )
      and public.bookea_distance_km(request_row.latitude, request_row.longitude, c.latitude, c.longitude) <= radius_km
    order by public.bookea_distance_km(request_row.latitude, request_row.longitude, c.latitude, c.longitude), c.updated_at desc
    limit 1;
  end if;

  if selected_center_id is null and request_row.city is not null then
    select c.id, null::numeric
    into selected_center_id, selected_distance
    from public.centers c
    where c.is_public = true
      and c.city ilike request_row.city
      and (
        request_row.category_slug is null
        or not (c.public_profile ? 'categories')
        or c.public_profile->'categories' ? request_row.category_slug
      )
    order by c.updated_at desc
    limit 1;
  end if;

  if selected_center_id is null then
    select c.id, null::numeric
    into selected_center_id, selected_distance
    from public.centers c
    where c.is_public = true
      and (
        request_row.category_slug is null
        or not (c.public_profile ? 'categories')
        or c.public_profile->'categories' ? request_row.category_slug
      )
    order by c.updated_at desc
    limit 1;
  end if;

  if selected_center_id is null then
    update public.lead_routing_requests
    set status = 'manual_review'
    where id = request_id;
    return null;
  end if;

  insert into public.lead_assignments (routing_request_id, center_id, score, distance_km, reason)
  values (
    request_id,
    selected_center_id,
    case when selected_distance is null then 0 else greatest(0, radius_km - selected_distance) end,
    selected_distance,
    case when selected_distance is null then 'city_or_category_match' else 'nearest_public_center' end
  )
  on conflict (routing_request_id, center_id) do update set
    score = excluded.score,
    distance_km = excluded.distance_km,
    reason = excluded.reason;

  select exists (
    select 1
    from public.leads l
    where l.center_id = selected_center_id
      and l.identity_key is not null
      and l.identity_key = request_row.identity_key
  ) into duplicate_exists;

  update public.lead_routing_requests
  set assigned_center_id = selected_center_id,
      assigned_at = now(),
      status = case when duplicate_exists then 'duplicate' else 'assigned' end
  where id = request_id;

  return selected_center_id;
end;
$$;

create or replace function public.route_public_lead_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assign_public_lead_to_nearest_center(new.id);
  return new;
end;
$$;

drop trigger if exists lead_routing_auto_assign_trigger on public.lead_routing_requests;
create trigger lead_routing_auto_assign_trigger
after insert
on public.lead_routing_requests
for each row
execute function public.route_public_lead_after_insert();

create unique index if not exists centers_public_slug_unique_idx
  on public.centers (lower(public_slug))
  where public_slug is not null;

create index if not exists centers_public_geo_idx
  on public.centers (is_public, city, latitude, longitude);

create index if not exists leads_identity_center_idx
  on public.leads (center_id, identity_key)
  where identity_key is not null;

create index if not exists lead_routing_requests_status_idx
  on public.lead_routing_requests (status, created_at desc);

create index if not exists lead_routing_requests_identity_idx
  on public.lead_routing_requests (identity_key)
  where identity_key is not null;

create index if not exists lead_assignments_center_idx
  on public.lead_assignments (center_id, created_at desc);

alter table public.bookea_admins enable row level security;
alter table public.bookea_features enable row level security;
alter table public.center_feature_flags enable row level security;
alter table public.member_permission_overrides enable row level security;
alter table public.center_user_preferences enable row level security;
alter table public.lead_routing_requests enable row level security;
alter table public.lead_assignments enable row level security;

drop policy if exists "Bookea features are readable by authenticated users" on public.bookea_features;
create policy "Bookea features are readable by authenticated users"
on public.bookea_features
for select
to authenticated
using (true);

drop policy if exists "Bookea admins can manage admins" on public.bookea_admins;
create policy "Bookea admins can manage admins"
on public.bookea_admins
for all
to authenticated
using (public.is_bookea_admin() or profile_id = auth.uid())
with check (public.is_bookea_admin());

drop policy if exists "Center flags are readable by center members" on public.center_feature_flags;
create policy "Center flags are readable by center members"
on public.center_feature_flags
for select
to authenticated
using (public.can_access_center(center_id));

drop policy if exists "Center flags are manageable by center managers" on public.center_feature_flags;
create policy "Center flags are manageable by center managers"
on public.center_feature_flags
for all
to authenticated
using (public.can_manage_center(center_id))
with check (public.can_manage_center(center_id));

drop policy if exists "Member overrides are readable by center members" on public.member_permission_overrides;
create policy "Member overrides are readable by center members"
on public.member_permission_overrides
for select
to authenticated
using (public.can_access_center(center_id));

drop policy if exists "Member overrides are manageable by center managers" on public.member_permission_overrides;
create policy "Member overrides are manageable by center managers"
on public.member_permission_overrides
for all
to authenticated
using (public.can_manage_center(center_id))
with check (public.can_manage_center(center_id));

drop policy if exists "Users manage their center preferences" on public.center_user_preferences;
create policy "Users manage their center preferences"
on public.center_user_preferences
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "Public can create lead routing requests" on public.lead_routing_requests;
create policy "Public can create lead routing requests"
on public.lead_routing_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "Assigned centers can read routing requests" on public.lead_routing_requests;
create policy "Assigned centers can read routing requests"
on public.lead_routing_requests
for select
to authenticated
using (
  public.is_bookea_admin()
  or (assigned_center_id is not null and public.can_access_center(assigned_center_id))
);

drop policy if exists "Assigned centers can update routing requests" on public.lead_routing_requests;
create policy "Assigned centers can update routing requests"
on public.lead_routing_requests
for update
to authenticated
using (
  public.is_bookea_admin()
  or (assigned_center_id is not null and public.can_manage_center(assigned_center_id))
)
with check (
  public.is_bookea_admin()
  or (assigned_center_id is not null and public.can_manage_center(assigned_center_id))
);

drop policy if exists "Lead assignments are readable by center members" on public.lead_assignments;
create policy "Lead assignments are readable by center members"
on public.lead_assignments
for select
to authenticated
using (public.is_bookea_admin() or public.can_access_center(center_id));

drop policy if exists "Lead assignments are manageable by admins" on public.lead_assignments;
create policy "Lead assignments are manageable by admins"
on public.lead_assignments
for all
to authenticated
using (public.is_bookea_admin())
with check (public.is_bookea_admin());
