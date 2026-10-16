create table if not exists public.seya_inbound_receipts (
  message_id text primary key,
  center_id uuid not null,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seya_inbound_receipts enable row level security;
