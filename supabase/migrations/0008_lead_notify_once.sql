-- Un seul e-mail « Nouveau prospect » par prospect, même si deux envois partent en même temps.

create unique index if not exists lead_events_lead_notify_once
  on public.lead_events (lead_id)
  where event_type = 'lead_notify';
