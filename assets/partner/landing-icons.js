/** Purple stroke icons for partner landing flow steps. */
const ICONS = {
  discover: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  visit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>`,
  points: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.9 6.9L22 12l-7.1 3.1L12 22l-2.9-6.9L2 12l7.1-3.1L12 2Z"/></svg>`,
  friends: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  visibility: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>`,
};

export function renderFlowIcon(key) {
  const svg = ICONS[key] || ICONS.discover;
  return `<span class="pl-flow__icon">${svg}</span>`;
}

const PIN_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>`;

/** Connection-style flourishes: short/medium arcs between points, endpoint nodes, varied weight. */
const CATEGORY_ARCS = {
  coffee: {
    viewBox: "0 0 400 220",
    lines: [
      {
        path: "M 118 178 C 168 52, 268 18, 382 42",
        size: "lg",
        dots: [[118, 178], [248, 28], [382, 42]],
      },
      {
        path: "M 28 198 C 48 168, 72 148, 118 132",
        size: "sm",
        dots: [[28, 198], [72, 148], [118, 132]],
      },
      {
        path: "M 200 158 C 248 118, 298 108, 348 118",
        size: "md",
        opacity: 0.58,
        dots: [[200, 158], [348, 118]],
      },
    ],
  },
  restaurant: {
    viewBox: "0 0 400 220",
    lines: [
      {
        path: "M 42 128 C 138 88, 248 72, 378 88",
        size: "lg",
        dots: [[42, 128], [210, 78], [378, 88]],
      },
      {
        path: "M 68 162 C 138 142, 208 132, 278 128",
        size: "sm",
        opacity: 0.55,
        dots: [[68, 162], [278, 128]],
      },
    ],
  },
  event: {
    viewBox: "0 0 400 220",
    lines: [
      {
        path: "M 72 168 C 128 38, 268 8, 392 28",
        size: "lg",
        dots: [[72, 168], [198, 22], [392, 28]],
      },
      {
        path: "M 58 148 C 148 118, 238 102, 348 88",
        size: "md",
        opacity: 0.68,
        dots: [[58, 148], [198, 108], [348, 88]],
      },
      {
        path: "M 18 182 C 52 168, 88 158, 128 152",
        size: "sm",
        opacity: 0.5,
        dots: [[18, 182], [128, 152]],
      },
      {
        path: "M 240 138 C 288 108, 332 98, 372 102",
        size: "sm",
        opacity: 0.45,
        dots: [[240, 138], [372, 102]],
      },
    ],
  },
  gym: {
    viewBox: "0 0 400 220",
    lines: [
      {
        path: "M 158 142 C 205 82, 252 82, 302 138",
        size: "lg",
        dots: [[158, 142], [228, 88], [302, 138]],
      },
      {
        path: "M 22 98 C 118 58, 228 42, 388 32",
        size: "md",
        opacity: 0.62,
        dots: [[22, 98], [228, 42], [388, 32]],
      },
      {
        path: "M 88 172 C 178 148, 268 138, 362 132",
        size: "sm",
        opacity: 0.48,
        dots: [[88, 172], [362, 132]],
      },
    ],
  },
  park: {
    viewBox: "0 0 400 220",
    lines: [
      {
        path: "M 28 138 C 72 182, 132 98, 192 58 C 258 32, 328 72, 388 118",
        size: "lg",
        dots: [[28, 138], [132, 98], [258, 32], [388, 118]],
      },
      {
        path: "M 48 168 C 108 148, 168 138, 228 132",
        size: "sm",
        opacity: 0.52,
        dots: [[48, 168], [228, 132]],
      },
      {
        path: "M 118 118 C 168 102, 218 98, 268 102",
        size: "md",
        opacity: 0.58,
        dots: [[118, 118], [268, 102]],
      },
    ],
  },
  coworking: {
    viewBox: "0 0 400 220",
    lines: [
      {
        path: "M 38 118 C 148 72, 258 48, 378 68",
        size: "lg",
        dots: [[38, 118], [198, 58], [378, 68]],
      },
      {
        path: "M 72 152 C 158 128, 242 118, 328 112",
        size: "md",
        opacity: 0.62,
        dots: [[72, 152], [328, 112]],
      },
    ],
  },
};

const ARC_OPACITY = { lg: 1, md: 0.72, sm: 0.52 };

function renderCategoryArcLine({ path, size = "lg", dots = [], opacity }) {
  const op = opacity ?? ARC_OPACITY[size] ?? 1;
  const dotR = size === "sm" ? 3.2 : size === "md" ? 3.8 : 4.8;
  const dotMarkup = dots
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${dotR}" />`)
    .join("\n    ");

  return `<path class="pl-category__arc-glow pl-category__arc-glow--${size}" d="${path}" opacity="${(op * 0.55).toFixed(2)}" />
    <path class="pl-category__arc-line pl-category__arc-line--${size}" d="${path}" opacity="${op.toFixed(2)}" />
    ${dotMarkup}`;
}

function renderCategoryArc(variant = "coffee") {
  const arc = CATEGORY_ARCS[variant] || CATEGORY_ARCS.coffee;
  const viewBox = arc.viewBox || "0 0 400 220";
  const lines = arc.lines.map(renderCategoryArcLine).join("\n    ");

  return `<svg class="pl-category__arc pl-category__arc--${variant}" viewBox="${viewBox}" aria-hidden="true" preserveAspectRatio="none">
    ${lines}
</svg>`;
}

export function renderCategoryOverlays({ badge, count, arc = "coffee" }) {
  return `<div class="pl-category__overlays" aria-hidden="true">
    <div class="pl-category__badge">${PIN_ICON}<span>${badge}</span></div>
    <div class="pl-category__presence"><strong>${count}</strong><span>people here</span></div>
    ${renderCategoryArc(arc)}
  </div>`;
}
