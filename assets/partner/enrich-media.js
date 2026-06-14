import { parsePlaceImagesPath, pickUsablePhotoUrl } from "./media.js";
import { signVenuePhotoUrls } from "./place-photos.js?v=20260615c";

const MEDIA_FETCH_MS = 8000;

async function fetchMediaUrlsFromApi(supabase, partnerId, eventsPayload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MEDIA_FETCH_MS);

  try {
    const response = await fetch("/api/partner/media-urls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify({
        partner_id: partnerId,
        events: (eventsPayload?.events || []).map((event) => ({
          event_id: event.event_id,
          place_id: event.place_id,
          image_url: event.image_url,
          display_image_url: event.display_image_url,
          place_photo_url: event.place_photo_url,
        })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.ok ? payload : null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Resolve signed media URLs for partner venues/events (place-images bucket is private).
 */
export async function enrichPartnerMedia(supabase, partnerId, dashboard, eventsPayload) {
  if (!supabase || !partnerId || !dashboard?.ok) {
    return { dashboard, eventsPayload };
  }

  try {
    const [venueUrls, apiPayload] = await Promise.all([
      signVenuePhotoUrls(supabase, partnerId, dashboard.venues),
      fetchMediaUrlsFromApi(supabase, partnerId, eventsPayload),
    ]);

    const mergedVenueUrls = {
      ...venueUrls,
      ...(apiPayload?.venues || {}),
    };
    const eventUrls = apiPayload?.events || {};

    return {
      dashboard: {
        ...dashboard,
        venues: (dashboard.venues || []).map((venue) => ({
          ...venue,
          photo_url: mergedVenueUrls[venue.place_id] || pickUsablePhotoUrl(venue.photo_url) || null,
        })),
      },
      eventsPayload: {
        ...eventsPayload,
        events: (eventsPayload?.events || []).map((event) => {
          const signed = eventUrls[event.event_id];
          const placeSigned = event.place_id ? mergedVenueUrls[event.place_id] : null;
          const url = signed || placeSigned || pickUsablePhotoUrl(event.display_image_url || event.image_url);
          return url
            ? {
                ...event,
                display_image_url: url,
                image_url: url,
                place_photo_url: placeSigned || event.place_photo_url,
              }
            : event;
        }),
      },
    };
  } catch (_e) {
    return { dashboard, eventsPayload };
  }
}
