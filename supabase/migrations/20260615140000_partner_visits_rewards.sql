-- Partner portal: store rewards, venue visit history (admin parity), visitors-this-month on venues.

create or replace function public.get_my_partner_store_rewards(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rewards jsonb;
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

  select coalesce(jsonb_agg(row order by row->>'title'), '[]'::jsonb)
    into v_rewards
    from (
      select jsonb_build_object(
        'reward_id', r.id,
        'title', r.title,
        'subtitle', r.subtitle,
        'status', r.status,
        'points_cost', r.points_cost,
        'redemptions', coalesce(red.cnt, 0),
        'quantity_remaining', r.quantity_remaining,
        'store_url', case
          when nullif(trim(r.external_url), '') is not null then trim(r.external_url)
          else 'https://www.kamisocial.com/store'
        end
      ) as row,
      r.title
        from public.point_store_rewards r
        left join lateral (
          select count(*)::integer as cnt
            from public.point_store_redemptions psr
           where psr.reward_id = r.id
        ) red on true
       where r.partner_id = p_partner_id
         and r.status in ('published', 'draft', 'paused')
    ) q;

  return jsonb_build_object('ok', true, 'rewards', coalesce(v_rewards, '[]'::jsonb));
end;
$$;

revoke all on function public.get_my_partner_store_rewards(uuid) from public;
grant execute on function public.get_my_partner_store_rewards(uuid) to authenticated;

create or replace function public.get_my_partner_venue_visit_history(
  p_partner_id uuid,
  p_place_id uuid,
  p_search text default null,
  p_visit_filter text default 'all',
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

  with visits as (
    select
      upp.user_id,
      count(*)::bigint as visit_count,
      min(upp.first_seen_at) as first_seen_at,
      max(upp.last_seen_at) as last_seen_at,
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
          extract(epoch from (
            case
              when v.is_active_now then now() - v.first_seen_at
              else v.last_seen_at - v.first_seen_at
            end
          )) / 60.0
        )
      )::bigint as stay_minutes
    from visits v
    join public.users u on u.id = v.user_id
    left join public.user_profiles up on up.user_id = v.user_id
    where u.is_removed = false
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
  numbered as (
    select
      f.*,
      count(*) over() as total_rows
    from filtered f
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
          'last_status', p.last_status
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

revoke all on function public.get_my_partner_venue_visit_history(uuid, uuid, text, text, integer, integer) from public;
grant execute on function public.get_my_partner_venue_visit_history(uuid, uuid, text, text, integer, integer) to authenticated;

-- Add visitors_this_month to each venue in get_my_partner_dashboard (patch stats lateral).
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
        'visitors_this_month', coalesce(stats.visitors_this_month, 0)
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
        'visitors_this_month', coalesce(stats.visitors_this_month, 0)
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
