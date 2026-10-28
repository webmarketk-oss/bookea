-- Agendas partenaires (ex. Thierry Gascon pour JFG Clinic Clermont-Ferrand et Terville).
-- 1) Accès partenaire en lecture seule à nos rendez-vous : clés API stockées hachées.
-- 2) Rendez-vous supprimés tracés, pour que le partenaire voie aussi les suppressions.
-- 3) Connexions vers l'API du partenaire : correspondance des agendas et des identifiants.
-- Ces tables ne sont lisibles que côté serveur (clé service) : RLS activé, aucune policy.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) Clés API partenaire
-- ---------------------------------------------------------------------------
create table if not exists public.partner_api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null,
  key_prefix text not null unique,
  key_hash text not null unique,
  center_ids uuid[] not null,
  room_ids uuid[],
  scopes text[] not null default array['appointments:read'],
  note text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (cardinality(center_ids) > 0)
);
alter table public.partner_api_keys enable row level security;

create index if not exists idx_appointments_center_updated
  on public.appointments (center_id, updated_at, id);

-- Génère une clé pour un partenaire et des centres (par slug). La clé n'est affichée qu'une fois.
create or replace function public.create_partner_api_key(
  p_partner_name text,
  p_center_slugs text[],
  p_note text default null
)
returns table (key_id uuid, api_key text, centers text[])
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_center_ids uuid[];
  v_names text[];
  v_prefix text;
  v_secret text;
  v_key text;
begin
  select array_agg(c.id order by c.name), array_agg(c.name order by c.name)
    into v_center_ids, v_names
  from public.centers c
  where c.slug = any(p_center_slugs);

  if v_center_ids is null or cardinality(v_center_ids) <> cardinality(p_center_slugs) then
    raise exception 'Centre introuvable parmi : %', p_center_slugs;
  end if;

  v_prefix := encode(gen_random_bytes(6), 'hex');
  v_secret := encode(gen_random_bytes(24), 'hex');
  v_key := 'bkp_' || v_prefix || '_' || v_secret;

  insert into public.partner_api_keys (partner_name, key_prefix, key_hash, center_ids, note)
  values (p_partner_name, v_prefix, encode(digest(v_key, 'sha256'), 'hex'), v_center_ids, p_note)
  returning id into key_id;

  api_key := v_key;
  centers := v_names;
  return next;
end;
$$;

create or replace function public.revoke_partner_api_key(p_key_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.partner_api_keys set revoked_at = now()
  where id = p_key_id and revoked_at is null;
$$;

revoke all on function public.create_partner_api_key(text, text[], text) from public, anon, authenticated;
revoke all on function public.revoke_partner_api_key(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Rendez-vous supprimés
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_deletions (
  appointment_id uuid primary key,
  center_id uuid not null references public.centers(id) on delete cascade,
  room_id uuid,
  appointment_date date,
  starts_at time,
  ends_at time,
  deleted_at timestamptz not null default now()
);
alter table public.appointment_deletions enable row level security;

create index if not exists idx_appointment_deletions_center_deleted
  on public.appointment_deletions (center_id, deleted_at);

create or replace function public.track_appointment_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.appointment_deletions (
    appointment_id, center_id, room_id, appointment_date, starts_at, ends_at, deleted_at
  )
  values (old.id, old.center_id, old.room_id, old.appointment_date, old.starts_at, old.ends_at, now())
  on conflict (appointment_id) do update set deleted_at = now();
  return old;
end;
$$;

drop trigger if exists track_appointment_deletion on public.appointments;
create trigger track_appointment_deletion
after delete on public.appointments
for each row execute function public.track_appointment_deletion();

-- ---------------------------------------------------------------------------
-- 3) Connexions vers l'API d'un partenaire (lecture de leurs rendez-vous)
-- ---------------------------------------------------------------------------
-- Le secret n'est jamais en base : secret_env donne le NOM de la variable d'environnement Vercel.
create table if not exists public.external_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  provider text not null,
  label text,
  base_url text,
  secret_env text not null,
  mode text not null default 'read' check (mode in ('read', 'import')),
  enabled boolean not null default false,
  last_synced_at timestamptz,
  last_cursor text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, provider)
);
alter table public.external_calendar_connections enable row level security;

-- Agenda du partenaire → cabine (ou centre entier si room_id est vide).
create table if not exists public.external_calendar_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.external_calendar_connections(id) on delete cascade,
  external_calendar_id text not null,
  room_id uuid references public.rooms(id) on delete set null,
  practitioner_id uuid references public.practitioners(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (connection_id, external_calendar_id)
);
alter table public.external_calendar_mappings enable row level security;

-- Un rendez-vous du partenaire = une ligne, même s'il est relu plusieurs fois (pas de doublon).
-- Mode « read » : on garde seulement l'horaire et le statut. Mode « import » : appointment_id
-- pointe vers le créneau bloqué dans notre agenda.
create table if not exists public.external_appointments (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.external_calendar_connections(id) on delete cascade,
  external_id text not null,
  external_calendar_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text,
  status text not null default 'confirmed',
  external_updated_at timestamptz,
  appointment_id uuid references public.appointments(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_id)
);
alter table public.external_appointments enable row level security;

create index if not exists idx_external_appointments_connection_start
  on public.external_appointments (connection_id, starts_at);
