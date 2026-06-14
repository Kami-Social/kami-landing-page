import { escapeHtml, formatDateTime } from "./format.js";
import { renderUserIdentityCell } from "./venue-visitors.js?v=20260617k";

const PAGE_SIZE = 5;
const MAX_BODY_LENGTH = 200;
const WALL_IMAGE_BUCKET = "place-wall-images";
const SIGNED_URL_TTL_SEC = 60 * 60;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function formatRelativeTime(value) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 14) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return formatDateTime(value);
}

function wallErrorMessage(error) {
  const code = String(error || "").toLowerCase();
  if (code.includes("empty_post")) return "Write something or add a photo before posting.";
  if (code.includes("body_too_long")) return "Posts must be 200 characters or fewer.";
  if (code.includes("invalid_image_mime")) return "Use a JPG, PNG, or WebP image.";
  if (code.includes("image_too_large")) return "Images must be 5 MB or smaller.";
  if (code.includes("invalid_image")) return "Could not attach that image.";
  if (code.includes("image_not_found")) return "Image upload did not finish. Try again.";
  if (code.includes("venue_not_linked")) return "This venue is not linked to your partner account.";
  if (code.includes("not_partner_member")) return "You do not have access to this partner account.";
  return "Could not post to the venue wall.";
}

function extensionForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

