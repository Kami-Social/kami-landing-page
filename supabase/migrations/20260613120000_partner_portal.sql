-- Partner portal: self-service RPCs, program settings copy, forgot-password check.

update public.partner_program_settings
   set qualification_requirements = coalesce(
         nullif(trim(qualification_requirements), ''),
         'Referred users must create a Kami account using your partner referral link, complete onboarding, and meet Kami''s active-user criteria (non-test account, not removed, in good standing). Qualification is determined when Kami verifies the referral.'
       ),
       compensation_rate = coalesce(
         nullif(trim(compensation_rate), ''),
         'Compensation rates are shown in your Partner Portal and may vary by partner agreement. Contact partners@kamisocial.com with questions about your rate.'
       ),
       payout_schedule = coalesce(
         nullif(trim(payout_schedule), ''),
         'Payouts are processed periodically for approved balances that meet the payout threshold shown in your Partner Portal, unless otherwise noted in your agreement.'
       ),
       last_updated = now()
 where is_active = true;

create or replace function public.kami_build_partner_program_parameters(p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.partner_program_settings%rowtype;
  v_partner public.partners%rowtype;
  v_rate_text text;
  v_threshold_cents integer;
begin
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
    'last_updated', coalesce(v_settings.last_updated, now())
  );
end;
$$;

revoke all on function public.kami_build_partner_program_parameters(uuid) from public;
grant execute on function public.kami_build_partner_program_parameters(uuid) to authenticated;

create or replace function public.get_my_partner_memberships()
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

  select coalesce(jsonb_agg(row order by row->>'display_name'), '[]'::jsonb)
    into v_rows
    from (
      select jsonb_build_object(
        'partner_id', p.id,
        'display_name', p.display_name,
        'status', p.status,
        'partner_type', p.partner_type,
        'member_role', pm.role,
        'joined_at', pm.created_at
      ) as row
        from public.partner_members pm
        join public.partners p on p.id = pm.partner_id
       where pm.user_id = v_user_id
         and pm.status = 'active'
         and p.status in ('pending', 'active', 'suspended')
       order by p.display_name
    ) q;

  return jsonb_build_object('ok', true, 'memberships', coalesce(v_rows, '[]'::jsonb));
end;
$$;

revoke all on function public.get_my_partner_memberships() from public;
grant execute on function public.get_my_partner_memberships() to authenticated;

create or replace function public.get_my_partner_agreement_status(p_partner_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_partner_id uuid;
  v_member public.partner_members%rowtype;
  v_partner public.partners%rowtype;
  v_settings public.partner_program_settings%rowtype;
  v_current_version text;
  v_has_acceptance boolean;
  v_program_parameters jsonb;
  v_memberships jsonb;
begin
  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_memberships := public.get_my_partner_memberships();
  if coalesce(jsonb_array_length(v_memberships->'memberships'), 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'state', 'not_partner',
      'memberships', '[]'::jsonb
    );
  end if;

  v_partner_id := p_partner_id;
  if v_partner_id is null then
    select (m->>'partner_id')::uuid
      into v_partner_id
      from jsonb_array_elements(v_memberships->'memberships') m
     limit 1;
  end if;

  select * into v_member
    from public.partner_members pm
   where pm.partner_id = v_partner_id
     and pm.user_id = v_user_id
     and pm.status = 'active';

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'not_partner_member',
      'memberships', v_memberships->'memberships'
    );
  end if;

  select * into v_partner from public.partners where id = v_partner_id;
  select * into v_settings from public.partner_program_settings where is_active = true order by last_updated desc limit 1;
  v_current_version := coalesce(v_settings.current_agreement_version, 'partner_terms_v1');
  v_program_parameters := public.kami_build_partner_program_parameters(v_partner_id);

  select exists (
    select 1
      from public.partner_agreement_acceptances aa
     where aa.member_user_id = v_user_id
       and aa.partner_id = v_partner_id
       and aa.agreement_version = v_current_version
  )
    into v_has_acceptance;

  if not v_has_acceptance then
    return jsonb_build_object(
      'ok', true,
      'state', 'agreement_required',
      'partner_id', v_partner_id,
      'current_agreement_version', v_current_version,
      'program_parameters', v_program_parameters,
      'memberships', v_memberships->'memberships',
      'partner', jsonb_build_object(
        'display_name', v_partner.display_name,
        'status', v_partner.status,
        'agreement_status', v_member.agreement_status
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'state', 'dashboard',
    'partner_id', v_partner_id,
    'current_agreement_version', v_current_version,
    'program_parameters', v_program_parameters,
    'memberships', v_memberships->'memberships'
  );
end;
$$;

revoke all on function public.get_my_partner_agreement_status(uuid) from public;
grant execute on function public.get_my_partner_agreement_status(uuid) to authenticated;

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
        'photo_url', pl.photo_url,
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
    v_status_label := 'Pending';
  elsif v_partner.status = 'suspended' then
    v_status_label := 'Suspended';
  else
    v_status_label := initcap(replace(v_partner.status, '_', ' '));
  end if;

  return jsonb_build_object(
    'ok', true,
    'header', jsonb_build_object(
      'partner_id', v_partner.id,
      'display_name', v_partner.display_name,
      'status', v_partner.status,
      'status_label', v_status_label,
      'contact_email', coalesce(v_partner.contact_email, ''),
      'joined_at', v_member.created_at,
      'member_role', v_member.role
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
    'program', jsonb_build_object(
      'program_parameters', public.kami_build_partner_program_parameters(p_partner_id),
      'agreement_status', coalesce(v_member.agreement_status, v_partner.agreement_status),
      'agreement_version', v_member.agreement_version,
      'agreement_signed_at', v_member.agreement_signed_at,
      'current_agreement_version', v_current_version
    )
  );
end;
$$;

revoke all on function public.get_my_partner_dashboard(uuid) from public;
grant execute on function public.get_my_partner_dashboard(uuid) to authenticated;

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
          'place_city', p.city
        ) as row,
        e.starts_at
        from public.partner_venues pv
        join public.places p on p.id = pv.place_id
        join public.events e on e.place_id = p.id
       where pv.partner_id = p_partner_id
         and pv.status = 'active'
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

revoke all on function public.get_my_partner_events(uuid) from public;
grant execute on function public.get_my_partner_events(uuid) to authenticated;

create or replace function public.kami_partner_forgot_password_check(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
  v_user public.users%rowtype;
  v_member_count integer;
begin
  v_email := lower(trim(p_email));

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'invalid_email',
      'message', 'Enter a valid email address.'
    );
  end if;

  select *
    into v_user
    from public.users
   where lower(auth_email) = v_email
   limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', 'email_not_found',
      'message', 'No Kami account was found for that email address.'
    );
  end if;

  select count(*)::integer
    into v_member_count
    from public.partner_members pm
    join public.partners p on p.id = pm.partner_id
   where pm.user_id = v_user.id
     and pm.status = 'active'
     and p.status in ('pending', 'active', 'suspended');

  if v_member_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'not_partner',
      'message',
      'That email is registered with Kami, but it is not linked to a partner account. Contact partners@kamisocial.com if you believe this is an error.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'can_reset',
    'email', v_user.auth_email
  );
end;
$$;

revoke all on function public.kami_partner_forgot_password_check(text) from public;
grant execute on function public.kami_partner_forgot_password_check(text) to anon, authenticated;
