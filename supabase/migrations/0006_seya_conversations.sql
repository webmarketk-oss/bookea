-- Conversations Seya : une ligne par conversation, rattachée à son centre.
-- Phase 1 : copie des conversations des réglages (centers.settings.seya.conversations), sans changer les lectures.

create table if not exists public.seya_conversations (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  conversation_key text not null,
  lead_id text,
  phone_last9 text,
  first_name text,
  last_name text,
  status text,
  message_count integer not null default 0,
  last_activity_at timestamptz,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (center_id, conversation_key)
);

create index if not exists seya_conversations_center_activity_idx
  on public.seya_conversations (center_id, last_activity_at desc);
create index if not exists seya_conversations_center_phone_idx
  on public.seya_conversations (center_id, phone_last9);
create index if not exists seya_conversations_lead_idx
  on public.seya_conversations (lead_id);

alter table public.seya_conversations enable row level security;

drop policy if exists seya_conversations_member_select on public.seya_conversations;
create policy seya_conversations_member_select on public.seya_conversations
  for select using (public.is_center_member(center_id));

drop policy if exists seya_conversations_member_write on public.seya_conversations;
create policy seya_conversations_member_write on public.seya_conversations
  for all using (public.is_center_member(center_id))
  with check (public.is_center_member(center_id));

-- Centres dont toutes les conversations existantes ont déjà été copiées une première fois.
create table if not exists public.seya_conversation_backfills (
  center_id uuid primary key references public.centers(id) on delete cascade,
  conversation_count integer not null default 0,
  done_at timestamptz not null default now()
);

alter table public.seya_conversation_backfills enable row level security;
