-- Fiche Seya (soins, briefs) : lire et écrire sans télécharger les conversations.

create or replace function public.center_seya_fiche(p_center_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(settings->'seya', '{}'::jsonb) - 'conversations'
  from public.centers
  where id = p_center_id;
$$;

create or replace function public.save_center_seya_settings(p_center_id uuid, p_seya jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seya jsonb;
begin
  next_seya := coalesce(p_seya, '{}'::jsonb) - 'conversations';
  update public.centers
  set
    settings = jsonb_set(
      coalesce(settings, '{}'::jsonb) #- '{seya,conversations}',
      '{seya}',
      (coalesce(settings->'seya', '{}'::jsonb) - 'conversations') || next_seya,
      true
    ),
    updated_at = now()
  where id = p_center_id
  returning (settings->'seya') - 'conversations' into next_seya;
  if next_seya is null then
    raise exception 'center_not_found';
  end if;
  return next_seya;
end;
$$;

revoke all on function public.center_seya_fiche(uuid) from public;
revoke all on function public.save_center_seya_settings(uuid, jsonb) from public;
grant execute on function public.center_seya_fiche(uuid) to service_role;
grant execute on function public.save_center_seya_settings(uuid, jsonb) to service_role;
