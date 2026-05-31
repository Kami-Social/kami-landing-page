/**
 * Public catalog of published Point Store rewards for kamisocial.com/store.
 * Uses the service role server-side; returns only public-safe fields.
 */
const { createClient } = require("@supabase/supabase-js");

const PUBLIC_SELECT =
  "id,title,subtitle,short_description,description,terms,points_cost,reward_type,fulfillment_type,partner_name,partner_website_url,image_url,image_path,image_source,category,city,quantity_remaining,quantity_total,starts_at,ends_at,is_featured,sort_order,created_at";

const STORAGE_BUCKET = "point-store-images";

function pickSupabaseUrl() {
  const u =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bscnpilzmilzabagnypx.supabase.co";
  return String(u).trim().replace(/\/$/, "");
}

function resolveImageUrl(reward, supabaseUrl) {
  const direct = typeof reward.image_url === "string" ? reward.image_url.trim() : "";
  if (direct) return direct;

  const path = typeof reward.image_path === "string" ? reward.image_path.trim().replace(/^\//, "") : "";
  if (!path) return null;

  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

function isWithinSchedule(reward, nowMs) {
  if (reward.starts_at) {
    const startsMs = Date.parse(reward.starts_at);
    if (!Number.isNaN(startsMs) && startsMs > nowMs) return false;
  }
  if (reward.ends_at) {
    const endsMs = Date.parse(reward.ends_at);
    if (!Number.isNaN(endsMs) && endsMs < nowMs) return false;
  }
  return true;
}

function toPublicReward(reward, supabaseUrl) {
  return {
    id: reward.id,
    title: reward.title,
    subtitle: reward.subtitle,
    short_description: reward.short_description,
    description: reward.description,
    terms: reward.terms,
    points_cost: reward.points_cost,
    reward_type: reward.reward_type,
    fulfillment_type: reward.fulfillment_type,
    partner_name: reward.partner_name,
    partner_website_url: reward.partner_website_url,
    image_url: resolveImageUrl(reward, supabaseUrl),
    image_source: reward.image_source,
    category: reward.category,
    city: reward.city,
    quantity_remaining: reward.quantity_remaining,
    quantity_total: reward.quantity_total,
    starts_at: reward.starts_at,
    ends_at: reward.ends_at,
    is_featured: reward.is_featured,
    sort_order: reward.sort_order,
    created_at: reward.created_at,
  };
}

module.exports = async function publishedStoreRewards(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!serviceKey) {
    res.status(503).json({ error: "Store catalog is not configured.", rewards: [] });
    return;
  }

  const supabaseUrl = pickSupabaseUrl();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("point_store_rewards")
    .select(PUBLIC_SELECT)
    .eq("status", "published")
    .order("points_cost", { ascending: true });

  if (error) {
    res.status(500).json({ error: "Could not load rewards.", rewards: [] });
    return;
  }

  const nowMs = Date.now();
  const rewards = (data || [])
    .filter((row) => isWithinSchedule(row, nowMs))
    .map((row) => toPublicReward(row, supabaseUrl));

  res.status(200).json({ rewards });
};
