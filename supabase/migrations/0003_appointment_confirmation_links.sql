-- Unique SMS confirmation/cancellation links for appointments.
-- Additive only: existing rows stay valid with null token fields.

alter table public.appointments
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_token_expires_at timestamptz,
  add column if not exists confirmation_token_slot text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists client_response text,
  add column if not exists status_history jsonb not null default '[]'::jsonb;

create unique index if not exists appointments_confirmation_token_hash_uidx
  on public.appointments (confirmation_token_hash)
  where confirmation_token_hash is not null;
