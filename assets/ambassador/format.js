export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatMoney(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents) / 100);
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatAgreementVersionLabel(version) {
  const raw = String(version || "").trim();
  if (!raw) return "—";
  const minorMatch = raw.match(/v(\d+)_(\d+)/i);
  if (minorMatch) return `Version ${minorMatch[1]}.${minorMatch[2]}`;
  const match = raw.match(/v(\d+)/i);
  if (match) return `Version ${match[1]}.0`;
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function humanizeScalar(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseLedgerObject(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed === "object" ? parsed : null;
      } catch (_e) {
        return null;
      }
    }
  }
  return null;
}

function humanizeLedgerKey(key) {
  return humanizeKey(String(key || "").replace(/_cents$/i, ""));
}

function formatLedgerFieldValue(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (/_cents$/i.test(String(key)) && (typeof value === "number" || /^-?\d+$/.test(String(value)))) {
    return formatMoney(value);
  }
  return humanizeScalar(value);
}

function formatRateTiers(tiers) {
  if (!Array.isArray(tiers) || !tiers.length) return "—";
  return tiers
    .map((tier) => {
      if (!tier || typeof tier !== "object") return null;
      const rate = formatMoney(tier.rate_cents);
      const count = tier.referral_count;
      if (count == null || count === "") return `Default: ${rate}`;
      return `${count}+ referrals: ${rate}`;
    })
    .filter(Boolean)
    .join(" · ");
}

function formatLedgerObject(obj) {
  if (obj.agreement_version) {
    return formatAgreementVersionLabel(obj.agreement_version);
  }

  if (Array.isArray(obj.rate_tiers)) {
    return formatRateTiers(obj.rate_tiers);
  }

  const parts = [];
  if (obj.program_status != null) {
    parts.push(humanizeScalar(obj.program_status));
  } else if (obj.status != null) {
    parts.push(humanizeScalar(obj.status));
  }

  const ignored = new Set(["acceptance_id", "program_status", "status", "rate_tiers"]);
  for (const [key, value] of Object.entries(obj)) {
    if (ignored.has(key) || value == null || value === "") continue;
    if (typeof value === "object") {
      if (key === "rate_schedule" && Array.isArray(value.rate_tiers)) {
        parts.push(formatRateTiers(value.rate_tiers));
      }
      continue;
    }
    parts.push(`${humanizeLedgerKey(key)}: ${formatLedgerFieldValue(key, value)}`);
  }

  return parts.length ? parts.join(" · ") : "—";
}

export function formatLedgerValue(value) {
  if (value == null) return "—";
  const obj = parseLedgerObject(value);
  if (obj) return formatLedgerObject(obj);
  const text = String(value).trim();
  return text || "—";
}

export function jsonPreview(value) {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch (_e) {
    return String(value);
  }
}

export async function copyText(text, buttonEl) {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    if (buttonEl) {
      const prev = buttonEl.textContent;
      buttonEl.textContent = "Copied!";
      window.setTimeout(() => {
        buttonEl.textContent = prev;
      }, 1400);
    }
    return true;
  } catch (_e) {
    return false;
  }
}
