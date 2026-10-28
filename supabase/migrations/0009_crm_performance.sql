-- CRM : chargement des prospects sans « statement timeout ».
-- 1) Index sur les colonnes lues par le CRM (historique par prospect, tri par activité, RDV par prospect).
-- 2) Contrôle d'accès évalué une fois par requête (liste des centres du compte), pas une fois par ligne.

create index if not exists idx_lead_events_lead_created
  on public.lead_events (lead_id, created_at desc);

create index if not exists idx_lead_events_center_type_created
  on public.lead_events (center_id, event_type, created_at desc);

create index if not exists idx_leads_center_activity
  on public.leads (center_id, last_activity_at desc, id);

create index if not exists idx_appointments_lead
  on public.appointments (lead_id)
  where lead_id is not null;

create index if not exists idx_appointments_center_date_id
  on public.appointments (center_id, appointment_date desc, id);

create index if not exists idx_center_members_profile_active
  on public.center_members (profile_id, center_id)
  where is_active = true;

create or replace function public.member_center_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select center_id
  from public.center_members
  where profile_id = auth.uid()
    and is_active = true
$$;

grant execute on function public.member_center_ids() to authenticated;

-- Tables lues en masse par le CRM : même règle qu'avant (admin Bookea ou membre actif du centre).
drop policy if exists leads_member_select on public.leads;
drop policy if exists leads_member_write on public.leads;
create policy leads_member_select on public.leads for select
  using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));
create policy leads_member_write on public.leads for all
  using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()))
  with check ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));

drop policy if exists lead_events_member_select on public.lead_events;
drop policy if exists lead_events_member_write on public.lead_events;
create policy lead_events_member_select on public.lead_events for select
  using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));
create policy lead_events_member_write on public.lead_events for all
  using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()))
  with check ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));

drop policy if exists clients_member_select on public.clients;
drop policy if exists clients_member_write on public.clients;
create policy clients_member_select on public.clients for select
  using (
    (select public.is_bookea_admin())
    or center_id in (select public.member_center_ids())
    or profile_user_id = (select auth.uid())
  );
create policy clients_member_write on public.clients for all
  using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()))
  with check ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));

drop policy if exists appointments_member_or_client_read on public.appointments;
drop policy if exists appointments_member_write on public.appointments;
create policy appointments_member_or_client_read on public.appointments for select
  using (
    (select public.is_bookea_admin())
    or center_id in (select public.member_center_ids())
    or exists (
      select 1 from public.clients c
      where c.id = client_id and c.profile_user_id = (select auth.uid())
    )
  );
create policy appointments_member_write on public.appointments for all
  using ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()))
  with check ((select public.is_bookea_admin()) or center_id in (select public.member_center_ids()));

analyze public.leads;
analyze public.lead_events;
analyze public.appointments;
analyze public.clients;
