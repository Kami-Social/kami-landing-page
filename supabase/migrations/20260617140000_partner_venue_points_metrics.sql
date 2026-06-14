-- Per-venue points in partner insights/dashboard; include place_wall_post earnings.

create or replace function public.kami_point_ledger_place_id(p_source_id text)
returns uuid
language sql
immutable
as $$
  select case
    when p_source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_source_id::uuid
    else null
  end;
$$;

create or replace function public.get_my_partner_insights(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_partner public.partners%rowtype;
  v_venue_count integer;
  v_published_count integer;
  v_month_start timestamptz;
  v_30d_start timestamptz;
  v_today_start timestamptz;
  v_visitors_this_month bigint;
  v_unique_30d bigint;
  v_repeat_30d bigint;
  v_first_time_month bigint;
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

  select * into v_partner from public.partners where id = p_partner_id;

  select count(*)::integer,
         count(*) filter (where pl.status = 'active' and pl.visibility = 'public')::integer
    into v_venue_count, v_published_count
    from public.partner_venues pv
    join public.places pl on pl.id = pv.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active';

  if coalesce(v_venue_count, 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'has_linked_venues', false,
      'has_activity', false,
      'insights', jsonb_build_object(
        'visitors_this_month', 0,
        'unique_visitors_30d', 0,
        'repeat_visitors_30d', 0,
        'first_time_visitors_this_month', 0,
        'event_visits_30d', 0,
        'points_earned_at_venues_30d', 0,
        'peak_day', null,
        'peak_hour', null
      ),
      'activity', jsonb_build_object(
        'users_seen_today', 0,
        'first_time_visitors_this_month', 0,
        'repeat_visitors_this_month', 0,
        'users_earned_points_this_month', 0,
        'upcoming_events_count', 0
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
        'published_venue_count', 0
      )
    );
  end if;

  v_month_start := date_trunc('month', now());
  v_30d_start := now() - interval '30 days';
  v_today_start := date_trunc('day', now());

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

  v_repeat_30d := greatest(coalesce(v_unique_30d, 0) - coalesce(v_first_time_month, 0), 0);

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
      on pv.place_id = public.kami_point_ledger_place_id(ple.source_id)
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and ple.points > 0
     and ple.source_type in ('place', 'place_wall_post')
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
        'first_time_visitors_30d', coalesce(stats.first_time_visitors, 0),
        'points_earned_30d', coalesce(points.points_earned_30d, 0)
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
        left join lateral (
          select coalesce(sum(ple.points), 0)::bigint as points_earned_30d
            from public.point_ledger_entries ple
           where ple.points > 0
             and ple.created_at >= v_30d_start
             and ple.source_type in ('place', 'place_wall_post')
             and public.kami_point_ledger_place_id(ple.source_id) = pl.id
        ) points on true
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
      'users_seen_today', coalesce((
        select count(distinct upp.user_id)::bigint
          from public.user_place_presence upp
          join public.partner_venues pv on pv.place_id = upp.place_id
         where pv.partner_id = p_partner_id
           and pv.status = 'active'
           and upp.event_id is null
           and upp.first_seen_at >= v_today_start
           and upp.status in ('active', 'demo', 'expired')
      ), 0),
      'first_time_visitors_this_month', coalesce(v_first_time_month, 0),
      'repeat_visitors_this_month', greatest(coalesce(v_visitors_this_month, 0) - coalesce(v_first_time_month, 0), 0),
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
      'published_venue_count', v_published_count
    )
  );
end;
$$;


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
      on pv.place_id = public.kami_point_ledger_place_id(ple.source_id)
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and ple.points > 0
     and ple.source_type in ('place', 'place_wall_post')
     and ple.created_at >= v_30d_start
     and public.kami_point_ledger_place_id(ple.source_id) is not null;

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
        'first_time_visitors_30d', coalesce(stats.first_time_visitors, 0),
        'points_earned_30d', coalesce(points.points_earned_30d, 0)
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
        left join lateral (
          select coalesce(sum(ple.points), 0)::bigint as points_earned_30d
            from public.point_ledger_entries ple
           where ple.points > 0
             and ple.created_at >= v_30d_start
             and ple.source_type in ('place', 'place_wall_post')
             and public.kami_point_ledger_place_id(ple.source_id) = pl.id
        ) points on true
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

