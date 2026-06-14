-- Align partner venue visit stay with admin: session window heuristics + 180 min cap.

create or replace function public.get_my_partner_venue_visit_history(
  p_partner_id uuid,
  p_place_id uuid,
  p_search text default null,
  p_visit_filter text default 'all',
  p_connection_filter text default 'all',
  p_limit integer default 8,
  p_offset integer default 0
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
  v_offset integer;
  v_search text;
  v_filter text;
  v_connection_filter text;
  v_total bigint;
  v_rows jsonb;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_partner_id is null or p_place_id is null then
    return jsonb_build_object('ok', false, 'error', 'partner_id_and_place_id_required');
  end if;

  if not public.kami_partner_member_has_access(v_user_id, p_partner_id) then
    return jsonb_build_object('ok', false, 'error', 'not_partner_member');
  end if;

  if not exists (
    select 1
      from public.partner_venues pv
     where pv.partner_id = p_partner_id
       and pv.place_id = p_place_id
       and pv.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'venue_not_linked');
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 8), 50));
  v_offset := greatest(0, coalesce(p_offset, 0));
  v_search := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_filter := lower(trim(coalesce(p_visit_filter, 'all')));
  if v_filter not in ('all', 'active_now', 'demo', 'expired') then
    v_filter := 'all';
  end if;

  v_connection_filter := lower(trim(coalesce(p_connection_filter, 'all')));
  if v_connection_filter not in ('all', 'connected', 'pending', 'not_connected') then
    v_connection_filter := 'all';
  end if;

  with visits as (
    select
      upp.user_id,
      count(*)::bigint as visit_count,
      min(upp.first_seen_at) as first_seen_at,
      max(upp.last_seen_at) as last_seen_at,
      (array_agg(upp.expires_at order by upp.last_seen_at desc))[1] as expires_at,
      bool_or(upp.status = 'active' and upp.expires_at > now()) as is_active_now,
      (array_agg(upp.status order by upp.last_seen_at desc))[1] as last_status
    from public.user_place_presence upp
    where upp.place_id = p_place_id
      and upp.event_id is null
      and upp.status in ('active', 'demo', 'expired')
    group by upp.user_id
  ),
  filtered as (
    select
      v.user_id,
      nullif(trim(up.display_name), '') as display_name,
      u.ig_handle,
      up.avatar_url,
      v.visit_count,
      v.first_seen_at,
      v.last_seen_at,
      v.is_active_now,
      v.last_status,
      greatest(
        1,
        round(
          greatest(
            0,
            least(
              extract(epoch from (
                least(
                  case when v.is_active_now then now() else v.last_seen_at end,
                  v.expires_at
                ) - case
                  when ov.override_started_at is not null then greatest(v.first_seen_at, ov.override_started_at)
                  when (v.last_seen_at - v.first_seen_at) <= interval '180 minutes' then v.first_seen_at
                  when v.is_active_now then v.first_seen_at
                  else least(v.last_seen_at, v.expires_at) - interval '60 minutes'
                end
              ))::numeric,
              180 * 60
            )
          ) / 60.0
        )
      )::bigint as stay_minutes,
      case
        when c.id is null then 'none'
        when c.status = 'accepted' then 'accepted'
        when c.status = 'blocked' then 'blocked'
        when c.status = 'declined' and c.recipient_id = v_user_id then 'declined'
        when c.status = 'declined' then 'none'
        when c.status = 'pending' and c.requester_id = v_user_id then 'outgoing_pending'
        when c.status = 'pending' then 'incoming_pending'
        else 'none'
      end as connection_status,
      case
        when c.id is null then null
        when c.status = 'declined' and c.requester_id = v_user_id then null
        else c.id
      end as connection_id
    from visits v
    join public.users u on u.id = v.user_id
    left join public.user_profiles up on up.user_id = v.user_id
    left join lateral (
      select o.created_at as override_started_at
      from public.admin_user_position_overrides o
      where o.user_id = v.user_id
        and o.cleared_at is null
        and o.expires_at > now()
        and (o.place_id is null or o.place_id = p_place_id)
      order by o.created_at desc
      limit 1
    ) ov on true
    left join public.user_connections c
      on least(c.requester_id, c.recipient_id) = least(v_user_id, v.user_id)
     and greatest(c.requester_id, c.recipient_id) = greatest(v_user_id, v.user_id)
    where u.is_removed = false
      and v.user_id <> v_user_id
      and (
        v_search is null
        or lower(coalesce(up.display_name, '')) like '%' || v_search || '%'
        or lower(coalesce(u.ig_handle, '')) like '%' || v_search || '%'
      )
      and (
        v_filter = 'all'
        or (v_filter = 'active_now' and v.is_active_now)
        or (v_filter = 'demo' and v.last_status = 'demo')
        or (v_filter = 'expired' and not v.is_active_now and v.last_status = 'expired')
      )
  ),
  connection_filtered as (
    select f.*
      from filtered f
     where (
       v_connection_filter = 'all'
       or (v_connection_filter = 'connected' and f.connection_status = 'accepted')
       or (
         v_connection_filter = 'pending'
         and f.connection_status in ('outgoing_pending', 'incoming_pending')
       )
       or (
         v_connection_filter = 'not_connected'
         and f.connection_status in ('none', 'declined', 'blocked')
       )
     )
  ),
  numbered as (
    select
      f.*,
      count(*) over() as total_rows
    from connection_filtered f
  ),
  page as (
    select *
      from numbered n
     order by n.last_seen_at desc
     limit v_limit
     offset v_offset
  )
  select
    coalesce(max(p.total_rows), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'display_name', p.display_name,
          'ig_handle', p.ig_handle,
          'avatar_url', p.avatar_url,
          'visit_count', p.visit_count,
          'stay_minutes', p.stay_minutes,
          'first_seen_at', p.first_seen_at,
          'last_seen_at', p.last_seen_at,
          'is_active_now', p.is_active_now,
          'last_status', p.last_status,
          'connection_status', p.connection_status,
          'connection_id', p.connection_id
        )
        order by p.last_seen_at desc
      ),
      '[]'::jsonb
    )
  into v_total, v_rows
  from page p;

  return jsonb_build_object(
    'ok', true,
    'visitors', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;
