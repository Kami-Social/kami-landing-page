-- Fix points aggregation (source_id is text; cast to uuid) and add outreach history RPC.

create or replace function public.get_my_partner_insights(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status jsonb;
  v_partner public.partners%rowtype;
  v_venue_count integer;
  v_published_count integer;
  v_referral_active boolean;
  v_month_start timestamptz;
  v_30d_start timestamptz;
  v_today_start timestamptz;
  v_visitors_this_month bigint;
  v_unique_30d bigint;
  v_first_time_30d bigint;
  v_first_time_month bigint;
  v_repeat_30d bigint;
  v_repeat_month bigint;
  v_users_today bigint;
  v_event_visits_30d bigint;
  v_points_users_30d bigint;
  v_points_total_30d bigint;
  v_upcoming_events integer;
  v_peak_day text;
  v_peak_hour integer;
  v_venue_metrics jsonb;
  v_has_activity boolean;
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

  v_status := public.get_my_partner_agreement_status(p_partner_id);
  if coalesce(v_status->>'state', '') <> 'dashboard' then
    return jsonb_build_object('ok', false, 'error', 'dashboard_locked', 'agreement_status', v_status);
  end if;

  select * into v_partner from public.partners where id = p_partner_id;

  select count(*)::integer,
         count(*) filter (where pv.is_published)::integer
    into v_venue_count, v_published_count
    from public.partner_venues pv
   where pv.partner_id = p_partner_id
     and pv.status = 'active';

  if v_venue_count = 0 then
    return jsonb_build_object(
      'ok', true,
      'has_linked_venues', false,
      'has_activity', false,
      'insights', jsonb_build_object(
        'visitors_this_month', null,
        'unique_visitors_30d', null,
        'repeat_visitors_30d', null,
        'first_time_visitors_this_month', null,
        'event_visits_30d', null,
        'points_earned_at_venues_30d', null,
        'peak_day', null,
        'peak_hour', null
      ),
      'activity', jsonb_build_object(
        'users_seen_today', null,
        'first_time_visitors_this_month', null,
        'repeat_visitors_this_month', null,
        'users_earned_points_this_month', null,
        'upcoming_events_count', null
      ),
      'venue_metrics', '[]'::jsonb,
      'benefits', jsonb_build_object(
        'partner_status', v_partner.status,
        'partner_type', v_partner.partner_type,
        'status_label', case
          when v_partner.status = 'active' then 'Active Partner'
          when v_partner.status = 'pending' then 'Pending Partner'
          else initcap(replace(v_partner.status, '_', ' '))
        end,
        'linked_venue_count', 0,
        'published_venue_count', 0,
        'referral_eligible', false,
        'referral_rate_cents', v_partner.rate_cents_per_registration
      )
    );
  end if;

  v_month_start := date_trunc('month', now());
  v_30d_start := now() - interval '30 days';
  v_today_start := date_trunc('day', now());

  v_referral_active := v_partner.status = 'active';

  select count(distinct upp.user_id)::bigint
    into v_visitors_this_month
    from public.user_place_presence upp
    join public.partner_venues pv on pv.place_id = upp.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and upp.event_id is null
     and upp.first_seen_at >= v_month_start
     and upp.status in ('active', 'demo', 'expired');

  select count(distinct upp.user_id)::bigint
    into v_unique_30d
    from public.user_place_presence upp
    join public.partner_venues pv on pv.place_id = upp.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and upp.event_id is null
     and upp.first_seen_at >= v_30d_start
     and upp.status in ('active', 'demo', 'expired');

  select count(distinct upp.user_id)::bigint
    into v_first_time_30d
    from public.user_place_presence upp
    join public.partner_venues pv on pv.place_id = upp.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and upp.event_id is null
     and upp.first_seen_at >= v_30d_start
     and upp.status in ('active', 'demo', 'expired')
     and not exists (
       select 1
         from public.user_place_presence prior
        where prior.user_id = upp.user_id
          and prior.place_id = upp.place_id
          and prior.event_id is null
          and prior.first_seen_at < v_30d_start
          and prior.status in ('active', 'demo', 'expired')
     );

  select count(distinct upp.user_id)::bigint
    into v_first_time_month
    from public.user_place_presence upp
    join public.partner_venues pv on pv.place_id = upp.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and upp.event_id is null
     and upp.first_seen_at >= v_month_start
     and upp.status in ('active', 'demo', 'expired')
     and not exists (
       select 1
         from public.user_place_presence prior
        where prior.user_id = upp.user_id
          and prior.place_id = upp.place_id
          and prior.event_id is null
          and prior.first_seen_at < v_month_start
          and prior.status in ('active', 'demo', 'expired')
     );

  v_repeat_30d := greatest(coalesce(v_unique_30d, 0) - coalesce(v_first_time_30d, 0), 0);

  select count(distinct upp.user_id)::bigint
    into v_users_today
    from public.user_place_presence upp
    join public.partner_venues pv on pv.place_id = upp.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and upp.event_id is null
     and upp.first_seen_at >= v_today_start
     and upp.status in ('active', 'demo', 'expired');

  v_repeat_month := greatest(coalesce(v_visitors_this_month, 0) - coalesce(v_first_time_month, 0), 0);

  select count(distinct upp.user_id)::bigint
    into v_event_visits_30d
    from public.user_place_presence upp
    join public.partner_venues pv on pv.place_id = upp.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and upp.event_id is not null
     and upp.first_seen_at >= v_30d_start
     and upp.status in ('active', 'demo', 'expired');

  select count(distinct ple.user_id)::bigint,
         coalesce(sum(ple.points), 0)::bigint
    into v_points_users_30d, v_points_total_30d
    from public.point_ledger_entries ple
    join public.partner_venues pv
      on pv.place_id = ple.source_id::uuid
     and ple.source_type = 'place'
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and ple.points > 0
     and ple.created_at >= v_30d_start;

  select coalesce(jsonb_array_length(public.get_my_partner_events(p_partner_id)->'events'), 0)::integer
    into v_upcoming_events;

  select d.day_label, d.hour_val
    into v_peak_day, v_peak_hour
    from (
      select
        to_char(date_trunc('day', upp.first_seen_at), 'Dy') as day_label,
        extract(hour from upp.first_seen_at)::integer as hour_val,
        count(*) as visits
      from public.user_place_presence upp
      join public.partner_venues pv on pv.place_id = upp.place_id
     where pv.partner_id = p_partner_id
       and pv.status = 'active'
       and upp.event_id is null
       and upp.first_seen_at >= v_30d_start
       and upp.status in ('active', 'demo', 'expired')
     group by 1, 2
     order by visits desc
     limit 1
    ) d;

  select coalesce(jsonb_agg(row order by row->>'name'), '[]'::jsonb)
    into v_venue_metrics
    from (
      select jsonb_build_object(
        'place_id', pl.id,
        'name', pl.name,
        'unique_visitors_30d', coalesce(stats.unique_visitors, 0),
        'total_visits_30d', coalesce(stats.total_visits, 0),
        'first_time_visitors_30d', coalesce(stats.first_time_visitors, 0)
      ) as row,
      pl.name
        from public.partner_venues pv
        join public.places pl on pl.id = pv.place_id
        left join lateral (
          select
            count(distinct upp.user_id)::bigint as unique_visitors,
            count(*)::bigint as total_visits,
            count(distinct upp.user_id) filter (
              where not exists (
                select 1
                  from public.user_place_presence prior
                 where prior.user_id = upp.user_id
                   and prior.place_id = upp.place_id
                   and prior.event_id is null
                   and prior.first_seen_at < v_30d_start
                   and prior.status in ('active', 'demo', 'expired')
              )
            )::bigint as first_time_visitors
          from public.user_place_presence upp
         where upp.place_id = pl.id
           and upp.event_id is null
           and upp.first_seen_at >= v_30d_start
           and upp.status in ('active', 'demo', 'expired')
        ) stats on true
       where pv.partner_id = p_partner_id
         and pv.status = 'active'
    ) q;

  v_has_activity :=
    coalesce(v_visitors_this_month, 0) > 0
    or coalesce(v_unique_30d, 0) > 0
    or coalesce(v_event_visits_30d, 0) > 0
    or coalesce(v_points_total_30d, 0) > 0;

  return jsonb_build_object(
    'ok', true,
    'has_linked_venues', true,
    'has_activity', v_has_activity,
    'insights', jsonb_build_object(
      'visitors_this_month', coalesce(v_visitors_this_month, 0),
      'unique_visitors_30d', coalesce(v_unique_30d, 0),
      'repeat_visitors_30d', v_repeat_30d,
      'first_time_visitors_this_month', coalesce(v_first_time_month, 0),
      'event_visits_30d', coalesce(v_event_visits_30d, 0),
      'points_earned_at_venues_30d', coalesce(v_points_total_30d, 0),
      'peak_day', v_peak_day,
      'peak_hour', v_peak_hour
    ),
    'activity', jsonb_build_object(
      'users_seen_today', coalesce(v_users_today, 0),
      'first_time_visitors_this_month', coalesce(v_first_time_month, 0),
      'repeat_visitors_this_month', v_repeat_month,
      'users_earned_points_this_month', coalesce(v_points_users_30d, 0),
      'upcoming_events_count', coalesce(v_upcoming_events, 0)
    ),
    'venue_metrics', coalesce(v_venue_metrics, '[]'::jsonb),
    'benefits', jsonb_build_object(
      'partner_status', v_partner.status,
      'partner_type', v_partner.partner_type,
      'status_label', case
        when v_partner.status = 'active' then 'Active Partner'
        when v_partner.status = 'pending' then 'Pending Partner'
        else initcap(replace(v_partner.status, '_', ' '))
      end,
      'linked_venue_count', v_venue_count,
      'published_venue_count', v_published_count,
      'referral_eligible', v_referral_active,
      'referral_rate_cents', v_partner.rate_cents_per_registration
    )
  );
end;
$$;

revoke all on function public.get_my_partner_insights(uuid) from public;
grant execute on function public.get_my_partner_insights(uuid) to authenticated;

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
  v_today_count integer;
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
    into v_today_count
    from public.partner_outreach_events poe
   where poe.partner_id = p_partner_id
     and poe.created_at >= date_trunc('day', now());

  select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
    into v_events
    from (
      select jsonb_build_object(
        'id', poe.id,
        'created_at', poe.created_at,
        'place_id', poe.place_id,
        'venue_name', coalesce(pl.name, 'Venue'),
        'status', poe.status,
        'type', poe.type
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
      'used_today', coalesce(v_today_count, 0),
      'remaining_today', greatest(v_daily_limit - coalesce(v_today_count, 0), 0)
    )
  );
end;
$$;

revoke all on function public.get_my_partner_outreach_recent(uuid, integer) from public;
grant execute on function public.get_my_partner_outreach_recent(uuid, integer) to authenticated;
