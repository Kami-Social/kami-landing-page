import { escapeHtml } from "./format.js";
import { renderCategoryOverlays, renderFlowIcon } from "./landing-icons.js";

const CATEGORY_CARDS = [
  {
    label: "Coffee Shops",
    img: "/assets/store/reward-coffee.jpg",
    badge: "At a coffee shop",
    count: 8,
    imgPosition: "62% center",
    arc: "coffee",
  },
  {
    label: "Restaurants & Bars",
    img: "/assets/store/reward-dinner.jpg",
    badge: "At a restaurant",
    count: 14,
    imgPosition: "center center",
    arc: "restaurant",
  },
  {
    label: "Music Venues",
    img: "/assets/store/reward-nightlife.jpg",
    badge: "At a community event",
    count: 20,
    imgPosition: "center center",
    arc: "event",
  },
  {
    label: "Fitness Studios",
    img: "/assets/store/reward-gym.jpg",
    badge: "At the gym",
    count: 15,
    imgPosition: "center center",
    arc: "gym",
  },
  {
    label: "Community Spaces",
    img: "/assets/store/reward-experience.jpg",
    badge: "At the park",
    count: 12,
    imgPosition: "center center",
    arc: "park",
  },
  {
    label: "Coworking Spaces",
    img: "/assets/store/reward-coworking.jpg",
    badge: "At a coworking space",
    count: 6,
    imgPosition: "28% 36%",
    arc: "coworking",
  },
];

function renderCategoryCard(card) {
  const imgStyle = [
    card.imgPosition ? `object-position: ${card.imgPosition}` : "",
    card.imgScale ? `transform: scale(${card.imgScale})` : "",
  ]
    .filter(Boolean)
    .join("; ");
  const imgStyleAttr = imgStyle ? ` style="${imgStyle}"` : "";
  const overlays = renderCategoryOverlays({
    badge: escapeHtml(card.badge),
    count: card.count,
    arc: card.arc,
  });

  return `<article class="pl-category">
      <div class="pl-category__media">
        <div class="pl-category__frame">
          <img src="${escapeHtml(card.img)}" alt="" decoding="async"${imgStyleAttr} />
        </div>
      </div>
      ${overlays}
      <div class="pl-category__label">${escapeHtml(card.label)}</div>
    </article>`;
}

const BUSINESS_TYPES = [
  "Coffee Shop",
  "Restaurant & Bar",
  "Music Venue",
  "Fitness Studio",
  "Community Space",
  "Coworking Space",
  "Other",
];

