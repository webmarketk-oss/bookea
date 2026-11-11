-- Pilotage WEBK : seuils et historique propres à ce module.
-- La lecture des leads reste en lecture seule, groupée sur created_at.

create table if not exists public.webk_pilotage_thresholds (
  center_id uuid primary key references public.centers(id) on delete cascade,
  min_leads_48h integer not null default 1 check (min_leads_48h >= 0 and min_leads_48h <= 999),
  min_rdv_48h integer not null default 1 check (min_rdv_48h >= 0 and min_rdv_48h <= 999),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.webk_pilotage_actions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  acted_on date not null,
  campaign text,
  change_text text not null,
  review_on date,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists webk_pilotage_actions_center_idx
  on public.webk_pilotage_actions (center_id, acted_on desc, created_at desc);

create or replace function public.is_webk_pilotage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookea_admins admin
    join public.profiles profile on profile.id = admin.profile_id
    where admin.profile_id = auth.uid()
      and (
        lower(profile.email::text) = 'cynthia@webkagency.net'
        or lower(profile.email::text) = 'webmarket.k@gmail.com'
        or lower(profile.email::text) ~ '(^|[^a-z])samantha([^a-z]|$)'
        or lower(coalesce(profile.full_name, '')) ~ '(^|[^a-z])samantha([^a-z]|$)'
        or lower(coalesce(profile.full_name, '')) ~ '(^|[^a-z])cynthia([^a-z]|$)'
        or lower(coalesce(admin.label, '')) ~ '(^|[^a-z])samantha([^a-z]|$)'
        or lower(coalesce(admin.label, '')) ~ '(^|[^a-z])cynthia([^a-z]|$)'
      )
  );
$$;

alter table public.webk_pilotage_thresholds enable row level security;
alter table public.webk_pilotage_actions enable row level security;

drop policy if exists "webk_pilotage_thresholds_own" on public.webk_pilotage_thresholds;
create policy "webk_pilotage_thresholds_own"
on public.webk_pilotage_thresholds
for all
to authenticated
using (public.is_webk_pilotage())
with check (public.is_webk_pilotage());

drop policy if exists "webk_pilotage_actions_own" on public.webk_pilotage_actions;
create policy "webk_pilotage_actions_own"
on public.webk_pilotage_actions
for all
to authenticated
using (public.is_webk_pilotage())
with check (public.is_webk_pilotage());

-- Du 1er du mois à aujourd’hui, heure de Paris, et la même longueur le mois d’avant.
create or replace function public.webk_pilotage_period(now_at timestamptz default now())
returns table (
  instant timestamptz,
  month_start timestamptz,
  tomorrow timestamptz,
  prev_start timestamptz,
  prev_end timestamptz
)
language sql
stable
set search_path = public
as $$
  with paris as (
    select now_at as instant, now_at at time zone 'Europe/Paris' as local_ts
  )
  select
    instant,
    date_trunc('month', local_ts) at time zone 'Europe/Paris',
    ((local_ts::date + 1)::timestamp at time zone 'Europe/Paris'),
    (date_trunc('month', local_ts) - interval '1 month') at time zone 'Europe/Paris',
    ((
      (date_trunc('month', local_ts) - interval '1 month')::date
      + least(
          extract(day from local_ts)::int,
          extract(day from (date_trunc('month', local_ts)::date - 1))::int
        )
    )::timestamp at time zone 'Europe/Paris')
  from paris;
$$;

drop function if exists public.webk_pilotage_counts(timestamptz);

