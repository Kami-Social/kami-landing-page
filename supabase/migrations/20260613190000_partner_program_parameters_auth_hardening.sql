-- Harden kami_build_partner_program_parameters: revoke anon, require authenticated partner membership.

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
    'last_updated', coalesce(v_settings.last_updated, now())
  );
end;
$$;

revoke all on function public.kami_build_partner_program_parameters(uuid) from public;
revoke all on function public.kami_build_partner_program_parameters(uuid) from anon;
grant execute on function public.kami_build_partner_program_parameters(uuid) to authenticated;