export function renderPublicLandingHTML({ misconfigured = false } = {}) {
  const misconfiguredHtml = misconfigured
    ? `<div class="msg err pl-form-msg is-err">Partner login is temporarily unavailable. Configuration is missing on this deployment.</div>`
    : "";

  const categoryCards = CATEGORY_CARDS.map(renderCategoryCard).join("");

  const businessTypeOptions = BUSINESS_TYPES.map(
    (t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
  ).join("");

  return `<div class="partner-land">
  <section class="pl-hero" aria-labelledby="partner-hero-title">
    <div class="pl-hero__media" aria-hidden="true">
      <img src="/assets/partner-hero-rooftop.jpg" alt="" width="1920" height="1080" />
    </div>
    <div class="pl-hero__overlay" aria-hidden="true"></div>
    <div class="pl-hero__glow pl-hero__glow--1" aria-hidden="true"></div>
    <div class="pl-hero__glow pl-hero__glow--2" aria-hidden="true"></div>
    <div class="pl-hero__content">
      <p class="pl-kicker">Kami Partner Program</p>
      <h1 id="partner-hero-title">Helping people discover places worth showing up for.</h1>
      <p class="pl-hero__sub">Kami connects local venues with people who want to be out in the real world — through discovery, events, and community.</p>
      <p class="pl-hero__support">We're launching in Austin with founding venue partners who help shape how local discovery should work.</p>
      <div class="pl-hero__actions">
        <a class="pl-btn" href="#partner-inquiry">Become a Partner</a>
        <a class="pl-btn pl-btn--ghost" href="#partner-login">Partner Login</a>
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--glow" id="partner-why" aria-labelledby="partner-why-title">
    <div class="pl-wrap">
      <p class="pl-kicker">Why partner with Kami</p>
      <h2 class="pl-headline" id="partner-why-title">Outcomes that matter to <em>real venues</em></h2>
      <p class="pl-lead">We're not selling dashboard software. We're building a discovery network that helps people find your place, show up, and come back with friends.</p>
      <div class="pl-benefits">
        <article class="pl-benefit">
          <h3>Be Discovered</h3>
          <p>Reach people nearby who are actively looking for places to go — not scrolling another feed at home.</p>
        </article>
        <article class="pl-benefit">
          <h3>Drive Real Visits</h3>
          <p>Turn discovery into foot traffic. Kami is built around showing up in person, not passive engagement.</p>
        </article>
        <article class="pl-benefit">
          <h3>Activate Community</h3>
          <p>Events, presence, and referrals help the people who already love your venue bring others along.</p>
        </article>
        <article class="pl-benefit">
          <h3>Grow With Us</h3>
          <p>Founding partners get early access, direct founder feedback, and a voice in how the platform evolves.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--dark" aria-labelledby="partner-vision-title">
    <div class="pl-wrap pl-split">
      <figure class="pl-figure">
        <img src="/assets/store/reward-nightlife.jpg" alt="People gathering at a local venue" decoding="async" />
      </figure>
      <div>
        <p class="pl-kicker">The future of local discovery</p>
        <h2 id="partner-vision-title">We're not building another social media platform.</h2>
        <p>Kami is a real-world discovery network. We help people notice the places, events, and communities around them — then actually go.</p>
        <p>No infinite scroll. No performative posting. Just a clearer path from &ldquo;what's happening nearby?&rdquo; to walking through your door.</p>
      </div>
    </div>
  </section>

  <section class="pl-section" aria-labelledby="partner-flow-title">
    <div class="pl-wrap">
      <p class="pl-kicker">How it works</p>
      <h2 class="pl-headline" id="partner-flow-title">From discovery to <em>real-world engagement</em></h2>
      <p class="pl-lead">A simple loop that benefits venues and the people who visit them.</p>
      <div class="pl-flow">
        <article class="pl-flow__step">
          ${renderFlowIcon("discover")}
          <h3>People discover your venue</h3>
          <p>Nearby users find your place on Kami when they're out exploring.</p>
        </article>
        <article class="pl-flow__step">
          ${renderFlowIcon("visit")}
          <h3>People visit</h3>
          <p>Discovery turns into real foot traffic — not just impressions.</p>
        </article>
        <article class="pl-flow__step">
          ${renderFlowIcon("points")}
          <h3>People earn points</h3>
          <p>Showing up and participating is rewarded inside Kami.</p>
        </article>
        <article class="pl-flow__step">
          ${renderFlowIcon("friends")}
          <h3>People bring friends</h3>
          <p>Referrals and ambassadors help spread the word organically.</p>
        </article>
        <article class="pl-flow__step">
          ${renderFlowIcon("visibility")}
          <h3>Your venue gains visibility</h3>
          <p>More visits and engagement strengthen your presence on Kami.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--dark" aria-labelledby="partner-fit-title">
    <div class="pl-wrap">
      <p class="pl-kicker">Built for places that bring people together</p>
      <h2 class="pl-headline" id="partner-fit-title">If your business creates <em>community</em>, you might be a fit</h2>
      <p class="pl-lead">Kami works best for venues where people gather, return, and invite others.</p>
      <div class="pl-categories">${categoryCards}</div>
    </div>
  </section>

  <section class="pl-section pl-section--glow" aria-labelledby="partner-austin-title">
    <div class="pl-wrap">
      <div class="pl-austin">
        <div>
          <p class="pl-kicker">Austin founding partners</p>
          <h2 class="pl-headline" id="partner-austin-title">Help shape Kami from the <em>ground up</em></h2>
          <p class="pl-lead" style="margin-bottom: 0;">We're starting in Austin and working closely with a small group of founding venue partners.</p>
        </div>
        <ul>
          <li>Early access to the partner program and portal</li>
          <li>Direct feedback loop with the founding team</li>
          <li>Input on features that matter to real venues</li>
          <li>Priority support as we grow the Austin network</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--dark" aria-labelledby="partner-perks-title">
    <div class="pl-wrap">
      <p class="pl-kicker">Partner benefits</p>
      <h2 class="pl-headline" id="partner-perks-title">What partners get <em>today</em></h2>
      <p class="pl-lead">Real benefits aligned with what's live — not a wishlist.</p>
      <div class="pl-perks">
        <article class="pl-perk">
          <span class="pl-perk__mark" aria-hidden="true">1</span>
          <div>
            <h3>Venue presence on Kami</h3>
            <p>Your place listed and discoverable to nearby Kami users when published.</p>
          </div>
        </article>
        <article class="pl-perk">
          <span class="pl-perk__mark" aria-hidden="true">2</span>
          <div>
            <h3>Event promotion</h3>
            <p>Upcoming events at your venue surfaced to people exploring nearby.</p>
          </div>
        </article>
        <article class="pl-perk">
          <span class="pl-perk__mark" aria-hidden="true">3</span>
          <div>
            <h3>Referral program</h3>
            <p>A partner referral link to share with your community and track signups.</p>
          </div>
        </article>
        <article class="pl-perk">
          <span class="pl-perk__mark" aria-hidden="true">4</span>
          <div>
            <h3>Ambassador collaboration</h3>
            <p>Connect with Kami ambassadors who help grow local discovery.</p>
          </div>
        </article>
        <article class="pl-perk">
          <span class="pl-perk__mark" aria-hidden="true">5</span>
          <div>
            <h3>Community engagement</h3>
            <p>Be part of a network focused on real-world participation, not passive scrolling.</p>
          </div>
        </article>
        <article class="pl-perk">
          <span class="pl-perk__mark" aria-hidden="true">6</span>
          <div>
            <h3>Partner portal</h3>
            <p>View linked venues, referral links, program terms, and events in one place.</p>
          </div>
        </article>
      </div>
    </div>
  </section>

  <section class="pl-section" id="partner-inquiry" aria-labelledby="partner-inquiry-title">
    <div class="pl-wrap">
      <div class="pl-inquiry">
        <p class="pl-kicker">Become a partner</p>
        <h2 class="pl-headline" id="partner-inquiry-title">Tell us about your <em>venue</em></h2>
        <p class="pl-lead" style="margin-bottom: 24px;">Fill out the form below and our team will follow up. No commitment required.</p>
        <form id="partner-inquiry-form" class="pl-form-grid" novalidate>
          <div class="pl-field">
            <label for="inquiry-business">Business Name *</label>
            <input id="inquiry-business" name="business_name" type="text" required autocomplete="organization" />
          </div>
          <div class="pl-field">
            <label for="inquiry-contact">Contact Name *</label>
            <input id="inquiry-contact" name="contact_name" type="text" required autocomplete="name" />
          </div>
          <div class="pl-field">
            <label for="inquiry-email">Email *</label>
            <input id="inquiry-email" name="email" type="email" required autocomplete="email" />
          </div>
          <div class="pl-field">
            <label for="inquiry-type">Business Type *</label>
            <select id="inquiry-type" name="business_type" required>
              <option value="">Select a type</option>
              ${businessTypeOptions}
            </select>
          </div>
          <div class="pl-field">
            <label for="inquiry-website">Website</label>
            <input id="inquiry-website" name="website" type="url" placeholder="https://" autocomplete="url" />
          </div>
          <div class="pl-field">
            <label for="inquiry-instagram">Instagram</label>
            <input id="inquiry-instagram" name="instagram" type="text" placeholder="@yourvenue" autocomplete="off" />
          </div>
          <div class="pl-field pl-field--full">
            <label for="inquiry-why">Why are you interested? *</label>
            <textarea id="inquiry-why" name="why_interested" required placeholder="Tell us about your venue and what you're hoping to get from partnering with Kami."></textarea>
          </div>
          <div class="pl-field pl-field--full">
            <button type="submit" class="pl-btn" id="inquiry-submit" style="width: 100%;">Submit Inquiry</button>
          </div>
          <p class="pl-inquiry-alt pl-field--full">Or email us at <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a></p>
        </form>
        <p class="pl-inquiry-note">Inquiries are sent to our partner team. We typically respond within a few business days.</p>
        <div id="inquiry-message" class="pl-form-msg" hidden role="status"></div>
      </div>
    </div>
  </section>

  <section class="pl-login-section" id="partner-login" aria-labelledby="partner-login-title">
    <div class="pl-login-wrap">
      <p class="pl-login-eyebrow">Existing partners</p>
      <h2 id="partner-login-title">Already a partner?</h2>
      <p>Access your partner portal to view venues, referral links, and program status.</p>
      ${misconfiguredHtml}
      <section class="panel login-panel">
        <form id="login-form" class="stack-form" novalidate>
          <label for="login-email">Email</label>
          <input id="login-email" type="email" autocomplete="email" required />
          <label for="login-password">Password</label>
          <input id="login-password" type="password" autocomplete="current-password" required />
          <div id="login-error" class="msg err" hidden role="alert"></div>
          <button class="btn" type="submit" id="login-submit">Log in</button>
        </form>
        <p class="helper-row"><button type="button" class="text-link" id="forgot-password">Forgot password?</button></p>
        <p class="helper-row">Questions? Contact <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a></p>
      </section>
    </div>
  </section>
</div>`;
}

export function wirePublicLanding({ wireLoginForm }) {
  document.body.classList.add("partner-is-public");
  syncSiteFooter(true);

  const form = document.getElementById("partner-inquiry-form");
  const msg = document.getElementById("inquiry-message");
  const submit = document.getElementById("inquiry-submit");

  if (form && !form.dataset.inquiryWired) {
    form.dataset.inquiryWired = "1";
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (msg) msg.hidden = true;

      const payload = {
        business_name: form.business_name?.value.trim() || "",
        contact_name: form.contact_name?.value.trim() || "",
        email: form.email?.value.trim() || "",
        business_type: form.business_type?.value.trim() || "",
        website: form.website?.value.trim() || "",
        instagram: form.instagram?.value.trim() || "",
        why_interested: form.why_interested?.value.trim() || "",
      };

      if (!payload.business_name || !payload.contact_name || !payload.email || !payload.business_type || !payload.why_interested) {
        if (msg) {
          msg.textContent = "Please fill in all required fields.";
          msg.className = "pl-form-msg is-err";
          msg.hidden = false;
        }
        return;
      }

      if (submit) submit.disabled = true;

      let sent = false;
      try {
        const response = await fetch("/api/partner/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.ok) {
          sent = true;
          form.reset();
          if (msg) {
            msg.textContent = data.message || "Thanks! We'll be in touch soon.";
            msg.className = "pl-form-msg is-ok";
            msg.hidden = false;
          }
        } else if (msg) {
          msg.textContent = data.message || "Something went wrong. Please try again or email partners@kamisocial.com.";
          msg.className = "pl-form-msg is-err";
          msg.hidden = false;
        }
      } catch (_e) {
        /* fall through */
      }

      if (!sent && msg && msg.hidden) {
        const subject = encodeURIComponent(`Partner inquiry: ${payload.business_name}`);
        const body = encodeURIComponent(
          `Business: ${payload.business_name}\nContact: ${payload.contact_name}\nEmail: ${payload.email}\nType: ${payload.business_type}\nWebsite: ${payload.website || "—"}\nInstagram: ${payload.instagram || "—"}\n\nWhy interested:\n${payload.why_interested}`
        );
        if (msg) {
          msg.innerHTML = `Could not submit online. <a href="mailto:partners@kamisocial.com?subject=${subject}&body=${body}">Email your inquiry</a> instead.`;
          msg.className = "pl-form-msg is-err";
          msg.hidden = false;
        }
      }

      if (submit) submit.disabled = false;
    });
  }

  if (typeof wireLoginForm === "function") {
    wireLoginForm();
  }

  wirePartnerLandingHashScroll();
  schedulePartnerLandingHash();
}

export function syncSiteFooter(visible = true) {
  const footer = document.getElementById("partner-public-footer");
  if (footer) footer.hidden = !visible;
}

export function clearPublicLandingMode() {
  document.body.classList.remove("partner-is-public");
  syncSiteFooter(true);
}

/** Scroll to in-page partner anchors after async landing HTML is mounted. */
export function applyPartnerLandingHash({ behavior = "auto" } = {}) {
  const { hash } = window.location;
  if (!hash || hash.length < 2) return false;

  const target = document.querySelector(hash);
  if (!target || !target.closest(".partner-land")) return false;

  target.scrollIntoView({ block: "start", inline: "nearest", behavior });
  return true;
}

export function schedulePartnerLandingHash() {
  const run = () => {
    applyPartnerLandingHash({ behavior: "auto" });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });

  if (document.readyState === "complete") {
    run();
  } else {
    window.addEventListener("load", run, { once: true });
  }
}

function wirePartnerLandingHashScroll() {
  if (window.__partnerLandingHashScrollWired) return;
  window.__partnerLandingHashScrollWired = true;

  window.addEventListener("hashchange", () => {
    applyPartnerLandingHash({ behavior: "smooth" });
  });
}
