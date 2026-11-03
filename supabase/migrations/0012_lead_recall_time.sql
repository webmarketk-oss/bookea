alter table public.leads
  add column if not exists recall_time time;