async function readImageDimensions(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dims;
  }

  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("invalid_image"));
      img.src = url;
    });
    return dims;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadWallImage(supabase, appUserId, file) {
  const mime = String(file?.type || "").trim();
  if (!ALLOWED_IMAGE_MIME.has(mime)) throw new Error("invalid_image_mime");
  if (!file || file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("image_too_large");
  if (!appUserId) throw new Error("not_authenticated");

  const ext = extensionForMime(mime);
  const path = `${appUserId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(WALL_IMAGE_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(error.message || "image_upload_failed");

  const { width, height } = await readImageDimensions(file);
  return { path, width, height, mime };
}

async function signWallImageUrl(supabase, path) {
  const normalized = String(path || "").trim();
  if (!supabase || !normalized) return null;
  try {
    const { data, error } = await supabase.storage
      .from(WALL_IMAGE_BUCKET)
      .createSignedUrl(normalized, SIGNED_URL_TTL_SEC);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch (_e) {
    return null;
  }
}

async function enrichWallPosts(supabase, posts) {
  const list = Array.isArray(posts) ? posts : [];
  return Promise.all(
    list.map(async (post) => {
      const imagePath = post?.image?.path;
      if (!imagePath) return post;
      const signedUrl = await signWallImageUrl(supabase, imagePath);
      if (!signedUrl) return post;
      return {
        ...post,
        image: {
          ...(post.image || {}),
          url: signedUrl,
        },
      };
    })
  );
}

function renderWallImageZoomButton(imageUrl, { className = "venue-wall-post-image", label = "View photo" } = {}) {
  if (!imageUrl) return "";
  return `<button type="button" class="venue-wall-image-btn" data-wall-image-zoom="${escapeHtml(imageUrl)}" aria-label="${escapeHtml(label)}">
    <img class="${className}" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
  </button>`;
}

function openWallImageZoom({ showModal, imageUrl }) {
  if (!showModal || !imageUrl) return;
  showModal(
    "",
    `<div class="venue-wall-zoom"><img class="venue-wall-zoom-image" src="${escapeHtml(imageUrl)}" alt="" referrerpolicy="no-referrer" /></div>`
  );
}

function renderWallPostRow(post) {
  const author = post?.author || {};
  const user = {
    user_id: author.id,
    display_name: author.display_name,
    ig_handle: author.handle,
    avatar_url: author.avatar_url,
  };
  const body = String(post?.body || "").trim();
  const imageUrl = post?.image?.url || "";
  const imageHtml = imageUrl ? `<div class="venue-wall-post-media">${renderWallImageZoomButton(imageUrl)}</div>` : "";

  return `<article class="venue-wall-post">
    <div class="venue-wall-post-top">
      <div class="venue-wall-post-identity">
        ${renderUserIdentityCell(user)}
        ${body ? `<p class="venue-wall-post-body">${escapeHtml(body)}</p>` : ""}
      </div>
      <div class="venue-wall-post-meta">
        <time class="muted venue-wall-post-time" datetime="${escapeHtml(post.created_at || "")}">${escapeHtml(formatRelativeTime(post.created_at))}</time>
        ${imageHtml}
      </div>
    </div>
  </article>`;
}

function renderWallPanel({ placeId, posts, total, offset, draftBody, previewUrl, posting, postError }) {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + PAGE_SIZE, total);
  const remaining = Math.max(MAX_BODY_LENGTH - String(draftBody || "").length, 0);

  const rows =
    posts.length > 0
      ? posts.map(renderWallPostRow).join("")
      : `<div class="empty-state compact-empty"><p>No wall posts yet. Share an update with Kami users at this venue.</p></div>`;

  const previewHtml = previewUrl
    ? `<div class="venue-wall-compose-preview">${renderWallImageZoomButton(previewUrl, { className: "venue-wall-compose-preview-image", label: "Preview photo" })}<button type="button" class="btn secondary btn-sm venue-wall-clear-image">Remove</button></div>`
    : "";

  return `<div class="venue-wall" data-venue-wall="${escapeHtml(placeId)}">
    <div class="venue-wall-header">
      <div>
        <h4 class="venue-wall-title">Venue Wall</h4>
        <p class="muted venue-wall-lede">Posts appear on this venue's wall in the Kami app — same thread your guests see in person.</p>
      </div>
    </div>
    <form class="venue-wall-compose" data-venue-wall-form>
      <label class="venue-wall-compose-label" for="venue-wall-input-${escapeHtml(placeId)}">Post an update</label>
      <div class="venue-wall-compose-editor">
        <textarea
          id="venue-wall-input-${escapeHtml(placeId)}"
          class="venue-wall-input"
          rows="3"
          maxlength="${MAX_BODY_LENGTH}"
          placeholder="Share news, specials, or a welcome message…"
        >${escapeHtml(draftBody || "")}</textarea>
        ${previewHtml ? `<div class="venue-wall-compose-aside">${previewHtml}</div>` : ""}
      </div>
      <div class="venue-wall-compose-footer">
        <div class="venue-wall-compose-actions">
          <label class="btn secondary btn-sm venue-wall-photo-label">
            Add photo
            <input type="file" class="venue-wall-photo-input" accept="image/jpeg,image/png,image/webp" hidden />
          </label>
          <p class="muted venue-wall-char-count">${remaining} characters left</p>
        </div>
        ${postError ? `<p class="msg err venue-wall-error" role="alert">${escapeHtml(postError)}</p>` : ""}
        <button type="submit" class="btn btn-sm venue-wall-submit"${posting ? " disabled" : ""}>${posting ? "Posting…" : "Post"}</button>
      </div>
    </form>
    <div class="venue-wall-list">${rows}</div>
    <div class="venue-wall-footer">
      <p class="muted venue-wall-range">Showing ${start}–${end} of ${total}</p>
      <div class="venue-wall-pagination">
        <button type="button" class="btn secondary btn-sm venue-wall-prev" ${offset <= 0 ? "disabled" : ""}>Previous</button>
        <span class="venue-wall-page">Page ${page} of ${totalPages}</span>
        <button type="button" class="btn secondary btn-sm venue-wall-next" ${offset + PAGE_SIZE >= total ? "disabled" : ""}>Next</button>
      </div>
    </div>
  </div>`;
}

async function loadWallPosts(rpc, partnerId, placeId, { offset = 0 } = {}) {
  const payload = await rpc("get_my_partner_venue_wall_posts", {
    p_partner_id: partnerId,
    p_place_id: placeId,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  if (!payload?.ok) throw new Error(payload?.error || "wall_load_failed");
  return payload;
}

async function createWallPost(rpc, partnerId, placeId, { body, image }) {
  const payload = await rpc("kami_partner_create_venue_wall_post", {
    p_partner_id: partnerId,
    p_place_id: placeId,
    p_body: body || "",
    p_image_path: image?.path ?? null,
    p_image_width: image?.width ?? null,
    p_image_height: image?.height ?? null,
    p_image_mime_type: image?.mime ?? null,
  });
  if (!payload?.ok) throw new Error(payload?.error || "wall_post_failed");
  return payload;
}

function clearDraftImage(state) {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }
  state.draftFile = null;
  state.previewUrl = null;
}

function wireWallPanel(root, { rpc, supabase, partnerId, placeId, appUserId, state, refresh }) {
  const panel = root.querySelector(`[data-venue-wall="${placeId}"]`);
  if (!panel) return;

  const form = panel.querySelector("[data-venue-wall-form]");
  const input = panel.querySelector(".venue-wall-input");
  const fileInput = panel.querySelector(".venue-wall-photo-input");

  input?.addEventListener("input", () => {
    state.draftBody = input.value;
    const count = panel.querySelector(".venue-wall-char-count");
    if (count) {
      count.textContent = `${Math.max(MAX_BODY_LENGTH - input.value.length, 0)} characters left`;
    }
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;

    clearDraftImage(state);
    state.draftFile = file;
    state.previewUrl = URL.createObjectURL(file);
    state.postError = "";
    void refresh();
  });

  panel.querySelector(".venue-wall-clear-image")?.addEventListener("click", () => {
    clearDraftImage(state);
    state.postError = "";
    void refresh();
  });

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const body = input?.value?.trim() || "";
    const hasImage = state.draftFile instanceof File;
    if ((!body && !hasImage) || state.posting) return;

    state.posting = true;
    state.postError = "";
    await refresh();

    try {
      let image = null;
      if (hasImage) {
        image = await uploadWallImage(supabase, appUserId, state.draftFile);
      }
      await createWallPost(rpc, partnerId, placeId, { body, image });
      state.draftBody = "";
      clearDraftImage(state);
      state.offset = 0;
      state.postError = "";
    } catch (e) {
      state.postError = wallErrorMessage(e?.message);
    } finally {
      state.posting = false;
      await refresh();
    }
  });

  panel.querySelector(".venue-wall-prev")?.addEventListener("click", () => {
    if (state.offset <= 0) return;
    state.offset = Math.max(0, state.offset - PAGE_SIZE);
    void refresh();
  });

  panel.querySelector(".venue-wall-next")?.addEventListener("click", () => {
    if (state.offset + PAGE_SIZE >= state.total) return;
    state.offset += PAGE_SIZE;
    void refresh();
  });
}

export async function mountVenueWall({ rpc, supabase, partnerId, placeId, appUserId, container, showModal }) {
  if (!container || !placeId || !partnerId) return;

  const state = {
    offset: 0,
    total: 0,
    draftBody: "",
    draftFile: null,
    previewUrl: null,
    posting: false,
    postError: "",
  };

  if (!container.dataset.wallZoomWired) {
    container.dataset.wallZoomWired = "1";
    container.addEventListener("click", (ev) => {
      const zoomBtn = ev.target.closest("[data-wall-image-zoom]");
      if (!zoomBtn || !showModal) return;
      ev.preventDefault();
      openWallImageZoom({
        showModal,
        imageUrl: zoomBtn.getAttribute("data-wall-image-zoom") || "",
      });
    });
  }

  async function refresh() {
    container.innerHTML = `<p class="muted venue-card-empty">Loading wall…</p>`;
    try {
      const payload = await loadWallPosts(rpc, partnerId, placeId, { offset: state.offset });
      const posts = await enrichWallPosts(supabase, payload.posts || []);
      state.total = Number(payload.total_count || 0);
      container.innerHTML = renderWallPanel({
        placeId,
        posts,
        total: state.total,
        offset: state.offset,
        draftBody: state.draftBody,
        previewUrl: state.previewUrl,
        posting: state.posting,
        postError: state.postError,
      });
      wireWallPanel(container, { rpc, supabase, partnerId, placeId, appUserId, state, refresh });
    } catch (_e) {
      container.innerHTML = `<p class="muted venue-card-empty">Could not load venue wall.</p>`;
    }
  }

  await refresh();
}

export function wireAllVenueWalls({ rpc, supabase, partnerId, appUserId, root, showModal }) {
  if (!root || !partnerId) return;
  root.querySelectorAll("[data-venue-wall]").forEach((slot) => {
    const placeId = slot.getAttribute("data-venue-wall");
    if (!placeId) return;
    void mountVenueWall({ rpc, supabase, partnerId, placeId, appUserId, container: slot, showModal });
  });
}
