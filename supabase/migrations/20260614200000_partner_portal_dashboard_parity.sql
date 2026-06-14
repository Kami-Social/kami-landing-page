-- Partner portal dashboard parity: metrics, referrals, ledger, agreement history,
-- manually linked events (partner_events), venue photos from place_images, avatar in header.

create or replace function public.kami_resolve_place_photo_url(p_place_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(pl.photo_url), ''),
    (
      select 'https://bscnpilzmilzabagnypx.supabase.co/storage/v1/object/public/'
             || coalesce(nullif(trim(pi.storage_bucket), ''), 'place-images')
             || '/' || pi.storage_path
      from public.place_images pi
      where pi.place_id = pl.id
        and pi.status = 'approved'
        and pi.storage_path is not null
        and length(trim(pi.storage_path)) > 0
      order by pi.approved_at desc nulls last, pi.created_at desc
      limit 1
    )
  )
  from public.places pl
  where pl.id = p_place_id;
$$;

revoke all on function public.kami_resolve_place_photo_url(uuid) from public;
grant execute on function public.kami_resolve_place_photo_url(uuid) to authenticated;

-- Include tier cap in partner program parameters.
create or replace function public.kami_build_partner_program_parameters(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_member public.partner_members%rowtype;
  v_settings public.partner_program_settings%rowtype;
  v_partner public.partners%rowtype;
  v_rate_text text;
  v_threshold_cents integer;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_partner_id is null then
    raise exception 'partner_id_required';
  end if;

  select pm.*
    into v_member
    from public.partner_members pm
    join public.partners p on p.id = pm.partner_id
   where pm.partner_id = p_partner_id
     and pm.user_id = v_user_id
     and pm.status = 'active'
     and p.status in ('pending', 'active', 'suspended');

  if not found then
    raise exception 'not_partner_member';
  end if;

  select *
    into v_settings
    from public.partner_program_settings
   where is_active = true
   order by last_updated desc
   limit 1;

  select *
    into v_partner
    from public.partners
   where id = p_partner_id;

  if not found then
    return jsonb_build_object(
      'qualification_requirements', 'Contact partners@kamisocial.com for current program settings.',
      'compensation_rate', 'Contact partners@kamisocial.com for current program settings.',
      'payout_threshold', 'Contact partners@kamisocial.com for current program settings.',
      'payout_schedule', 'Contact partners@kamisocial.com for current program settings.',
      'last_updated', now()
    );
  end if;

  v_threshold_cents := coalesce(
    v_partner.payout_threshold_cents,
    v_settings.payout_threshold_cents,
    5000
  );

  v_rate_text := format(
    '$%s USD per qualified referral',
    to_char(coalesce(v_partner.rate_cents_per_registration, 0) / 100.0, 'FM999990.00')
  );

  if v_partner.rate_tiers is not null and jsonb_array_length(v_partner.rate_tiers) > 0 then
    v_rate_text := v_rate_text || '. Tier details are shown in your Partner Portal.';
  end if;

  return jsonb_build_object(
    'qualification_requirements', coalesce(
      v_settings.qualification_requirements,
      'Contact partners@kamisocial.com for current qualification requirements.'
    ),
    'compensation_rate', coalesce(v_settings.compensation_rate, v_rate_text),
    'rate_cents_per_registration', v_partner.rate_cents_per_registration,
    'rate_tiers', coalesce(v_partner.rate_tiers, '[]'::jsonb),
    'rate_display', v_rate_text,
    'payout_threshold_cents', v_threshold_cents,
    'payout_threshold', format('$%s USD', to_char(v_threshold_cents / 100.0, 'FM999990.00')),
    'payout_schedule', coalesce(
      v_settings.payout_schedule,
      'Contact partners@kamisocial.com for current payout schedule.'
    ),
    'maximum_spend_cents', v_partner.maximum_spend_cents,
    'tier_cap_cents', v_partner.maximum_spend_cents,
    'last_updated', coalesce(v_settings.last_updated, now())
  );
end;
$$;

revoke all on function public.kami_build_partner_program_parameters(uuid) from public;
revoke all on function public.kami_build_partner_program_parameters(uuid) from anon;
grant execute on function public.kami_build_partner_program_parameters(uuid) to authenticated;

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

  select coalesce(jsonb_agg(row order by row->>'name'), '[]'::jsonb)
    into v_venues
    from (
      select jsonb_build_object(
        'place_id', pl.id,
        'name', pl.name,
        'photo_url', public.kami_resolve_place_photo_url(pl.id),
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
        'link_status', pv.status
      ) as row
        from public.partner_venues pv
        join public.places pl on pl.id = pv.place_id
       where pv.partner_id = p_partner_id
         and pv.status = 'active'
       order by pl.name
    ) q;

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

  v_month_start := date_trunc('month', now());

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

create or replace function public.get_my_partner_events(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_status jsonb;
  v_events jsonb;
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
    return jsonb_build_object(
      'ok', false,
      'error', 'dashboard_locked',
      'agreement_status', v_status
    );
  end if;

  select coalesce(jsonb_agg(row order by row->>'starts_at'), '[]'::jsonb)
    into v_events
    from (
      select distinct on (e.id)
        jsonb_build_object(
          'event_id', e.id,
          'name', e.name,
          'description', e.description,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at,
          'status', e.status,
          'category', e.category,
          'image_url', e.image_url,
          'place_id', p.id,
          'place_name', p.name,
          'place_neighborhood', p.neighborhood,
          'place_city', p.city,
          'place_photo_url', public.kami_resolve_place_photo_url(p.id),
          'display_image_url', coalesce(nullif(trim(e.image_url), ''), public.kami_resolve_place_photo_url(p.id))
        ) as row,
        e.starts_at
        from public.partner_events pe
        join public.events e on (
          (pe.event_id is not null and e.id = pe.event_id)
          or (pe.event_group_id is not null and e.event_group_id = pe.event_group_id)
        )
        join public.places p on p.id = e.place_id
       where pe.partner_id = p_partner_id
         and pe.status = 'active'
         and e.status = 'published'
         and p.status = 'active'
         and p.visibility = 'public'
         and e.presentation_mode <> 'hidden'
         and not (e.ends_at is not null and e.ends_at < now())
         and (
           e.starts_at > now()
           or (e.starts_at <= now() and (e.ends_at is null or e.ends_at >= now()))
         )
       order by e.id, e.starts_at asc
    ) q;

  return jsonb_build_object('ok', true, 'events', coalesce(v_events, '[]'::jsonb));
end;
$$;

create or replace function public.get_my_partner_referrals(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
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

  select coalesce(jsonb_agg(row order by row->>'date' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'date', ra.created_at,
        'name', coalesce(up.display_name, up.username, 'Kami user'),
        'handle', coalesce(up.username, ref_u.ig_handle, ''),
        'avatar_url', up.avatar_url,
        'qualification_status', case
          when ra.status = 'rejected' then 'Rejected'
          when ra.status = 'qualified' or ra.qualified_at is not null then 'Qualified'
          when ra.metadata->>'cap_reached' = 'true' then 'Cap Reached'
          else 'Pending'
        end,
        'applied_rate', coalesce(ra.metadata->>'applied_rate', ra.metadata->>'rate_tier', ''),
        'earnings_cents', coalesce((ra.metadata->>'earnings_cents')::integer, 0),
        'reason', coalesce(ra.metadata->>'rejection_reason', ra.metadata->>'reason', '')
      ) as row
        from public.referral_attributions ra
        join public.promotion_links pl on pl.id = ra.promotion_link_id
        join public.users ref_u on ref_u.id = ra.referred_user_id
        left join lateral (
          select display_name, username, avatar_url
            from public.user_profiles
           where user_id = ref_u.id
           order by updated_at desc nulls last
           limit 1
        ) up on true
       where pl.partner_id = p_partner_id
         and pl.link_type = 'partner_referral'
       order by ra.created_at desc
       limit 200
    ) q;

  return jsonb_build_object('ok', true, 'referrals', v_rows);
end;
$$;

create or replace function public.get_my_partner_payout_history(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
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

  select coalesce(jsonb_agg(row order by row->>'paid_date' desc), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'period', case
          when pp.period_start is not null and pp.period_end is not null
            then to_char(pp.period_start, 'Mon YYYY') || ' – ' || to_char(pp.period_end, 'Mon DD, YYYY')
          when pp.period_start is not null then to_char(pp.period_start, 'Mon YYYY')
          else to_char(pp.paid_at, 'Mon YYYY')
        end,
        'qualified_referrals', null,
        'gross_earnings_cents', pp.amount_cents,
        'adjustments_cents', 0,
        'approved_amount_cents', pp.amount_cents,
        'paid_amount_cents', pp.amount_cents,
        'paid_date', pp.paid_at,
        'status', 'Paid',
        'notes', coalesce(pp.notes, pp.payment_reference, '')
      ) as row
        from public.partner_payments pp
       where pp.partner_id = p_partner_id
       order by pp.paid_at desc
       limit 100
    ) q;

  return jsonb_build_object('ok', true, 'payouts', v_rows);
end;
$$;

create or replace function public.get_my_partner_change_ledger(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rows jsonb;
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

  select coalesce(jsonb_agg(w.row order by w.sort_date desc), '[]'::jsonb)
    into v_rows
    from (
      select combined.sort_date, combined.row
        from (
          select ae.created_at as sort_date,
                 jsonb_build_object(
                   'date', ae.created_at,
                   'change_type', ae.event_type,
                   'previous_value', ae.old_value,
                   'new_value', ae.new_value,
                   'notes', ae.notes
                 ) as row
            from public.partner_audit_events ae
           where ae.partner_id = p_partner_id
          union all
          select aa.accepted_at as sort_date,
                 jsonb_build_object(
                   'date', aa.accepted_at,
                   'change_type', 'Agreement Accepted',
                   'previous_value', null,
                   'new_value', jsonb_build_object(
                     'agreement_version', aa.agreement_version,
                     'program_parameters_snapshot', aa.program_parameters_snapshot
                   ),
                   'notes', 'Partner accepted the program agreement.'
                 ) as row
            from public.partner_agreement_acceptances aa
           where aa.partner_id = p_partner_id
             and aa.member_user_id = v_user_id
        ) combined
       order by combined.sort_date desc
       limit 200
    ) w;

  return jsonb_build_object('ok', true, 'ledger', coalesce(v_rows, '[]'::jsonb));
end;
$$;

create or replace function public.get_my_partner_agreement_history(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_settings public.partner_program_settings%rowtype;
  v_current_version text;
  v_current_acceptance public.partner_agreement_acceptances%rowtype;
  v_historical jsonb;
  v_threshold_display text;
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

  select * into v_settings from public.partner_program_settings where is_active = true order by last_updated desc limit 1;
  v_current_version := coalesce(v_settings.current_agreement_version, 'partner_terms_v1');

  select *
    into v_current_acceptance
    from public.partner_agreement_acceptances aa
   where aa.partner_id = p_partner_id
     and aa.member_user_id = v_user_id
     and aa.agreement_version = v_current_version
   order by aa.accepted_at desc
   limit 1;

  select coalesce(jsonb_agg(row order by row->>'accepted_at' desc), '[]'::jsonb)
    into v_historical
    from (
      select jsonb_build_object(
        'version', aa.agreement_version,
        'accepted_at', aa.accepted_at,
        'agreement_snapshot', aa.agreement_snapshot,
        'program_parameters_snapshot', aa.program_parameters_snapshot,
        'payout_threshold_display', coalesce(
          aa.program_parameters_snapshot->>'payout_threshold',
          aa.program_parameters_snapshot->>'payout_threshold_snapshot_display'
        ),
        'tier_cap_display', coalesce(
          aa.program_parameters_snapshot->>'tier_cap_snapshot_display',
          aa.program_parameters_snapshot->>'maximum_spend_cents'
        )
      ) as row
        from public.partner_agreement_acceptances aa
       where aa.partner_id = p_partner_id
         and aa.member_user_id = v_user_id
         and aa.agreement_version <> v_current_version
       order by aa.accepted_at desc
    ) q;

  v_threshold_display := coalesce(
    v_current_acceptance.program_parameters_snapshot->>'payout_threshold',
    v_current_acceptance.program_parameters_snapshot->>'payout_threshold_snapshot_display'
  );

  return jsonb_build_object(
    'ok', true,
    'current_agreement', case
      when v_current_acceptance.id is null then null
      else jsonb_build_object(
        'version', v_current_acceptance.agreement_version,
        'accepted_at', v_current_acceptance.accepted_at,
        'agreement_snapshot', v_current_acceptance.agreement_snapshot,
        'program_parameters_snapshot', v_current_acceptance.program_parameters_snapshot,
        'payout_threshold_display', v_threshold_display,
        'tier_cap_display', coalesce(
          v_current_acceptance.program_parameters_snapshot->>'tier_cap_snapshot_display',
          v_current_acceptance.program_parameters_snapshot->>'maximum_spend_cents'
        )
      )
    end,
    'historical_agreements', coalesce(v_historical, '[]'::jsonb)
  );
end;
$$;

create or replace function public.terminate_my_partner_participation(
  p_partner_id uuid,
  p_confirmation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_member public.partner_members%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if coalesce(trim(p_confirmation), '') <> 'LEAVE' then
    return jsonb_build_object('ok', false, 'error', 'confirmation_required');
  end if;

  if p_partner_id is null then
    return jsonb_build_object('ok', false, 'error', 'partner_id_required');
  end if;

  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'app_user_not_found');
  end if;

  select * into v_member
    from public.partner_members pm
   where pm.partner_id = p_partner_id
     and pm.user_id = v_user_id
     and pm.status = 'active';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_partner_member');
  end if;

  update public.partner_members
     set status = 'inactive',
         updated_at = now()
   where id = v_member.id;

  perform public.kami_admin_log_partner_audit_event(
    p_partner_id,
    'Partner Member Left',
    null,
    v_user_id,
    jsonb_build_object('status', 'active', 'member_id', v_member.id),
    jsonb_build_object('status', 'inactive', 'member_id', v_member.id),
    'Partner member left the program via the public portal.'
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_my_partner_referrals(uuid) from public;
grant execute on function public.get_my_partner_referrals(uuid) to authenticated;

revoke all on function public.get_my_partner_payout_history(uuid) from public;
grant execute on function public.get_my_partner_payout_history(uuid) to authenticated;

revoke all on function public.get_my_partner_change_ledger(uuid) from public;
grant execute on function public.get_my_partner_change_ledger(uuid) to authenticated;

revoke all on function public.get_my_partner_agreement_history(uuid) from public;
grant execute on function public.get_my_partner_agreement_history(uuid) to authenticated;

revoke all on function public.terminate_my_partner_participation(uuid, text) from public;
grant execute on function public.terminate_my_partner_participation(uuid, text) to authenticated;
