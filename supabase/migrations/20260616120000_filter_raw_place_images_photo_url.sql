-- Do not emit raw authenticated place-images object URLs as photo_url (400 in browser).

create or replace function public.kami_resolve_place_photo_url(p_place_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(trim(pl.photo_url), '') is not null
     and trim(pl.photo_url) !~* '/object/(public|sign)/place-images/'
     and trim(pl.photo_url) !~* '/object/place-images/'
     and trim(pl.photo_url) !~* '/storage/v1/object/place-images/'
    then nullif(trim(pl.photo_url), '')
    else null
  end
  from public.places pl
  where pl.id = p_place_id;
$$;
