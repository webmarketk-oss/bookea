-- Programme de fidélité : journal idempotent, acomptes en ligne, demandes de récompense.
-- Les mouvements déjà écrits ne sont pas recalculés.

alter table public.loyalty_events
  add column if not exists idempotency_key text,
  add column if not exists kind text,
  add column if not exists scale jsonb not null default '{}'::jsonb;

create unique index if not exists loyalty_events_idempotency
  on public.loyalty_events (center_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists loyalty_events_client
  on public.loyalty_events (center_id, client_id, created_at desc);

create table if not exists public.loyalty_deposits (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  booking_id text,
  stripe_session_id text,
  payment_intent_id text,
  amount_cents integer not null default 0,
  refunded_cents integer not null default 0,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loyalty_deposits_session
  on public.loyalty_deposits (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists loyalty_deposits_appointment
  on public.loyalty_deposits (appointment_id);

create table if not exists public.loyalty_reward_requests (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  reward_id text not null,
  points integer not null,
  discount_eur numeric(10, 2) not null,
  min_service_eur numeric(10, 2) not null,
  service_price numeric(10, 2),
  status text not null default 'requested' check (status in ('requested', 'used', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loyalty_reward_one_per_appointment
  on public.loyalty_reward_requests (appointment_id)
  where status in ('requested', 'used');

alter table public.loyalty_deposits enable row level security;
alter table public.loyalty_reward_requests enable row level security;

drop policy if exists loyalty_deposits_member_select on public.loyalty_deposits;
create policy loyalty_deposits_member_select
  on public.loyalty_deposits
  for select
  using (public.is_center_member(center_id));

drop policy if exists loyalty_reward_requests_member_select on public.loyalty_reward_requests;
create policy loyalty_reward_requests_member_select
  on public.loyalty_reward_requests
  for select
  using (public.is_center_member(center_id));

create or replace function public.apply_loyalty_batch(
  p_center_id uuid,
  p_client_id uuid,
  p_appointment_id uuid,
  p_movements jsonb,
  p_close_reward boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  movement jsonb;
  balance integer;
  points integer;
  applied jsonb := '[]'::jsonb;
  existing_id uuid;
begin
  if p_center_id is null or p_client_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_target');
  end if;

  perform pg_advisory_xact_lock(hashtext(p_center_id::text || ':' || p_client_id::text));

  for movement in select value from jsonb_array_elements(coalesce(p_movements, '[]'::jsonb))
  loop
    existing_id := null;
    select id into existing_id
      from public.loyalty_events
      where center_id = p_center_id
        and idempotency_key = movement->>'key'
      limit 1;
    if existing_id is not null then
      continue;
    end if;

    points := coalesce((movement->>'points')::integer, 0);
    if coalesce((movement->>'clamp')::boolean, false) and points < 0 then
      select coalesce(sum(loyalty_events.points), 0) into balance
        from public.loyalty_events
        where center_id = p_center_id
          and client_id = p_client_id;
      if balance + points < 0 then
        points := -balance;
      end if;
    end if;

    if points = 0 and coalesce(movement->>'kind', '') <> 'manual_review' then
      continue;
    end if;

    insert into public.loyalty_events (
      center_id,
      client_id,
      appointment_id,
      points,
      reason,
      idempotency_key,
      kind,
      scale
    ) values (
      p_center_id,
      p_client_id,
      p_appointment_id,
      points,
      left(coalesce(movement->>'reason', 'Mouvement'), 240),
      movement->>'key',
      movement->>'kind',
      coalesce(movement->'scale', '{}'::jsonb)
    );

    applied := applied || jsonb_build_array(jsonb_build_object(
      'key', movement->>'key',
      'kind', movement->>'kind',
      'points', points,
      'reason', movement->>'reason'
    ));
  end loop;

  if coalesce(p_close_reward, false) and p_appointment_id is not null then
    update public.loyalty_reward_requests
      set status = 'closed',
          updated_at = now()
      where appointment_id = p_appointment_id
        and status = 'requested';
  end if;

  select coalesce(sum(loyalty_events.points), 0) into balance
    from public.loyalty_events
    where center_id = p_center_id
      and client_id = p_client_id;

  return jsonb_build_object('ok', true, 'applied', applied, 'balance', balance);
end;
$$;

create or replace function public.redeem_loyalty_reward(
  p_request_id uuid,
  p_service_price numeric,
  p_deposit_paid numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.loyalty_reward_requests;
  balance integer;
  discounted numeric;
  due numeric;
  appointment_status text;
begin
  select * into req
    from public.loyalty_reward_requests
    where id = p_request_id
    for update;
  if req.id is null then
    return jsonb_build_object('ok', false, 'error', 'request_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtext(req.center_id::text || ':' || req.client_id::text));

  select * into req
    from public.loyalty_reward_requests
    where id = p_request_id
    for update;
  if req.status <> 'requested' then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  select status into appointment_status
    from public.appointments
    where id = req.appointment_id;
  if appointment_status in ('cancelled', 'no_show') then
    update public.loyalty_reward_requests
      set status = 'closed', updated_at = now()
      where id = req.id and status = 'requested';
    return jsonb_build_object('ok', false, 'error', 'appointment_closed');
  end if;

  if exists (
    select 1 from public.loyalty_events
    where appointment_id = req.appointment_id
      and kind = 'reward'
  ) then
    update public.loyalty_reward_requests
      set status = 'used', updated_at = now()
      where id = req.id;
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  select coalesce(sum(points), 0) into balance
    from public.loyalty_events
    where center_id = req.center_id
      and client_id = req.client_id;
  if balance < req.points then
    return jsonb_build_object('ok', false, 'error', 'insufficient_points');
  end if;
  if coalesce(p_service_price, 0) < req.min_service_eur then
    return jsonb_build_object('ok', false, 'error', 'service_too_small');
  end if;

  insert into public.loyalty_events (
    center_id,
    client_id,
    appointment_id,
    points,
    reason,
    idempotency_key,
    kind,
    scale
  ) values (
    req.center_id,
    req.client_id,
    req.appointment_id,
    -req.points,
    'Récompense utilisée',
    'reward:' || req.id::text,
    'reward',
    jsonb_build_object(
      'rewardId', req.reward_id,
      'discountEur', req.discount_eur,
      'minServiceEur', req.min_service_eur,
      'servicePrice', p_service_price
    )
  );

  update public.loyalty_reward_requests
    set status = 'used',
        service_price = p_service_price,
        updated_at = now()
    where id = req.id
      and status = 'requested';

  discounted := greatest(0, round(coalesce(p_service_price, 0) - req.discount_eur, 2));
  due := greatest(0, round(discounted - greatest(coalesce(p_deposit_paid, 0), 0), 2));

  return jsonb_build_object(
    'ok', true,
    'points', -req.points,
    'discountEur', req.discount_eur,
    'discounted', discounted,
    'due', due,
    'refund', 0,
    'balance', balance - req.points
  );
end;
$$;

revoke all on function public.apply_loyalty_batch(uuid, uuid, uuid, jsonb, boolean) from public;
revoke all on function public.redeem_loyalty_reward(uuid, numeric, numeric) from public;
grant execute on function public.apply_loyalty_batch(uuid, uuid, uuid, jsonb, boolean) to service_role;
grant execute on function public.redeem_loyalty_reward(uuid, numeric, numeric) to service_role;
