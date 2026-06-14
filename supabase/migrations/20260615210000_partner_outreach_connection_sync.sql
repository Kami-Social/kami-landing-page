-- Record partner connection requests in partner_outreach_events even when sent outside the capped RPCs
-- (e.g. legacy portal fallback or direct send_connection_request from the Kami app).

create unique index if not exists partner_outreach_events_connection_id_key
  on public.partner_outreach_events (connection_id)
  where connection_id is not null;

-- Backfill outreach rows for partner-member connection requests missing from the log.
insert into public.partner_outreach_events (
  partner_id,
  place_id,
  target_user_id,
  actor_user_id,
  type,
  status,
  connection_id,
  metadata,
  created_at
)
select
  pm.partner_id,
  pv.place_id,
  uc.recipient_id,
  uc.requester_id,
  'connection_request',
  case
    when uc.status = 'accepted' then 'accepted'
    when uc.status = 'pending' then 'sent'
    else 'failed'
  end,
  uc.id,
  jsonb_build_object('source', 'partner_dashboard', 'backfill', true),
  uc.created_at
from public.user_connections uc
join public.partner_members pm on pm.user_id = uc.requester_id
join public.partners p on p.id = pm.partner_id and p.status = 'active'
join lateral (
  select pv.place_id
    from public.partner_venues pv
    join public.user_place_presence upp
      on upp.place_id = pv.place_id
     and upp.user_id = uc.recipient_id
     and upp.event_id is null
   where pv.partner_id = pm.partner_id
     and pv.status = 'active'
   order by upp.last_seen_at desc nulls last
   limit 1
) pv on true
where not exists (
  select 1
    from public.partner_outreach_events poe
   where poe.connection_id = uc.id
);

create or replace function public.kami_sync_partner_outreach_from_connection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_place_id uuid;
  v_source text;
begin
  if new.requester_id is null or new.recipient_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.partner_outreach_events poe where poe.connection_id = new.id
  ) then
    return new;
  end if;

  select pm.partner_id
    into v_partner_id
    from public.partner_members pm
    join public.partners p on p.id = pm.partner_id
   where pm.user_id = new.requester_id
     and p.status = 'active'
     and p.outreach_enabled = true
   order by pm.created_at asc nulls last
   limit 1;

  if v_partner_id is null then
    return new;
  end if;

  select pv.place_id
    into v_place_id
    from public.partner_venues pv
    join public.user_place_presence upp
      on upp.place_id = pv.place_id
     and upp.user_id = new.recipient_id
     and upp.event_id is null
   where pv.partner_id = v_partner_id
     and pv.status = 'active'
   order by upp.last_seen_at desc nulls last
   limit 1;

  if v_place_id is null then
    return new;
  end if;

  select case
    when exists (
      select 1
        from public.user_place_presence upp
       where upp.user_id = new.requester_id
         and upp.place_id = v_place_id
         and upp.event_id is null
         and upp.status in ('active', 'demo')
         and upp.expires_at > now()
    ) then 'in_app'
    else 'partner_dashboard'
  end
    into v_source;

  insert into public.partner_outreach_events (
    partner_id,
    place_id,
    target_user_id,
    actor_user_id,
    type,
    status,
    connection_id,
    metadata,
    created_at
  )
  values (
    v_partner_id,
    v_place_id,
    new.recipient_id,
    new.requester_id,
    'connection_request',
    case
      when new.status = 'accepted' then 'accepted'
      when new.status = 'pending' then 'sent'
      else 'failed'
    end,
    new.id,
    jsonb_build_object('source', v_source),
    new.created_at
  )
  on conflict (connection_id) where connection_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists kami_sync_partner_outreach_from_connection on public.user_connections;
create trigger kami_sync_partner_outreach_from_connection
  after insert on public.user_connections
  for each row
  execute function public.kami_sync_partner_outreach_from_connection();

-- Use resolve helper (matches the rest of the partner portal) and avoid duplicate inserts.
create or replace function public.kami_partner_send_dashboard_outreach_request(
  p_partner_id uuid,
  p_place_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_partner public.partners%rowtype;
  v_today_count integer;
  v_daily_limit constant integer := 5;
  v_connection_result jsonb;
  v_connection_id uuid;
  v_outreach_id uuid;
begin
  v_actor := public.kami_resolve_auth_app_user_id();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.kami_partner_member_has_access(v_actor, p_partner_id) then
    return jsonb_build_object('ok', false, 'error', 'partner_access_denied');
  end if;

  select * into v_partner from public.partners where id = p_partner_id;
  if v_partner.status <> 'active' or v_partner.outreach_enabled = false then
    return jsonb_build_object('ok', false, 'error', 'partner_outreach_disabled');
  end if;

  if not exists (
    select 1 from public.partner_venues pv
    where pv.partner_id = p_partner_id and pv.place_id = p_place_id and pv.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'venue_not_linked');
  end if;

  if p_target_user_id is null or p_target_user_id = v_actor then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  if not exists (
    select 1
      from public.user_place_presence upp
     where upp.user_id = p_target_user_id
       and upp.place_id = p_place_id
       and upp.event_id is null
       and upp.status in ('active', 'demo', 'expired')
  ) then
    return jsonb_build_object('ok', false, 'error', 'target_not_a_venue_visitor');
  end if;

  select count(*)::integer
    into v_today_count
    from public.partner_outreach_events poe
   where poe.partner_id = p_partner_id
     and poe.created_at >= date_trunc('day', now())
     and coalesce(poe.metadata->>'source', '') = 'partner_dashboard';

  if v_today_count >= v_daily_limit then
    return jsonb_build_object(
      'ok', false,
      'error', 'daily_outreach_limit',
      'daily', jsonb_build_object(
        'limit', v_daily_limit,
        'used_today', v_today_count,
        'remaining_today', 0
      )
    );
  end if;

  v_connection_result := public.send_connection_request(p_target_user_id);
  v_connection_id := nullif(v_connection_result->>'connection_id', '')::uuid;

  select poe.id
    into v_outreach_id
    from public.partner_outreach_events poe
   where poe.connection_id = v_connection_id
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'outreach_id', v_outreach_id,
    'connection', v_connection_result,
    'daily', jsonb_build_object(
      'limit', v_daily_limit,
      'used_today', v_today_count + 1,
      'remaining_today', greatest(v_daily_limit - v_today_count - 1, 0)
    )
  );