create or replace function public.get_my_partner_dashboard(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_member public.partner_members%rowtype;
  v_partner public.partners%rowtype;
  v_settings public.partner_program_settings%rowtype;
  v_status jsonb;
  v_referral_code text;
  v_signup_count integer;
  v_venues jsonb;
  v_readiness jsonb;
  v_venue_count integer;
  v_published_count integer;
  v_status_label text;
  v_has_acceptance boolean;
  v_current_version text;
  v_avatar_url text;
  v_profile_name text;
  v_month_start timestamptz;
  v_month_qualified bigint;
  v_month_earned_cents bigint;
  v_remaining_cents integer;
  v_total_paid_lifetime integer;
  v_paid_this_month integer;
  v_program_parameters jsonb;
  v_30d_start timestamptz;
  v_today_start timestamptz;
  v_unique_30d bigint;
  v_users_today bigint;
  v_venue_metrics jsonb;
  v_has_venue_activity boolean;
  v_peak_day text;
  v_peak_hour integer;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_partner_id is null then
    return jsonb_build_object('ok', false, 'error', 'partner_id_required');
  end if;

  v_status := public.get_my_partner_agreement_status(p_partner_id);
  if coalesce(v_status->>'state', '') <> 'dashboard' then
    return jsonb_build_object(
      'ok', false,
      'error', 'dashboard_locked',
      'agreement_status', v_status
    );
  end if;

  select * into v_member
    from public.partner_members
   where partner_id = p_partner_id
     and user_id = v_user_id
     and status = 'active';

  select * into v_partner from public.partners where id = p_partner_id;
  select * into v_settings from public.partner_program_settings where is_active = true order by last_updated desc limit 1;
  v_current_version := coalesce(v_settings.current_agreement_version, 'partner_terms_v1');
  v_program_parameters := public.kami_build_partner_program_parameters(p_partner_id);

  select coalesce(up.display_name, up.username, v_partner.display_name),
         coalesce(nullif(trim(v_partner.avatar_url), ''), up.avatar_url)
    into v_profile_name, v_avatar_url
    from public.user_profiles up
   where up.user_id = v_user_id
   order by up.updated_at desc nulls last
   limit 1;

  select pl.code, pl.signup_count
    into v_referral_code, v_signup_count
    from public.promotion_links pl
   where pl.partner_id = p_partner_id
     and pl.link_type = 'partner_referral'
     and pl.status = 'active'
   order by pl.created_at desc
   limit 1;

  v_month_start := date_trunc('month', now());
  v_30d_start := now() - interval '30 days';
  v_today_start := date_trunc('day', now());

  select coalesce(jsonb_agg(row order by row->>'name'), '[]'::jsonb)
    into v_venues
    from (
      select jsonb_build_object(
        'place_id', pl.id,
        'name', pl.name,
        'photo_url', public.kami_resolve_place_photo_url(pl.id),
        'photo_storage_bucket', coalesce(public.kami_resolve_place_photo_storage(pl.id)->>'storage_bucket', 'place-images'),
        'photo_storage_path', public.kami_resolve_place_photo_storage(pl.id)->>'storage_path',
        'category', pl.category,
        'subcategory', pl.subcategory,
        'neighborhood', pl.neighborhood,
        'city', pl.city,
        'region', pl.region,
        'address', pl.address,
        'status', pl.status,
        'visibility', pl.visibility,
        'is_active', pl.status = 'active',
        'is_public', pl.visibility = 'public',
        'is_published', pl.status = 'active' and pl.visibility = 'public',
        'link_status', pv.status,
        'unique_visitors_30d', coalesce(stats.unique_visitors, 0),
        'total_visits_30d', coalesce(stats.total_visits, 0),
        'first_time_visitors_30d', coalesce(stats.first_time_visitors, 0),
        'visitors_this_month', coalesce(stats.visitors_this_month, 0),
        'points_earned_30d', coalesce(points.points_earned_30d, 0)
      ) as row
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
            )::bigint as first_time_visitors,
            count(distinct upp.user_id) filter (
              where upp.first_seen_at >= v_month_start
            )::bigint as visitors_this_month
          from public.user_place_presence upp
         where upp.place_id = pl.id
           and upp.event_id is null
           and upp.first_seen_at >= v_30d_start
           and upp.status in ('active', 'demo', 'expired')
        ) stats on true
        left join lateral (
          select coalesce(sum(ple.points), 0)::bigint as points_earned_30d
            from public.point_ledger_entries ple
           where ple.points > 0
             and ple.created_at >= v_30d_start
             and ple.source_type in ('place', 'place_wall_post')
             and public.kami_point_ledger_place_id(ple.source_id) = pl.id
        ) points on true
       where pv.partner_id = p_partner_id
         and pv.status = 'active'
       order by pl.name
    ) q;

  select coalesce(jsonb_agg(row order by row->>'name'), '[]'::jsonb)
    into v_venue_metrics
    from (
      select jsonb_build_object(
        'place_id', pl.id,
        'name', pl.name,
        'unique_visitors_30d', coalesce(stats.unique_visitors, 0),
        'total_visits_30d', coalesce(stats.total_visits, 0),
        'first_time_visitors_30d', coalesce(stats.first_time_visitors, 0),
        'visitors_this_month', coalesce(stats.visitors_this_month, 0),
        'points_earned_30d', coalesce(points.points_earned_30d, 0)
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
            )::bigint as first_time_visitors,
            count(distinct upp.user_id) filter (
              where upp.first_seen_at >= v_month_start
            )::bigint as visitors_this_month
          from public.user_place_presence upp
         where upp.place_id = pl.id
           and upp.event_id is null
           and upp.first_seen_at >= v_30d_start
           and upp.status in ('active', 'demo', 'expired')
        ) stats on true
        left join lateral (
          select coalesce(sum(ple.points), 0)::bigint as points_earned_30d
            from public.point_ledger_entries ple
           where ple.points > 0
             and ple.created_at >= v_30d_start
             and ple.source_type in ('place', 'place_wall_post')
             and public.kami_point_ledger_place_id(ple.source_id) = pl.id
        ) points on true
       where pv.partner_id = p_partner_id
         and pv.status = 'active'
    ) q;

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
    into v_users_today
    from public.user_place_presence upp
    join public.partner_venues pv on pv.place_id = upp.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active'
     and upp.event_id is null
     and upp.first_seen_at >= v_today_start
     and upp.status in ('active', 'demo', 'expired');

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

  v_has_venue_activity := coalesce(v_unique_30d, 0) > 0;

  select count(*)::integer,
         count(*) filter (where pl.status = 'active' and pl.visibility = 'public')::integer
    into v_venue_count, v_published_count
    from public.partner_venues pv
    join public.places pl on pl.id = pv.place_id
   where pv.partner_id = p_partner_id
     and pv.status = 'active';

  select exists (
    select 1 from public.partner_agreement_acceptances aa
     where aa.member_user_id = v_user_id
       and aa.partner_id = p_partner_id
       and aa.agreement_version = v_current_version
  ) into v_has_acceptance;

  v_readiness := jsonb_build_array(
    jsonb_build_object('key', 'partner_active', 'label', 'Partner account active', 'met', v_partner.status = 'active'),
    jsonb_build_object('key', 'agreement_accepted', 'label', 'Agreement accepted', 'met', v_has_acceptance),
    jsonb_build_object('key', 'venue_linked', 'label', 'Venue linked', 'met', v_venue_count > 0),
    jsonb_build_object(
      'key', 'venue_published',
      'label', 'Venue published',
      'met', v_venue_count > 0 and v_published_count = v_venue_count
    ),
    jsonb_build_object(
      'key', 'referral_active',
      'label', 'Referral code active',
      'met', v_referral_code is not null and length(trim(v_referral_code)) > 0
    )
  );

  if v_partner.status = 'active' then
    v_status_label := 'Active Partner';
  elsif v_partner.status = 'pending' then
    v_status_label := 'Pending Partner';
  elsif v_partner.status in ('inactive', 'suspended', 'removed') then
    v_status_label := 'Inactive Partner';
  else
    v_status_label := initcap(replace(v_partner.status, '_', ' '));
  end if;

  select count(*)::bigint
    into v_month_qualified
    from public.referral_attributions ra
    join public.promotion_links pl on pl.id = ra.promotion_link_id
    join public.users ref_u on ref_u.id = ra.referred_user_id
   where pl.partner_id = p_partner_id
     and pl.link_type = 'partner_referral'
     and ra.qualified_at >= v_month_start
     and coalesce(ref_u.is_test_user, false) = false
     and ref_u.is_removed = false;

  select coalesce(sum(pl.bounty_accrued_cents), 0)::bigint
    into v_month_earned_cents
    from public.promotion_links pl
   where pl.partner_id = p_partner_id
     and pl.link_type = 'partner_referral';

  if v_partner.maximum_spend_cents is not null then
    v_remaining_cents := greatest(v_partner.maximum_spend_cents - v_month_earned_cents::integer, 0);
  else
    v_remaining_cents := null;
  end if;

  select coalesce(sum(pp.amount_cents), 0)::integer
    into v_total_paid_lifetime
    from public.partner_payments pp
   where pp.partner_id = p_partner_id;

  select coalesce(sum(pp.amount_cents), 0)::integer
    into v_paid_this_month
    from public.partner_payments pp
   where pp.partner_id = p_partner_id
     and pp.paid_at >= v_month_start;

  return jsonb_build_object(
    'ok', true,
    'header', jsonb_build_object(
      'partner_id', v_partner.id,
      'display_name', coalesce(v_partner.display_name, v_profile_name, 'Partner'),
      'status', v_partner.status,
      'status_label', v_status_label,
      'contact_email', coalesce(v_partner.contact_email, ''),
      'joined_at', v_member.created_at,
      'member_role', v_member.role,
      'avatar_url', v_avatar_url
    ),
    'venues', coalesce(v_venues, '[]'::jsonb),
    'venue_metrics', coalesce(v_venue_metrics, '[]'::jsonb),
    'has_venue_activity', v_has_venue_activity,
    'venue_activity', jsonb_build_object(
      'users_seen_today', coalesce(v_users_today, 0),
      'unique_visitors_30d', coalesce(v_unique_30d, 0),
      'peak_day', v_peak_day,
      'peak_hour', v_peak_hour
    ),
    'readiness', v_readiness,
    'referral', jsonb_build_object(
      'code', coalesce(v_referral_code, ''),
      'link', case
        when v_referral_code is not null and length(trim(v_referral_code)) > 0
          then 'https://www.kamisocial.com/invite/' || v_referral_code
        else ''
      end,
      'signup_count', coalesce(v_signup_count, 0)
    ),
    'metrics', jsonb_build_object(
      'current_month_qualified_referrals', coalesce(v_month_qualified, 0),
      'pending_earnings_cents', 0,
      'approved_earnings_cents', 0,
      'lifetime_earnings_cents', coalesce(v_month_earned_cents, 0),
      'monthly_earnings_limit_cents', v_partner.maximum_spend_cents,
      'remaining_eligible_earnings_cents', v_remaining_cents,
      'paid_this_month_cents', coalesce(v_paid_this_month, 0),
      'total_paid_lifetime_cents', coalesce(v_total_paid_lifetime, 0)
    ),
    'program_parameters', v_program_parameters,
    'current_agreement_version', v_current_version,
    'program', jsonb_build_object(
      'program_parameters', v_program_parameters,
      'agreement_status', coalesce(v_member.agreement_status, v_partner.agreement_status),
      'agreement_version', v_member.agreement_version,
      'agreement_signed_at', v_member.agreement_signed_at,
      'current_agreement_version', v_current_version
    )
  );
end;
$$;