create function public.webk_pilotage_counts(now_at timestamptz default now())
returns table (
  center_id uuid,
  leads_48h bigint,
  leads_7d bigint,
  leads_prev_7d bigint,
  leads_month bigint,
  leads_prev_month bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    leads.center_id,
    count(*) filter (where leads.created_at >= period.instant - interval '48 hours'),
    count(*) filter (where leads.created_at >= period.instant - interval '7 days'),
    count(*) filter (
      where leads.created_at >= period.instant - interval '14 days'
        and leads.created_at < period.instant - interval '7 days'
    ),
    count(*) filter (
      where leads.created_at >= period.month_start
        and leads.created_at < period.tomorrow
        and leads.created_at <= period.instant
    ),
    count(*) filter (
      where leads.created_at >= period.prev_start
        and leads.created_at < period.prev_end
    )
  from public.leads
  cross join public.webk_pilotage_period(now_at) as period
  where leads.created_at >= period.prev_start
    and leads.created_at <= period.instant
  group by leads.center_id;
$$;

revoke all on function public.webk_pilotage_period(timestamptz) from public, anon, authenticated;
revoke all on function public.webk_pilotage_counts(timestamptz) from public, anon, authenticated;
revoke all on function public.is_webk_pilotage() from public, anon, authenticated;

-- Objectif RDV, indépendant du seuil de leads. Inoffensif si la table existe déjà.
alter table public.webk_pilotage_thresholds
  add column if not exists min_rdv_48h integer not null default 1;

alter table public.webk_pilotage_thresholds
  drop constraint if exists webk_pilotage_thresholds_min_rdv_48h_check;

alter table public.webk_pilotage_thresholds
  add constraint webk_pilotage_thresholds_min_rdv_48h_check
  check (min_rdv_48h >= 0 and min_rdv_48h <= 999);

-- Un RDV confirmé compte à la date où il a été pris, pas à la date de la séance.
-- Un acompte reçu peut dater ce RDV s’il arrive avant. Il n’en ajoute pas un second.
drop function if exists public.webk_pilotage_rdv_counts(timestamptz);

create function public.webk_pilotage_rdv_counts(now_at timestamptz default now())
returns table (
  center_id uuid,
  rdv_48h bigint,
  rdv_7d bigint,
  rdv_prev_7d bigint,
  rdv_month bigint,
  rdv_prev_month bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with classified as (
    select
      events.lead_id,
      events.center_id,
      events.created_at,
      case
        when translate(
          lower(coalesce(events.to_value, '')),
          'àáâäãåéèêëíìîïóòôöõúùûüýÿçñ',
          'aaaaaaeeeeiiiiooooouuuuyycn'
        ) in (
          'rdv pris',
          'rdv fixe',
          'rdv programme',
          'rdv confirme',
          'a relancer, rdv pris'
        ) then 'booked'
        when translate(
          lower(coalesce(events.to_value, '')),
          'àáâäãåéèêëíìîïóòôöõúùûüýÿçñ',
          'aaaaaaeeeeiiiiooooouuuuyycn'
        ) in ('acompte recu', 'acompte valide') then 'deposit'
        else null
      end as kind
    from public.lead_events events
    where events.event_type = 'status'
  ),
  status_signals as (
    select
      lead_id,
      (array_agg(center_id order by created_at))[1] as center_id,
      min(created_at) filter (where kind = 'booked') as booked_at,
      min(created_at) filter (where kind = 'deposit') as deposit_at
    from classified
    where kind is not null
    group by lead_id
  ),
  ranked as (
    select
      appointments.center_id,
      appointments.lead_id,
      appointments.created_at,
      row_number() over (
        partition by appointments.lead_id
        order by appointments.created_at, appointments.id
      ) as n
    from public.appointments
    where appointments.lead_id is not null
      and appointments.status::text in (
        'confirmed', 'present', 'cancelled', 'no_show', 'sold', 'in_progress', 'done'
      )
  ),
  first_appt as (
    select lead_id, center_id, created_at
    from ranked
    where n = 1
  ),
  credits as (
    select
      coalesce(first_appt.center_id, status_signals.center_id) as center_id,
      (
        select min(stamp)
        from unnest(array[
          status_signals.booked_at,
          status_signals.deposit_at,
          first_appt.created_at
        ]) as stamp
      ) as taken_at
    from status_signals
    full join first_appt on first_appt.lead_id = status_signals.lead_id
    union all
    select ranked.center_id, ranked.created_at
    from ranked
    where ranked.n > 1
    union all
    select appointments.center_id, appointments.created_at
    from public.appointments
    where appointments.lead_id is null
      and appointments.status::text in (
        'confirmed', 'present', 'cancelled', 'no_show', 'sold', 'in_progress', 'done'
      )
  )
  select
    credits.center_id,
    count(*) filter (
      where credits.taken_at >= period.instant - interval '48 hours'
        and credits.taken_at <= period.instant
    ),
    count(*) filter (
      where credits.taken_at >= period.instant - interval '7 days'
        and credits.taken_at <= period.instant
    ),
    count(*) filter (
      where credits.taken_at >= period.instant - interval '14 days'
        and credits.taken_at < period.instant - interval '7 days'
    ),
    count(*) filter (
      where credits.taken_at >= period.month_start
        and credits.taken_at < period.tomorrow
        and credits.taken_at <= period.instant
    ),
    count(*) filter (
      where credits.taken_at >= period.prev_start
        and credits.taken_at < period.prev_end
    )
  from credits
  cross join public.webk_pilotage_period(now_at) as period
  where credits.center_id is not null
    and credits.taken_at >= period.prev_start
    and credits.taken_at <= period.instant
  group by credits.center_id;
$$;

revoke all on function public.webk_pilotage_rdv_counts(timestamptz) from public, anon, authenticated;

create index if not exists webk_pilotage_status_events_idx
  on public.lead_events (lead_id, created_at)
  where event_type = 'status';

create index if not exists webk_pilotage_appointments_taken_idx
  on public.appointments (lead_id, created_at);
