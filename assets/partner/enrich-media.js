import { parsePlaceImagesPath, pickUsablePhotoUrl } from "./media.js";
import { partnerMediaDebug } from "./media-debug.js";
import { signVenuePhotoUrls } from "./place-photos.js?v=20260615d";

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

    let payload = null;
    try {
      payload = await response.json();
    } catch (_e) {
      payload = null;
    }

    if (!response.ok) {
      partnerMediaDebug("media-urls.api.error", {
        status: response.status,
        ok: false,
        error: payload?.error || "http_error",
      });
      return null;
    }

    partnerMediaDebug("media-urls.api.ok", {
      status: response.status,
      ok: payload?.ok,
      error: payload?.error,
      venueKeys: payload?.venues ? Object.keys(payload.venues) : [],
      eventKeys: payload?.events ? Object.keys(payload.events) : [],
      venueUrls: payload?.venues || {},
    });

    return payload?.ok ? payload : null;
  } catch (e) {
    partnerMediaDebug("media-urls.api.error", {
      ok: false,
      error: e?.name === "AbortError" ? "timeout" : e?.message || String(e),
    });
    return null;
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

  for (const venue of dashboard.venues || []) {
    partnerMediaDebug("enrichPartnerMedia.venue.input", {
      place_id: venue.place_id,
      name: venue.name,
      photo_url: venue.photo_url,
      photo_storage_bucket: venue.photo_storage_bucket,
      photo_storage_path: venue.photo_storage_path,
      parsed_path: parsePlaceImagesPath(venue.photo_url),
    });
  }

  try {
    const [venueUrls, apiPayload] = await Promise.all([
      signVenuePhotoUrls(supabase, partnerId, dashboard.venues),
      fetchMediaUrlsFromApi(supabase, partnerId, eventsPayload),
    ]);

    partnerMediaDebug("enrichPartnerMedia.clientSign", { venueUrls });

    const mergedVenueUrls = {
      ...venueUrls,
      ...(apiPayload?.venues || {}),
    };
    const eventUrls = apiPayload?.events || {};

    const enrichedDashboard = {
      ...dashboard,
      venues: (dashboard.venues || []).map((venue) => {
        const signed =
          mergedVenueUrls[venue.place_id] ||
          pickUsablePhotoUrl(venueUrls[venue.place_id]) ||
          pickUsablePhotoUrl(apiPayload?.venues?.[venue.place_id]) ||
          null;
        partnerMediaDebug("enrichPartnerMedia.venue.merge", {
          place_id: venue.place_id,
          original_photo_url: venue.photo_url,
          client_signed: venueUrls[venue.place_id] || null,
          api_signed: apiPayload?.venues?.[venue.place_id] || null,
          final_photo_url: signed,
        });
        return {
          ...venue,
          photo_url: signed,
        };
      }),
    };

    return {
      dashboard: enrichedDashboard,
      eventsPayload: {
        ...eventsPayload,
        events: (eventsPayload?.events || []).map((event) => {
          const signed = eventUrls[event.event_id];
          const placeSigned = event.place_id ? mergedVenueUrls[event.place_id] : null;
          const url =
            pickUsablePhotoUrl(signed) ||
            pickUsablePhotoUrl(placeSigned) ||
            pickUsablePhotoUrl(event.display_image_url || event.image_url) ||
            null;
          return url
            ? {
                ...event,
                display_image_url: url,
                image_url: url,
                place_photo_url: pickUsablePhotoUrl(placeSigned) || null,
              }
            : event;
        }),
      },
    };
  } catch (e) {
    partnerMediaDebug("enrichPartnerMedia.error", { message: e?.message || String(e) });
    return { dashboard, eventsPayload };
  }
}
