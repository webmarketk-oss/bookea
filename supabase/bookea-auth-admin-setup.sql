-- Bookea auth/admin setup.
-- À exécuter dans Supabase SQL Editor après le schéma principal.
-- Remplacez/ajoutez les emails admin en bas du fichier si besoin.

create or replace function public.handle_new_bookea_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email citext := new.email;
  user_name text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    user_email,
    coalesce(user_name, split_part(user_email::text, '@', 1)),
    case
      when lower(user_email::text) in ('webmarket.k@gmail.com', 'cynthia@webkagency.net') then 'bookea_admin'::public.bookea_role
      else 'client'::public.bookea_role
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = case
      when lower(excluded.email::text) in ('webmarket.k@gmail.com', 'cynthia@webkagency.net') then 'bookea_admin'::public.bookea_role
      else public.profiles.role
    end,
    updated_at = now();

  if lower(user_email::text) in ('webmarket.k@gmail.com', 'cynthia@webkagency.net') then
    insert into public.bookea_admins (profile_id, label)
    values (new.id, coalesce(user_name, 'Bookea Admin'))
    on conflict (profile_id) do update set
      label = coalesce(excluded.label, public.bookea_admins.label);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bookea_profile on auth.users;
create trigger on_auth_user_created_bookea_profile
after insert on auth.users
for each row execute function public.handle_new_bookea_user();

create or replace function public.bootstrap_bookea_admin(
  target_email text,
  target_full_name text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user auth.users%rowtype;
begin
  select *
  into target_user
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if target_user.id is null then
    return 'Utilisateur introuvable dans Auth. Créez le compte puis relancez cette ligne : ' || target_email;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    target_user.id,
    target_user.email,
    coalesce(nullif(trim(target_full_name), ''), split_part(target_user.email, '@', 1)),
    'bookea_admin'::public.bookea_role
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    role = 'bookea_admin'::public.bookea_role,
    updated_at = now();

  insert into public.bookea_admins (profile_id, label)
  values (
    target_user.id,
    coalesce(nullif(trim(target_full_name), ''), split_part(target_user.email, '@', 1))
  )
  on conflict (profile_id) do update set
    label = excluded.label;

  return 'Admin Bookea activé : ' || target_email;
end;
$$;

drop policy if exists "centers_bookea_admin_select" on public.centers;
create policy "centers_bookea_admin_select"
on public.centers
for select
to authenticated
using (public.is_bookea_admin());

drop policy if exists "centers_bookea_admin_update" on public.centers;
create policy "centers_bookea_admin_update"
on public.centers
for update
to authenticated
using (public.is_bookea_admin())
with check (public.is_bookea_admin());

drop policy if exists "center_members_bookea_admin_manage" on public.center_members;
create policy "center_members_bookea_admin_manage"
on public.center_members
for all
to authenticated
using (public.is_bookea_admin())
with check (public.is_bookea_admin());

select public.bootstrap_bookea_admin('webmarket.k@gmail.com', 'Admin Bookea');
select public.bootstrap_bookea_admin('cynthia@webkagency.net', 'Cynthia');

-- Ajoutez d'autres admins avec :
-- select public.bootstrap_bookea_admin('email@example.com', 'Nom admin');
