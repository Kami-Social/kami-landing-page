-- Include partner member display identity on agreement-required status responses.

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
  v_display_name text;
  v_avatar_url text;
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

  select coalesce(up.display_name, up.username, v_partner.display_name, 'Partner'),
         up.avatar_url
    into v_display_name, v_avatar_url
    from public.user_profiles up
   where up.user_id = v_user_id
   order by up.updated_at desc nulls last
   limit 1;

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
        'display_name', coalesce(v_partner.display_name, v_display_name, 'Partner'),
        'avatar_url', v_avatar_url,
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
