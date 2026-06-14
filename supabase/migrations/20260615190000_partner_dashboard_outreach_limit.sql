-- Partner portal: dashboard outreach capped at 5/day per partner (separate from unlimited in-app connections).

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
  v_actor := public.kami_auth_user_id();
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

  insert into public.partner_outreach_events (
    partner_id,
    place_id,
    target_user_id,
    actor_user_id,
    type,
    status,
    connection_id,
    metadata
  )
  values (
    p_partner_id,
    p_place_id,
    p_target_user_id,
    v_actor,
    'connection_request',
    case
      when v_connection_result->>'status' = 'accepted' then 'accepted'
      when v_connection_result->>'status' = 'outgoing_pending' then 'sent'
      else 'failed'
    end,
    v_connection_id,
    jsonb_build_object('source', 'partner_dashboard')
  )
  returning id into v_outreach_id;

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

revoke all on function public.kami_partner_send_dashboard_outreach_request(uuid, uuid, uuid) from public;
grant execute on function public.kami_partner_send_dashboard_outreach_request(uuid, uuid, uuid) to authenticated;

-- Tag in-app outreach events for separate daily accounting.
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
  v_actor := public.kami_auth_user_id();
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

  insert into public.partner_outreach_events (
    partner_id,
    place_id,
    target_user_id,
    actor_user_id,
    type,
    status,
    connection_id,
    metadata
  )
  values (
    p_partner_id,
    p_place_id,
    p_target_user_id,
    v_actor,
    'connection_request',
    case
      when v_connection_result->>'status' = 'accepted' then 'accepted'
      when v_connection_result->>'status' = 'outgoing_pending' then 'sent'
      else 'failed'
    end,
    v_connection_id,
    jsonb_build_object('source', 'in_app')
  )
  returning id into v_outreach_id;

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
