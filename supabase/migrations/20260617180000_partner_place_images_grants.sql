-- RLS policies on place_images require base SELECT for authenticated (storage signing subquery).

grant select on public.place_images to authenticated;
