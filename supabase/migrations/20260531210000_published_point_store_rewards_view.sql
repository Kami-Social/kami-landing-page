-- Public-safe published rewards view for optional anon/RPC access.
-- The marketing site also reads via /api/published-store-rewards (service role).

create or replace view public.published_point_store_rewards as
select
  id,
  title,
  subtitle,
  short_description,
  description,
  terms,
  points_cost,
  reward_type,
  fulfillment_type,
  partner_name,
  partner_website_url,
  image_url,
  image_path,
  image_source,
  category,
  city,
  quantity_remaining,
  quantity_total,
  starts_at,
  ends_at,
  is_featured,
  sort_order,
  created_at,
  updated_at
from public.point_store_rewards
where status = 'published'
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now());

grant select on public.published_point_store_rewards to anon, authenticated;
