-- Partner portal: read and post to linked venue walls (same place_wall_posts as the Kami app).

create or replace function public.get_my_partner_venue_wall_posts(
  p_partner_id uuid,
  p_place_id uuid,
  p_limit integer default 5,
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
  v_payload jsonb;
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

  v_payload := public.kami_list_place_wall_posts(p_place_id, p_limit, p_offset);

  return jsonb_build_object('ok', true) || coalesce(v_payload, '{}'::jsonb);
end;
$$;

create or replace function public.kami_partner_create_venue_wall_post(
  p_partner_id uuid,
  p_place_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_trimmed text;
  v_post_id uuid;
  v_row record;
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
      join public.places pl on pl.id = pv.place_id
     where pv.partner_id = p_partner_id
       and pv.place_id = p_place_id
       and pv.status = 'active'
       and pl.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'venue_not_linked');
  end if;

  v_trimmed := trim(both from coalesce(p_body, ''));
  if v_trimmed = '' then
    return jsonb_build_object('ok', false, 'error', 'empty_post');
  end if;

  if char_length(v_trimmed) > 200 then
    return jsonb_build_object('ok', false, 'error', 'body_too_long');
  end if;

  insert into public.place_wall_posts (
    place_id,
    user_id,
    body,
    moderation_status
  )
  values (
    p_place_id,
    v_user_id,
    v_trimmed,
    'visible'
  )
  returning id into v_post_id;

  perform public.kami_arm_wall_next_post_notification(
    v_user_id,
    'place',
    p_place_id,
    v_post_id
  );

  select
    w.id,
    w.place_id,
    w.body,
    w.created_at,
    w.image_path,
    w.image_width,
    w.image_height,
    w.image_mime_type,
    u.id as author_user_id,
    coalesce(nullif(trim(up.display_name), ''), nullif(trim(up.username), ''), u.ig_handle) as author_display_name,
    coalesce(nullif(trim(up.username), ''), u.ig_handle) as author_handle,
    up.avatar_url as author_avatar_url
  into v_row
  from public.place_wall_posts w
  join public.users u on u.id = w.user_id
  left join public.user_profiles up on up.user_id = u.id
  where w.id = v_post_id;

  return jsonb_build_object(
    'ok', true,
    'post', jsonb_build_object(
      'id', v_row.id,
      'place_id', v_row.place_id,
      'body', v_row.body,
      'created_at', v_row.created_at,
      'image', public.kami_place_wall_post_image_json(
        v_row.image_path,
        v_row.image_width,
        v_row.image_height,
        v_row.image_mime_type
      ),
      'author', jsonb_build_object(
        'id', v_row.author_user_id,
        'display_name', v_row.author_display_name,
        'handle', v_row.author_handle,
        'avatar_url', v_row.author_avatar_url
      )
    )
  );
end;
$$;

revoke all on function public.get_my_partner_venue_wall_posts(uuid, uuid, integer, integer) from public;
grant execute on function public.get_my_partner_venue_wall_posts(uuid, uuid, integer, integer) to authenticated;

revoke all on function public.kami_partner_create_venue_wall_post(uuid, uuid, text) from public;
grant execute on function public.kami_partner_create_venue_wall_post(uuid, uuid, text) to authenticated;
