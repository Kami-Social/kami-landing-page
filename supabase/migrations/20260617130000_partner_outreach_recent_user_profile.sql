-- Enrich partner outreach history with target user profile and live connection status
-- so the portal can show avatars and open the same DM threads as the mobile app.

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
        'source', coalesce(poe.metadata->>'source', 'in_app'),
        'user_id', poe.target_user_id,
        'display_name', nullif(trim(up.display_name), ''),
        'ig_handle', u.ig_handle,
        'avatar_url', up.avatar_url,
        'connection_id', c.id,
        'connection_status',
          case
            when c.id is null and poe.status = 'sent' then 'outgoing_pending'
            when c.id is null and poe.status = 'accepted' then 'accepted'
            when c.id is null then 'none'
            when c.status = 'accepted' then 'accepted'
            when c.status = 'blocked' then 'blocked'
            when c.status = 'declined' and c.recipient_id = v_user_id then 'declined'
            when c.status = 'declined' then 'none'
            when c.status = 'pending' and c.requester_id = v_user_id then 'outgoing_pending'
            when c.status = 'pending' then 'incoming_pending'
            else 'none'
          end
      ) as row,
      poe.created_at
        from public.partner_outreach_events poe
        left join public.places pl on pl.id = poe.place_id
        left join public.users u on u.id = poe.target_user_id
        left join public.user_profiles up on up.user_id = poe.target_user_id
        left join public.user_connections c
          on least(c.requester_id, c.recipient_id) = least(v_user_id, poe.target_user_id)
         and greatest(c.requester_id, c.recipient_id) = greatest(v_user_id, poe.target_user_id)
       where poe.partner_id = p_partner_id
         and (u.id is null or u.is_removed = false)
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

revoke all on function public.get_my_partner_outreach_recent(uuid, integer) from public;
grant execute on function public.get_my_partner_outreach_recent(uuid, integer) to authenticated;
