import { escapeHtml } from "../ambassador/format.js";

const INVITE_BASE = "https://www.kamisocial.com/invite/";

const ERROR_MESSAGES = {
  required: "Enter a referral code.",
  invalid_format:
    "Use 3–49 characters: lowercase letters, numbers, hyphens, or underscores. Must start with a letter or number.",
  already_in_use: "That code is already taken. Try another.",
  referral_link_not_found: "No referral link found for this account.",
  not_authenticated: "Please sign in again and retry.",
  not_ambassador: "Your ambassador account is not active.",
  not_partner_member: "You do not have access to this partner account.",
  unavailable: "That code is not available.",
};

function errorMessage(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || "Could not update referral code.";
}

function applyReferralCodeToDom(code) {
  const link = `${INVITE_BASE}${code}`;
  const codeEl = document.getElementById("ref-code");
  const linkEl = document.getElementById("ref-link");
  if (codeEl) codeEl.textContent = code;
  if (linkEl) {
    if (linkEl.tagName === "A") {
      linkEl.href = link;
      linkEl.textContent = link;
    } else {
      linkEl.textContent = link;
    }
  }
}

/**
 * @param {object} opts
 * @param {(name: string, params?: object) => Promise<any>} opts.rpc
 * @param {(title: string, bodyHtml: string) => void} opts.showModal
 * @param {() => void} opts.hideModal
 * @param {string} [opts.currentCode]
 * @param {string|null} [opts.partnerId]
 * @param {(payload: { code: string, link: string }) => void} [opts.onUpdated]
 */
export function wireEditReferralCode({
  rpc,
  showModal,
  hideModal,
  currentCode = "",
  partnerId = null,
  onUpdated,
}) {
  document.getElementById("edit-code")?.addEventListener("click", () => {
    showModal(
      "Edit Referral Code",
      `<p class="muted">Choose a custom code for your invite link. Codes use lowercase letters, numbers, hyphens, or underscores (3–49 characters).</p>
       <label for="edit-code-input">New referral code</label>
       <input id="edit-code-input" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(currentCode)}" />
       <div id="edit-code-error" class="msg err" hidden role="alert"></div>
       <div class="btn-row">
         <button type="button" class="btn" id="edit-code-save">Save Code</button>
         <button type="button" class="btn secondary" id="edit-code-cancel">Cancel</button>
       </div>`
    );

    const input = document.getElementById("edit-code-input");
    const save = document.getElementById("edit-code-save");
    const cancel = document.getElementById("edit-code-cancel");
    const err = document.getElementById("edit-code-error");

    cancel?.addEventListener("click", hideModal);
    input?.focus();
    input?.select();

    save?.addEventListener("click", async () => {
      const raw = input?.value.trim() || "";
      if (err) err.hidden = true;
      if (save) save.disabled = true;

      const params = { p_new_code: raw };
      if (partnerId) params.p_partner_id = partnerId;

      try {
        const payload = await rpc("update_my_referral_code", params);
        if (!payload?.ok) {
          if (err) {
            err.textContent = errorMessage(payload?.error, payload?.message);
            err.hidden = false;
          }
          if (save) save.disabled = false;
          return;
        }

        const code = String(payload.code || "").trim();
        const link = String(payload.link || `${INVITE_BASE}${code}`).trim();
        applyReferralCodeToDom(code);
        hideModal();
        onUpdated?.({ code, link });
      } catch (e) {
        if (err) {
          err.textContent = e?.message || "Could not update referral code.";
          err.hidden = false;
        }
        if (save) save.disabled = false;
      }
    });
  });
}
