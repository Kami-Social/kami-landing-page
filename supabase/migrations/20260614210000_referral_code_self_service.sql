-- Self-service referral code edit for ambassador and partner portals.

create or replace function public.check_my_referral_code_availability(
  p_code text,
  p_partner_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_normalized text;
  v_existing public.promotion_links%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('available', false, 'reason', 'not_authenticated');
  end if;

  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('available', false, 'reason', 'app_user_not_found');
  end if;

  v_normalized := public.kami_admin_normalize_referral_code(p_code);

  if v_normalized = '' then
    return jsonb_build_object(
      'available', false,
      'normalized_code', v_normalized,
      'reason', 'required'
    );
  end if;

  if v_normalized !~ '^[a-z0-9][a-z0-9_-]{2,48}$' then
    return jsonb_build_object(
      'available', false,
      'normalized_code', v_normalized,
      'reason', 'invalid_format'
    );
  end if;

  if p_partner_id is not null then
    if not exists (
      select 1
        from public.partner_members pm
        join public.partners p on p.id = pm.partner_id
       where pm.partner_id = p_partner_id
         and pm.user_id = v_user_id
         and pm.status = 'active'
         and p.status in ('pending', 'active', 'suspended')
    ) then
      return jsonb_build_object('available', false, 'reason', 'not_partner_member');
    end if;

    select *
      into v_existing
      from public.promotion_links
     where code = v_normalized
     limit 1;

    if not found then
      return jsonb_build_object(
        'available', true,
        'normalized_code', v_normalized,
        'reason', 'available'
      );
    end if;

    if v_existing.partner_id = p_partner_id and v_existing.link_type = 'partner_referral' then
      return jsonb_build_object(
        'available', true,
        'normalized_code', v_normalized,
        'reason', 'available'
      );
    end if;

    return jsonb_build_object(
      'available', false,
      'normalized_code', v_normalized,
      'reason', 'already_in_use'
    );
  end if;

  if not exists (
    select 1
      from public.ambassador_profiles ap
     where ap.user_id = v_user_id
       and ap.program_status = 'active'
  ) then
    return jsonb_build_object('available', false, 'reason', 'not_ambassador');
  end if;

  select *
    into v_existing
    from public.promotion_links
   where code = v_normalized
   limit 1;

  if not found then
    return jsonb_build_object(
      'available', true,
      'normalized_code', v_normalized,
      'reason', 'available'
    );
  end if;

  if v_existing.owner_user_id = v_user_id and v_existing.link_type = 'user_referral' then
    return jsonb_build_object(
      'available', true,
      'normalized_code', v_normalized,
      'reason', 'available'
    );
  end if;

  return jsonb_build_object(
    'available', false,
    'normalized_code', v_normalized,
    'reason', 'already_in_use'
  );
end;
$$;

create or replace function public.update_my_referral_code(
  p_new_code text,
  p_partner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_normalized text;
  v_availability jsonb;
  v_current_link public.promotion_links%rowtype;
  v_conflict public.promotion_links%rowtype;
  v_new_link public.promotion_links%rowtype;
  v_owner_user_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_user_id := public.kami_resolve_auth_app_user_id();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'app_user_not_found');
  end if;

  v_availability := public.check_my_referral_code_availability(p_new_code, p_partner_id);
  if coalesce(v_availability->>'available', 'false') <> 'true' then
    return jsonb_build_object(
      'ok', false,
      'error', coalesce(v_availability->>'reason', 'unavailable')
    );
  end if;

  v_normalized := v_availability->>'normalized_code';

  if p_partner_id is not null then
    select *
      into v_current_link
      from public.promotion_links
     where partner_id = p_partner_id
       and link_type = 'partner_referral'
       and status in ('active', 'paused', 'draft')
     order by case status when 'active' then 0 when 'paused' then 1 else 2 end, created_at asc
     limit 1
     for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'referral_link_not_found');
    end if;

    v_owner_user_id := coalesce(v_current_link.owner_user_id, v_user_id);

    if lower(v_current_link.code) = v_normalized then
      return jsonb_build_object(
        'ok', true,
        'code', v_normalized,
        'link', 'https://www.kamisocial.com/invite/' || v_normalized,
        'promotion_link_id', v_current_link.id,
        'unchanged', true
      );
    end if;

    select *
      into v_conflict
      from public.promotion_links
     where code = v_normalized
     limit 1
     for update;

    if found and v_conflict.id <> v_current_link.id then
      return jsonb_build_object('ok', false, 'error', 'already_in_use');
    end if;

    update public.promotion_links
       set status = 'disabled',
           updated_at = now()
     where id = v_current_link.id;

    insert into public.promotion_links (
      code,
      link_type,
      owner_user_id,
      partner_id,
      status,
      metadata
    )
    values (
      v_normalized,
      'partner_referral',
      v_owner_user_id,
      p_partner_id,
      'active',
      jsonb_build_object('owner_type', 'partner', 'self_updated', true)
    )
    returning * into v_new_link;

    return jsonb_build_object(
      'ok', true,
      'code', v_new_link.code,
      'link', 'https://www.kamisocial.com/invite/' || v_new_link.code,
      'promotion_link_id', v_new_link.id,
      'previous_promotion_link_id', v_current_link.id,
      'unchanged', false
    );
  end if;

  if not exists (
    select 1
      from public.ambassador_profiles ap
     where ap.user_id = v_user_id
       and ap.program_status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_ambassador');
  end if;

  select *
    into v_current_link
    from public.promotion_links
   where owner_user_id = v_user_id
     and link_type = 'user_referral'
     and status in ('active', 'paused', 'draft')
   order by case status when 'active' then 0 when 'paused' then 1 else 2 end, created_at asc
   limit 1
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'referral_link_not_found');
  end if;

  if lower(v_current_link.code) = v_normalized then
    return jsonb_build_object(
      'ok', true,
      'code', v_normalized,
      'link', 'https://www.kamisocial.com/invite/' || v_normalized,
      'promotion_link_id', v_current_link.id,
      'unchanged', true
    );
  end if;

  select *
    into v_conflict
    from public.promotion_links
   where code = v_normalized
   limit 1
   for update;

  if found and v_conflict.id <> v_current_link.id then
    return jsonb_build_object('ok', false, 'error', 'already_in_use');
  end if;

  update public.promotion_links
     set status = 'disabled',
         updated_at = now()
   where id = v_current_link.id;

  insert into public.promotion_links (
    code,
    link_type,
    owner_user_id,
    status,
    metadata
  )
  values (
    v_normalized,
    'user_referral',
    v_user_id,
    'active',
    jsonb_build_object('owner_type', 'user', 'self_updated', true)
  )
  returning * into v_new_link;

  return jsonb_build_object(
    'ok', true,
    'code', v_new_link.code,
    'link', 'https://www.kamisocial.com/invite/' || v_new_link.code,
    'promotion_link_id', v_new_link.id,
    'previous_promotion_link_id', v_current_link.id,
    'unchanged', false
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'already_in_use');
end;
$$;

revoke all on function public.check_my_referral_code_availability(text, uuid) from public;
grant execute on function public.check_my_referral_code_availability(text, uuid) to authenticated;

revoke all on function public.update_my_referral_code(text, uuid) from public;
grant execute on function public.update_my_referral_code(text, uuid) to authenticated;
