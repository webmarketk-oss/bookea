-- Interrupteur par centre : 'settings' (par défaut) ou 'table' pour lire les conversations dans seya_conversations.

alter table public.seya_conversation_backfills
  add column if not exists read_source text not null default 'settings';

drop policy if exists seya_conversation_backfills_member_select on public.seya_conversation_backfills;
create policy seya_conversation_backfills_member_select on public.seya_conversation_backfills
  for select using (public.is_center_member(center_id));
