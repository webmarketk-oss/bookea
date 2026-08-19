-- Bookea bootstrap: premier admin + centre de depart.
-- A executer apres les migrations principales.

do $$
declare
  target_email citext := 'webmarket.k@gmail.com';
  target_user_id uuid;
  target_center_id uuid;
begin
  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email::text)
  limit 1;

  if target_user_id is null then
    raise exception 'Utilisateur introuvable dans auth.users pour email: %', target_email;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (target_user_id, target_email, 'Admin Bookea', 'bookea_admin')
  on conflict (id) do update set
    email = excluded.email,
    role = 'bookea_admin',
    updated_at = now();

  insert into public.centers (
    owner_profile_id,
    name,
    slug,
    description,
    public_profile_enabled,
    theme_color,
    email,
    city,
    country,
    public_slug,
    is_public,
    public_profile,
    settings
  )
  values (
    target_user_id,
    'JFG Clinique Clermont',
    'jfg-clinique-clermont',
    'Centre pilote Bookea',
    true,
    '#6415E8',
    target_email,
    'Clermont-Ferrand',
    'France',
    'jfg-clinique-clermont',
    true,
    '{"categories":["institut-beaute","soin-du-visage","minceur"]}'::jsonb,
    '{}'::jsonb
  )
  on conflict (slug) do update set
    owner_profile_id = excluded.owner_profile_id,
    public_profile_enabled = true,
    theme_color = excluded.theme_color,
    email = excluded.email,
    public_slug = excluded.public_slug,
    is_public = true,
    public_profile = excluded.public_profile,
    updated_at = now()
  returning id into target_center_id;

  insert into public.bookea_admins (profile_id, label)
  values (target_user_id, 'Fondatrice Bookea')
  on conflict (profile_id) do update set label = excluded.label;

  insert into public.center_members (center_id, profile_id, role, is_active)
  values (target_center_id, target_user_id, 'owner', true)
  on conflict (center_id, profile_id) do update set
    role = 'owner',
    is_active = true;

  insert into public.center_settings (center_id, invoice_prefix, default_vat_rate, currency)
  values (target_center_id, 'FAC', 20, 'EUR')
  on conflict (center_id) do update set
    invoice_prefix = excluded.invoice_prefix,
    default_vat_rate = excluded.default_vat_rate,
    currency = excluded.currency,
    updated_at = now();

  insert into public.rooms (center_id, name, color, display_order)
  values
    (target_center_id, 'Cabine 1', '#6415E8', 1),
    (target_center_id, 'Cabine 2', '#247AF2', 2)
  on conflict do nothing;

  insert into public.practitioners (center_id, profile_id, first_name, last_name, color)
  values (target_center_id, target_user_id, 'Equipe', 'Bookea', '#6415E8')
  on conflict do nothing;

  insert into public.lead_sources (center_id, name, slug, is_organic, display_order)
  values
    (target_center_id, 'Instagram', 'instagram', true, 1),
    (target_center_id, 'Google', 'google', true, 2),
    (target_center_id, 'Bookea', 'bookea', true, 3)
  on conflict (center_id, slug) do nothing;

  raise notice 'Bookea bootstrap OK pour % / centre %', target_email, target_center_id;
end $$;
