-- Bookea core schema: multi-centres, auth, CRM, agenda, facturation, documents.
-- Run this file in the Supabase SQL editor for the first production-ready base.

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type public.bookea_role as enum ('bookea_admin', 'center_owner', 'center_manager', 'practitioner', 'client');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.member_role as enum ('owner', 'manager', 'practitioner', 'reception', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.appointment_status as enum ('confirmed', 'to_confirm', 'present', 'cancelled', 'no_show', 'quote', 'sold', 'in_progress', 'done');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.invoice_status as enum ('draft', 'sent', 'pending_payment', 'paid', 'cancelled', 'credit_note');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_status as enum ('draft', 'sent', 'signed', 'validated', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_channel as enum ('in_app', 'email', 'sms', 'whatsapp');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.identity_type as enum ('email', 'phone', 'name_birthdate');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique,
  full_name text,
  role public.bookea_role not null default 'client',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.centers (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  public_profile_enabled boolean not null default false,
  logo_url text,
  cover_url text,
  theme_color text not null default '#2563eb',
  phone text,
  email citext,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'France',
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.center_members (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(center_id, profile_id)
);

create table if not exists public.center_settings (
  center_id uuid primary key references public.centers(id) on delete cascade,
  invoice_prefix text not null default 'FAC',
  default_vat_rate numeric(5, 2) not null default 20,
  currency text not null default 'EUR',
  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,
  sms_balance integer not null default 0,
  reminder_48h_enabled boolean not null default true,
  reminder_24h_enabled boolean not null default true,
  birthday_message_enabled boolean not null default true,
  public_booking_requires_deposit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.center_opening_hours (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time,
  closes_at time,
  is_open boolean not null default true,
  unique(center_id, weekday)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.practitioners (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text,
  color text not null default '#2563eb',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  center_id uuid references public.centers(id) on delete cascade,
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  unique(center_id, slug)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  description text,
  duration_minutes integer not null default 60,
  price_ttc numeric(10, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 20,
  deposit_amount numeric(10, 2) not null default 0,
  color text not null default '#2563eb',
  display_order integer not null default 0,
  is_public boolean not null default true,
  requires_room boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  category_name text,
  name text not null,
  sku text,
  price_ttc numeric(10, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 20,
  stock integer not null default 0,
  color text not null default '#64748b',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  name text not null,
  slug text not null,
  is_organic boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(center_id, slug)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  source_id uuid references public.lead_sources(id) on delete set null,
  name text not null,
  starts_on date,
  ends_on date,
  budget numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  profile_user_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email citext,
  phone text,
  birthdate date,
  gender text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'France',
  source_id uuid references public.lead_sources(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  private_note text,
  shared_note text,
  status text not null default 'active',
  merged_into_client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_identities (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  identity_type public.identity_type not null,
  normalized_value text not null,
  created_at timestamptz not null default now(),
  unique(center_id, identity_type, normalized_value)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  source_id uuid references public.lead_sources(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  assigned_to_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'Nouveau',
  recall_date date,
  next_action text,
  latest_comment text,
  amount_cure_ttc numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  author_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  from_value text,
  to_value text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  practitioner_id uuid references public.practitioners(id) on delete set null,
  appointment_date date not null,
  starts_at time not null,
  ends_at time not null,
  duration_minutes integer not null,
  status public.appointment_status not null default 'confirmed',
  origin text not null default 'crm',
  source_id uuid references public.lead_sources(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  note_date date not null,
  content text not null default '',
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(center_id, note_date)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  number text not null,
  type text not null check (type in ('devis', 'acompte', 'finale', 'avoir')),
  status public.invoice_status not null default 'draft',
  total_ht numeric(10, 2) not null default 0,
  total_tva numeric(10, 2) not null default 0,
  total_ttc numeric(10, 2) not null default 0,
  discount_amount numeric(10, 2) not null default 0,
  paid_amount numeric(10, 2) not null default 0,
  balance_due numeric(10, 2) not null default 0,
  payment_method text,
  issued_on date not null default current_date,
  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(center_id, number)
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price_ttc numeric(10, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 20,
  discount_amount numeric(10, 2) not null default 0,
  line_total_ttc numeric(10, 2) not null default 0
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(10, 2) not null,
  payment_method text not null,
  paid_at timestamptz not null default now(),
  external_reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  folder_name text not null default 'General',
  name text not null,
  file_url text,
  file_type text,
  status public.document_status not null default 'draft',
  size_bytes bigint,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(center_id, client_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_client_id uuid references public.clients(id) on delete set null,
  channel public.message_channel not null default 'in_app',
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  source text not null default 'bookea',
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_events (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  points integer not null,
  reason text not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  review_id uuid references public.reviews(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_bookea_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'bookea_admin'
  );
$$;

create or replace function public.is_center_member(target_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_bookea_admin()
    or exists (
      select 1 from public.center_members
      where center_id = target_center_id
        and profile_id = auth.uid()
        and is_active = true
    );
$$;

create or replace function public.is_center_owner_or_manager(target_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_bookea_admin()
    or exists (
      select 1 from public.center_members
      where center_id = target_center_id
        and profile_id = auth.uid()
        and role in ('owner', 'manager')
        and is_active = true
    );
$$;

do $$ declare t text;
begin
  foreach t in array array[
    'profiles', 'centers', 'center_settings', 'rooms', 'practitioners',
    'campaigns', 'clients', 'leads', 'appointments', 'daily_notes',
    'invoices', 'documents', 'conversations', 'services', 'products'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

create index if not exists idx_center_members_profile on public.center_members(profile_id);
create index if not exists idx_clients_center on public.clients(center_id);
create index if not exists idx_client_identities_lookup on public.client_identities(center_id, identity_type, normalized_value);
create index if not exists idx_leads_center_status on public.leads(center_id, status);
create index if not exists idx_leads_dates on public.leads(center_id, created_at, updated_at, last_activity_at);
create index if not exists idx_appointments_center_date on public.appointments(center_id, appointment_date, starts_at);
create index if not exists idx_invoices_center_status on public.invoices(center_id, status);
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_reviews_center_public on public.reviews(center_id, is_public);

alter table public.profiles enable row level security;
alter table public.centers enable row level security;
alter table public.center_members enable row level security;
alter table public.center_settings enable row level security;
alter table public.center_opening_hours enable row level security;
alter table public.rooms enable row level security;
alter table public.practitioners enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.lead_sources enable row level security;
alter table public.campaigns enable row level security;
alter table public.clients enable row level security;
alter table public.client_identities enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.appointments enable row level security;
alter table public.daily_notes enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.documents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.loyalty_events enable row level security;

create policy "profiles_read_self_or_admin" on public.profiles for select using (id = auth.uid() or public.is_bookea_admin());
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "centers_public_read" on public.centers for select using (public_profile_enabled = true);
create policy "centers_members_read" on public.centers for select using (public.is_center_member(id));
create policy "centers_admin_insert" on public.centers for insert with check (public.is_bookea_admin());
create policy "centers_managers_update" on public.centers for update using (public.is_center_owner_or_manager(id)) with check (public.is_center_owner_or_manager(id));

create policy "members_read_own_center" on public.center_members for select using (public.is_center_member(center_id));
create policy "members_manage_by_manager" on public.center_members for all using (public.is_center_owner_or_manager(center_id)) with check (public.is_center_owner_or_manager(center_id));

create policy "settings_member_read" on public.center_settings for select using (public.is_center_member(center_id));
create policy "settings_manager_write" on public.center_settings for all using (public.is_center_owner_or_manager(center_id)) with check (public.is_center_owner_or_manager(center_id));

create policy "opening_public_read" on public.center_opening_hours for select using (exists (select 1 from public.centers c where c.id = center_id and c.public_profile_enabled = true) or public.is_center_member(center_id));
create policy "opening_manager_write" on public.center_opening_hours for all using (public.is_center_owner_or_manager(center_id)) with check (public.is_center_owner_or_manager(center_id));

create policy "categories_public_read" on public.service_categories for select using (center_id is null or exists (select 1 from public.centers c where c.id = center_id and c.public_profile_enabled = true) or public.is_center_member(center_id));
create policy "categories_manager_write" on public.service_categories
  for all
  using (center_id is not null and public.is_center_owner_or_manager(center_id))
  with check (center_id is not null and public.is_center_owner_or_manager(center_id));

create policy "services_public_read" on public.services for select using (is_public = true and exists (select 1 from public.centers c where c.id = center_id and c.public_profile_enabled = true) or public.is_center_member(center_id));
create policy "services_manager_write" on public.services for all using (public.is_center_owner_or_manager(center_id)) with check (public.is_center_owner_or_manager(center_id));

create policy "reviews_public_read" on public.reviews for select using (is_public = true or public.is_center_member(center_id));

do $$ declare t text;
begin
  foreach t in array array[
    'rooms', 'practitioners', 'products', 'lead_sources', 'campaigns',
    'client_identities', 'leads', 'lead_events', 'daily_notes',
    'invoices', 'invoice_lines', 'payments', 'documents',
    'conversations', 'messages', 'loyalty_events'
  ] loop
    execute format('create policy %I_member_select on public.%I for select using (public.is_center_member(center_id))', t, t);
    execute format('create policy %I_member_write on public.%I for all using (public.is_center_member(center_id)) with check (public.is_center_member(center_id))', t, t);
  end loop;
end $$;

create policy "clients_member_select" on public.clients for select using (public.is_center_member(center_id) or profile_user_id = auth.uid());
create policy "clients_member_write" on public.clients for all using (public.is_center_member(center_id)) with check (public.is_center_member(center_id));
create policy "appointments_member_or_client_read" on public.appointments for select using (
  public.is_center_member(center_id)
  or exists (select 1 from public.clients c where c.id = client_id and c.profile_user_id = auth.uid())
);
create policy "appointments_member_write" on public.appointments for all using (public.is_center_member(center_id)) with check (public.is_center_member(center_id));
create policy "reviews_member_write" on public.reviews for all using (public.is_center_member(center_id)) with check (public.is_center_member(center_id));

insert into public.service_categories (center_id, name, slug, display_order, is_public)
values
  (null, 'Coiffeur', 'coiffeur', 10, true),
  (null, 'Institut beaute', 'institut-beaute', 20, true),
  (null, 'Beaute des ongles', 'beaute-des-ongles', 30, true),
  (null, 'Beaute du regard', 'beaute-du-regard', 40, true),
  (null, 'Bien-etre', 'bien-etre', 50, true),
  (null, 'Spa', 'spa', 60, true),
  (null, 'Barbier', 'barbier', 70, true),
  (null, 'Minceur', 'minceur', 80, true),
  (null, 'Soin du visage', 'soin-du-visage', 90, true)
on conflict (center_id, slug) do nothing;


-- Migration 0002 multi-center platform

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