end;
$$;

create or replace function public.kami_partner_send_outreach_request(
  p_partner_id uuid,
  p_place_id uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_partner public.partners%rowtype;
  v_today_count integer;
  v_connection_result jsonb;
  v_connection_id uuid;
  v_outreach_id uuid;
begin
  v_actor := public.kami_resolve_auth_app_user_id();
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not public.kami_partner_member_has_access(v_actor, p_partner_id) then
    return jsonb_build_object('ok', false, 'error', 'partner_access_denied');
  end if;

  select * into v_partner from public.partners where id = p_partner_id;
  if v_partner.status <> 'active' or v_partner.outreach_enabled = false then
    return jsonb_build_object('ok', false, 'error', 'partner_outreach_disabled');
  end if;

  if not exists (
    select 1 from public.partner_venues pv
    where pv.partner_id = p_partner_id and pv.place_id = p_place_id and pv.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'venue_not_linked');
  end if;

  if not exists (
    select 1 from public.user_place_presence upp
    where upp.user_id = v_actor
      and upp.place_id = p_place_id
      and upp.event_id is null
      and upp.status in ('active', 'demo')
      and upp.expires_at > now()
  ) then
    return jsonb_build_object('ok', false, 'error', 'actor_not_present');
  end if;

  if not exists (
    select 1 from public.user_place_presence upp
    where upp.user_id = p_target_user_id
      and upp.place_id = p_place_id
      and upp.event_id is null
      and upp.status in ('active', 'demo')
      and upp.expires_at > now()
  ) then
    return jsonb_build_object('ok', false, 'error', 'target_not_present');
  end if;

  select count(*)::integer
    into v_today_count
    from public.partner_outreach_events poe
   where poe.partner_id = p_partner_id
     and poe.created_at >= date_trunc('day', now())
     and coalesce(poe.metadata->>'source', 'in_app') <> 'partner_dashboard';

  if v_today_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'daily_outreach_limit');
  end if;

  v_connection_result := public.send_connection_request(p_target_user_id);
  v_connection_id := nullif(v_connection_result->>'connection_id', '')::uuid;

  select poe.id
    into v_outreach_id
    from public.partner_outreach_events poe
   where poe.connection_id = v_connection_id
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'outreach_id', v_outreach_id,
    'connection', v_connection_result
  );
end;
$$;

create or replace function public.get_my_partner_outreach_recent(
  p_partner_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_limit integer;
  v_events jsonb;
  v_in_app_today integer;
  v_dashboard_today integer;
  v_daily_limit constant integer := 5;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_partner_id is null then
    return jsonb_build_object('ok', false, 'error', 'partner_id_required');
  end if;

  if not public.kami_partner_member_has_access(v_user_id, p_partner_id) then
    return jsonb_build_object('ok', false, 'error', 'not_partner_member');
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 50));

  select count(*)::integer
    into v_in_app_today
    from public.partner_outreach_events poe
   where poe.partner_id = p_partner_id
     and poe.created_at >= date_trunc('day', now())
     and coalesce(poe.metadata->>'source', 'in_app') <> 'partner_dashboard';

  select count(*)::integer
    into v_dashboard_today
    from public.partner_outreach_events poe
   where poe.partner_id = p_partner_id
     and poe.created_at >= date_trunc('day', now())
     and coalesce(poe.metadata->>'source', '') = 'partner_dashboard';

  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
    into v_events
    from (
      select jsonb_build_object(
        'id', poe.id,
        'created_at', poe.created_at,
        'place_id', poe.place_id,
        'venue_name', coalesce(pl.name, 'Venue'),
        'status', poe.status,
        'type', poe.type,
        'source', coalesce(poe.metadata->>'source', 'in_app')
      ) as row,
      poe.created_at
        from public.partner_outreach_events poe
        left join public.places pl on pl.id = poe.place_id
       where poe.partner_id = p_partner_id
       order by poe.created_at desc
       limit v_limit
    ) q;

  return jsonb_build_object(
    'ok', true,
    'events', coalesce(v_events, '[]'::jsonb),
    'daily', jsonb_build_object(
      'limit', v_daily_limit,
      'used_today', coalesce(v_in_app_today, 0),
      'remaining_today', greatest(v_daily_limit - coalesce(v_in_app_today, 0), 0)
    ),
    'daily_dashboard', jsonb_build_object(
      'limit', v_daily_limit,
      'used_today', coalesce(v_dashboard_today, 0),
      'remaining_today', greatest(v_daily_limit - coalesce(v_dashboard_today, 0), 0)
    )
  );
end;
$$;
