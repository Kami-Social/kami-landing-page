-- Partner members must read approved place_images rows so storage.objects RLS
-- (place-images bucket) can evaluate linked-venue access for createSignedUrl.

create policy "Partner members read linked approved place images"
  on public.place_images
  for select
  to authenticated
  using (
    status = 'approved'
    and exists (
      select 1
        from public.partner_venues pv
        join public.partner_members pm
          on pm.partner_id = pv.partner_id
         and pm.status = 'active'
        join public.users u
          on u.id = pm.user_id
         and u.auth_user_id = auth.uid()
         and u.is_removed = false
       where pv.place_id = place_images.place_id
         and pv.status = 'active'
    )
  );
