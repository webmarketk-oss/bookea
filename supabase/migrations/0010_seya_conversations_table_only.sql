-- Conversations Seya : tous les centres lisent et écrivent la table seya_conversations.
-- À lancer APRÈS 0009 et APRÈS le déploiement du code qui sait écrire dans la table.
-- Le bloc centers.settings.seya.conversations est sauvegardé puis retiré : plus de grosse
-- réécriture des réglages du centre à chaque message ou changement de statut.

create or replace function public.try_timestamptz(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

-- 1) Sauvegarde de l'ancien bloc, centre par centre.
create table if not exists public.seya_conversations_blob_backup (
  center_id uuid primary key references public.centers(id) on delete cascade,
  conversations jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.seya_conversations_blob_backup enable row level security;

insert into public.seya_conversations_blob_backup (center_id, conversations)
select c.id, c.settings->'seya'->'conversations'
from public.centers c
where jsonb_typeof(c.settings->'seya'->'conversations') = 'array'
  and jsonb_array_length(c.settings->'seya'->'conversations') > 0
on conflict (center_id) do update
  set conversations = excluded.conversations, saved_at = now();

-- 2) Copie dans la table (même clé que l'application : numéro, sinon prospect, sinon id).
--    Si la conversation existe déjà, la version la plus récente est gardée.
with source as (
  select c.id as center_id, conv
  from public.centers c
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(c.settings->'seya'->'conversations') = 'array'
      then c.settings->'seya'->'conversations' else '[]'::jsonb end
  ) as conv
  where jsonb_typeof(conv) = 'object'
    and coalesce(conv->>'centerId', '') in ('', c.id::text)
),
keyed as (
  select
    center_id,
    conv,
    right(regexp_replace(coalesce(conv->>'phone', ''), '\D', '', 'g'), 9) as last9,
    nullif(trim(coalesce(conv->>'leadId', '')), '') as lead_id,
    nullif(trim(coalesce(conv->>'id', '')), '') as conv_id,
    public.try_timestamptz(coalesce(
      case when jsonb_typeof(conv->'messages') = 'array' and jsonb_array_length(conv->'messages') > 0
        then conv->'messages'->(jsonb_array_length(conv->'messages') - 1)->>'at' end,
      conv->>'updatedAt'
    )) as last_activity_at
  from source
),
rows as (
  select distinct on (center_id, conversation_key) *
  from (
    select
      keyed.*,
      case
        when length(last9) >= 9 then 'phone:' || last9
        when lead_id is not null then 'lead:' || lead_id
        when conv_id is not null then 'id:' || conv_id
      end as conversation_key
    from keyed
  ) candidates
  where conversation_key is not null
  order by center_id, conversation_key, last_activity_at desc nulls last
)
insert into public.seya_conversations (
  center_id, conversation_key, lead_id, phone_last9, first_name, last_name,
  status, message_count, last_activity_at, data, updated_at
)
select
  center_id,
  conversation_key,
  lead_id,
  case when length(last9) >= 9 then last9 end,
  nullif(trim(coalesce(conv->>'firstName', '')), ''),
  nullif(trim(coalesce(conv->>'lastName', '')), ''),
  nullif(trim(coalesce(conv->>'status', '')), ''),
  case when jsonb_typeof(conv->'messages') = 'array' then jsonb_array_length(conv->'messages') else 0 end,
  last_activity_at,
  (conv - '_seya') || jsonb_build_object('centerId', center_id::text),
  now()
from rows
on conflict (center_id, conversation_key) do update
  set lead_id = excluded.lead_id,
      phone_last9 = excluded.phone_last9,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      status = excluded.status,
      message_count = excluded.message_count,
      last_activity_at = excluded.last_activity_at,
      data = excluded.data,
      updated_at = now()
  where public.seya_conversations.last_activity_at is null
     or (
       excluded.last_activity_at is not null
       and excluded.last_activity_at > public.seya_conversations.last_activity_at
     );

-- 3) Tous les centres lisent la table.
insert into public.seya_conversation_backfills (center_id, conversation_count, done_at, read_source)
select c.id, coalesce(counts.total, 0), now(), 'table'
from public.centers c
left join (
  select center_id, count(*)::integer as total
  from public.seya_conversations
  group by center_id
) counts on counts.center_id = c.id
on conflict (center_id) do update set read_source = 'table';

-- Les centres créés plus tard aussi.
create or replace function public.seya_conversations_table_for_new_center()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.seya_conversation_backfills (center_id, conversation_count, done_at, read_source)
  values (new.id, 0, now(), 'table')
  on conflict (center_id) do nothing;
  return new;
end;
$$;

drop trigger if exists seya_conversations_table_for_new_center on public.centers;
create trigger seya_conversations_table_for_new_center
after insert on public.centers
for each row execute function public.seya_conversations_table_for_new_center();

-- 4) Retrait de l'ancien bloc des réglages (sauvegardé à l'étape 1).
update public.centers
set settings = settings #- '{seya,conversations}'
where settings->'seya' ? 'conversations';

-- 5) Droits d'accès évalués une fois par requête (comme 0009).
drop policy if exists seya_conversations_member_select on public.seya_conversations;
create policy seya_conversations_member_select on public.seya_conversations
  for select using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));

drop policy if exists seya_conversations_member_write on public.seya_conversations;
create policy seya_conversations_member_write on public.seya_conversations
  for all using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()))
  with check ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));

drop policy if exists seya_conversation_backfills_member_select on public.seya_conversation_backfills;
create policy seya_conversation_backfills_member_select on public.seya_conversation_backfills
  for select using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));

analyze public.seya_conversations;
