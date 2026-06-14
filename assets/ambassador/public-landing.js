/**
 * Ambassador program public landing page.
 * Previous logged-out shell backed up at: assets/ambassador/archive/public-shell-v20260614.backup.js
 */
import { escapeHtml } from "./format.js";
import { renderFlowIcon, renderPortalIcon, renderBenefitIcon } from "./landing-icons.js";
import { renderAmbassadorHeroArt } from "./hero-art.js";

const FAQ_ITEMS = [
  {
    q: "Who can become an ambassador?",
    a: "Anyone who believes in real-world connection and wants to help grow the Kami community. You don't need to be an influencer, creator, or event organizer. We care more about authenticity, enthusiasm, and the ability to introduce great people to the network.",
  },
  {
    q: "Do ambassadors get paid?",
    a: "In some cases, yes. Approved ambassadors may be eligible for referral rewards based on the current Ambassador Program terms. Program details, eligibility requirements, and any active referral opportunities are available inside the Ambassador Portal.",
  },
  {
    q: "Do I need a large audience?",
    a: "No. Some of the best ambassadors may come from small but highly connected communities. We'd rather have someone who can introduce ten great people to Kami than someone who broadcasts to ten thousand strangers.",
  },
  {
    q: "Is approval required?",
    a: "Yes. We review every application to help ensure ambassadors are aligned with Kami's mission and community standards. Approval is based on fit, not follower count.",
  },
  {
    q: "Where can I track referrals?",
    a: "Approved ambassadors receive access to the Ambassador Portal, where they can manage referral links, track registrations, review program information, and stay up to date on Ambassador Program updates.",
  },
  {
    q: "How much time does being an ambassador require?",
    a: "There are no minimum hour requirements. Some ambassadors occasionally share Kami with friends, while others take a more active role in helping grow their local community. Participation is flexible.",
  },
  {
    q: "What are you looking for in an ambassador?",
    a: "We're looking for people who genuinely enjoy bringing others together. Community builders, students, creators, organizers, connectors, and anyone who believes people should spend more time in the real world are encouraged to apply.",
  },
];

function renderBenefitCard({ icon, title, body }) {
  return `<article class="pl-benefit al-benefit">
    ${renderBenefitIcon(icon)}
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
  </article>`;
}

function renderStepCard({ step, icon, title, body }) {
  return `<article class="al-step-card">
    <div class="al-step-card__icon">${renderFlowIcon(icon)}</div>
    <div class="al-step-card__body">
      <p class="al-step-num">${escapeHtml(step)}</p>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
    </div>
  </article>`;
}

function renderPerkCard({ num, title, body }) {
  return `<article class="pl-perk al-perk">
    <span class="pl-perk__mark" aria-hidden="true">${num}</span>
    <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>
  </article>`;
}

function renderPortalPreviewCard({ icon, title, description, mockHtml }) {
  return `<article class="al-portal-card">
    ${renderPortalIcon(icon)}
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(description)}</p>
    <div class="al-portal-mock" aria-hidden="true">${mockHtml}</div>
  </article>`;
}

const PORTAL_MOCKS = {
  dashboard: `<div class="al-mock-metrics">
    <div class="al-mock-metric"><span class="al-mock-label">This month</span><strong>12</strong><span>qualified referrals</span></div>
    <div class="al-mock-metric"><span class="al-mock-label">Pending</span><strong>$48</strong><span>earnings</span></div>
    <div class="al-mock-metric"><span class="al-mock-label">Status</span><strong class="al-mock-pill">Active</strong></div>
  </div>`,
  links: `<div class="al-mock-link">
    <span class="al-mock-code">yourname</span>
    <span class="al-mock-url">kamisocial.com/r/yourname</span>
    <span class="al-mock-btn">Copy link</span>
  </div>`,
  agreements: `<div class="al-mock-list">
    <div class="al-mock-row"><span>Ambassador Terms v1.1</span><span class="al-mock-pill al-mock-pill--ok">Accepted</span></div>
    <div class="al-mock-row al-mock-row--muted"><span>Program parameters</span><span>View snapshot</span></div>
  </div>`,
  resources: `<div class="al-mock-list">
    <div class="al-mock-row"><span>March program update</span><span>→</span></div>
    <div class="al-mock-row"><span>Referral best practices</span><span>→</span></div>
    <div class="al-mock-row"><span>Support &amp; contact</span><span>→</span></div>
  </div>`,
};

export function renderPublicLandingHTML({ misconfigured = false } = {}) {
  const misconfiguredHtml = misconfigured
    ? `<div class="msg err pl-form-msg is-err">Ambassador login is temporarily unavailable. Configuration is missing on this deployment.</div>`
    : "";

  const faqHtml = FAQ_ITEMS.map(
    (item, idx) => `<details class="al-faq-item"${idx === 0 ? " open" : ""}>
      <summary>${escapeHtml(item.q)}</summary>
      <p>${escapeHtml(item.a)}</p>
    </details>`
  ).join("");

  const portalCards = [
    renderPortalPreviewCard({
      icon: "dashboard",
      title: "Dashboard",
      description: "Referral activity, registrations, and program status.",
      mockHtml: PORTAL_MOCKS.dashboard,
    }),
    renderPortalPreviewCard({
      icon: "link",
      title: "Referral Links",
      description: "Manage referral codes and track performance.",
      mockHtml: PORTAL_MOCKS.links,
    }),
    renderPortalPreviewCard({
      icon: "agreement",
      title: "Agreements",
      description: "View current and historical program terms.",
      mockHtml: PORTAL_MOCKS.agreements,
    }),
    renderPortalPreviewCard({
      icon: "resources",
      title: "Resources",
      description: "Program updates, communications, and support materials.",
      mockHtml: PORTAL_MOCKS.resources,
    }),
  ].join("");

  return `<div class="ambassador-land">
  <section class="al-hero" aria-labelledby="ambassador-hero-title">
    ${renderAmbassadorHeroArt()}
    <div class="al-hero__overlay" aria-hidden="true"></div>
    <div class="al-hero__content pl-wrap">
      <p class="pl-kicker al-hero__kicker">Kami Ambassador Program</p>
      <h1 id="ambassador-hero-title">Help Build <span class="al-hero__accent">Real-World Community.</span></h1>
      <p class="al-hero__sub">Kami Ambassadors introduce great people to the platform, grow local communities, and help shape the future of real-world social discovery.</p>
      <div class="al-hero__actions">
        <a class="pl-btn" href="#ambassador-apply">Apply to Become an Ambassador</a>
        <a class="pl-btn pl-btn--ghost" href="#ambassador-login">Ambassador Login</a>
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--glow al-section" id="ambassador-why" aria-labelledby="ambassador-why-title">
    <div class="pl-wrap al-section__inner">
      <header class="al-section__head">
        <p class="pl-kicker">Why become an ambassador</p>
        <h2 class="pl-headline" id="ambassador-why-title">Why Become an <em>Ambassador?</em></h2>
        <p class="pl-lead al-section__lead">Join a program built for people who care about real-world connection — not vanity metrics or endless scrolling.</p>
      </header>
      <div class="pl-benefits al-benefits">
        ${renderBenefitCard({ icon: "community", title: "Grow Your Community", body: "Help bring interesting people into your city's Kami network." })}
        ${renderBenefitCard({ icon: "rewards", title: "Earn Referral Rewards", body: "Eligible ambassadors may receive referral compensation through the Ambassador Program." })}
        ${renderBenefitCard({ icon: "early", title: "Early Access", body: "Get access to new features and initiatives before broader rollout." })}
        ${renderBenefitCard({ icon: "access", title: "Direct Access", body: "Provide feedback directly to the Kami team and help influence future development." })}
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--dark al-section" id="ambassador-how" aria-labelledby="ambassador-how-title">
    <div class="pl-wrap al-section__inner">
      <header class="al-section__head">
        <p class="pl-kicker">How it works</p>
        <h2 class="pl-headline" id="ambassador-how-title">How It <em>Works</em></h2>
        <p class="pl-lead al-section__lead">A straightforward path from application to impact in your community.</p>
      </header>
      <div class="al-steps">
        ${renderStepCard({ step: "Step 1", icon: "apply", title: "Apply", body: "Submit an ambassador application." })}
        ${renderStepCard({ step: "Step 2", icon: "approve", title: "Get Approved", body: "Approved ambassadors receive access to the Ambassador Portal." })}
        ${renderStepCard({ step: "Step 3", icon: "grow", title: "Grow the Network", body: "Share your referral code, invite great people, and help strengthen local communities." })}
      </div>
    </div>
  </section>

  <section class="pl-section al-section" aria-labelledby="ambassador-great-title">
    <div class="pl-wrap al-section__inner">
      <header class="al-section__head">
        <p class="pl-kicker">What we look for</p>
        <h2 class="pl-headline" id="ambassador-great-title">What Makes a Great <em>Ambassador?</em></h2>
        <p class="pl-lead al-section__lead">Ambassadors represent Kami in the real world. These qualities help the program thrive.</p>
      </header>
      <div class="pl-benefits al-benefits">
        ${renderBenefitCard({ icon: "represent", title: "Represent Kami Positively", body: "Promote Kami honestly and authentically." })}
        ${renderBenefitCard({ icon: "connect", title: "Build Real Connections", body: "Help people spend more time in the real world." })}
        ${renderBenefitCard({ icon: "guidelines", title: "Follow Program Guidelines", body: "Comply with program terms and community standards." })}
        ${renderBenefitCard({ icon: "feedback", title: "Provide Feedback", body: "Help improve the platform through thoughtful suggestions and testing." })}
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--dark al-section" aria-labelledby="ambassador-rewards-title">
    <div class="pl-wrap al-section__inner">
      <header class="al-section__head">
        <p class="pl-kicker">Rewards &amp; benefits</p>
        <h2 class="pl-headline" id="ambassador-rewards-title">Rewards &amp; <em>Benefits</em></h2>
        <p class="pl-lead al-section__lead">Program perks designed to support ambassadors who help grow the network.</p>
      </header>
      <div class="pl-perks al-perks--6">
        ${renderPerkCard({ num: 1, title: "Referral Rewards", body: "Compensation for qualified referrals per active program terms." })}
        ${renderPerkCard({ num: 2, title: "Early Feature Access", body: "Try new capabilities before wider release." })}
        ${renderPerkCard({ num: 3, title: "Ambassador Updates", body: "Stay informed on program news and priorities." })}
        ${renderPerkCard({ num: 4, title: "Community Recognition", body: "Be acknowledged for helping build local discovery." })}
        ${renderPerkCard({ num: 5, title: "Future Event Opportunities", body: "Potential access to ambassador gatherings as the program grows." })}
        ${renderPerkCard({ num: 6, title: "Direct Team Communication", body: "Share feedback with the people building Kami." })}
      </div>
      <p class="al-disclaimer">Benefits and opportunities may evolve as the Ambassador Program grows.</p>
    </div>
  </section>

  <section class="pl-section pl-section--glow al-section" aria-labelledby="ambassador-portal-title">
    <div class="pl-wrap al-section__inner">
      <header class="al-section__head al-section__head--center">
        <p class="pl-kicker">After approval</p>
        <h2 class="pl-headline" id="ambassador-portal-title">Ambassador <em>Portal</em></h2>
        <p class="pl-lead al-section__lead">Track your progress, manage referrals, and stay connected with the program.</p>
      </header>
      <div class="al-portal-showcase">
        <div class="al-portal-grid">${portalCards}</div>
      </div>
    </div>
  </section>

  <section class="pl-section pl-section--dark al-section" id="ambassador-faq" aria-labelledby="ambassador-faq-title">
    <div class="pl-wrap al-section__inner al-faq-wrap">
      <header class="al-section__head al-section__head--center">
        <p class="pl-kicker">FAQ</p>
        <h2 class="pl-headline" id="ambassador-faq-title">Common <em>Questions</em></h2>
      </header>
      <div class="al-faq">${faqHtml}</div>
    </div>
  </section>

  <section class="pl-section al-section" id="ambassador-apply" aria-labelledby="ambassador-apply-title">
    <div class="pl-wrap al-section__inner">
      <div class="pl-inquiry al-inquiry">
        <header class="al-section__head al-section__head--center">
          <p class="pl-kicker">Apply</p>
          <h2 class="pl-headline" id="ambassador-apply-title">Apply to Become an <em>Ambassador</em></h2>
          <p class="pl-lead al-section__lead al-section__lead--tight">Tell us a bit about yourself. Our team reviews every application.</p>
        </header>
        <form id="ambassador-apply-form" class="pl-form-grid" novalidate>
          <div class="pl-field">
            <label for="apply-name">Your Name *</label>
            <input id="apply-name" name="name" type="text" required autocomplete="name" />
          </div>
          <div class="pl-field">
            <label for="apply-email">Email *</label>
            <input id="apply-email" name="email" type="email" required autocomplete="email" />
          </div>
          <div class="pl-field pl-field--full">
            <label for="apply-city">City *</label>
            <input id="apply-city" name="city" type="text" required autocomplete="address-level2" placeholder="e.g. Austin, TX" />
          </div>
          <div class="pl-field pl-field--full">
            <label for="apply-why">Why do you want to be an ambassador? *</label>
            <textarea id="apply-why" name="why" required placeholder="Tell us about your community and how you'd help grow Kami locally."></textarea>
          </div>
          <div class="pl-field pl-field--full">
            <button type="submit" class="pl-btn al-submit-btn" id="apply-submit">Submit Application</button>
          </div>
          <p class="pl-inquiry-alt pl-field--full">Or email us at <a href="mailto:ambassadors@kamisocial.com">ambassadors@kamisocial.com</a></p>
        </form>
        <p class="pl-inquiry-note">Applications are reviewed by our team. We typically respond within a few business days.</p>
        <div id="apply-message" class="pl-form-msg" hidden role="status"></div>
      </div>
    </div>
  </section>

  <section class="pl-login-section" id="ambassador-login" aria-labelledby="ambassador-login-title">
    <div class="pl-login-wrap">
      <p class="pl-login-eyebrow">Existing ambassadors</p>
      <h2 id="ambassador-login-title">Already an Ambassador?</h2>
      <p>Access your Ambassador Portal.</p>
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
        <p class="helper-row">Haven't created a Kami account yet? <a href="/#download">Download Kami</a> and create your account first.</p>
        <p class="helper-row">Questions? Contact <a href="mailto:ambassadors@kamisocial.com">ambassadors@kamisocial.com</a></p>
      </section>
    </div>
  </section>
</div>`;
}

export function wirePublicLanding({ wireLoginForm }) {
  document.body.classList.add("ambassador-is-public");
  syncSiteFooter(true);

  const form = document.getElementById("ambassador-apply-form");
  const msg = document.getElementById("apply-message");
  const submit = document.getElementById("apply-submit");

  if (form && !form.dataset.applyWired) {
    form.dataset.applyWired = "1";
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (msg) msg.hidden = true;

      const payload = {
        name: form.name?.value.trim() || "",
        email: form.email?.value.trim() || "",
        city: form.city?.value.trim() || "",
        why: form.why?.value.trim() || "",
      };

      if (!payload.name || !payload.email || !payload.city || !payload.why) {
        if (msg) {
          msg.textContent = "Please fill in all required fields.";
          msg.className = "pl-form-msg is-err";
          msg.hidden = false;
        }
        return;
      }

      if (submit) submit.disabled = true;

      const subject = encodeURIComponent(`Ambassador application: ${payload.name}`);
      const body = encodeURIComponent(
        `Name: ${payload.name}\nEmail: ${payload.email}\nCity: ${payload.city}\n\nWhy:\n${payload.why}`
      );
      window.location.href = `mailto:ambassadors@kamisocial.com?subject=${subject}&body=${body}`;

      if (msg) {
        msg.textContent =
          "Your email app should open with your application draft. Send the message to complete your application.";
        msg.className = "pl-form-msg is-ok";
        msg.hidden = false;
      }

      if (submit) submit.disabled = false;
    });
  }

  if (typeof wireLoginForm === "function") {
    wireLoginForm();
  }

  wireAmbassadorLandingHashScroll();
  scheduleAmbassadorLandingHash();
}

export function syncSiteFooter(visible = true) {
  const footer = document.getElementById("ambassador-public-footer");
  if (footer) footer.hidden = !visible;
}

export function clearPublicLandingMode() {
  document.body.classList.remove("ambassador-is-public");
  syncSiteFooter(true);
}

function scrollToAmbassadorTarget(target, { behavior = "auto" } = {}) {
  const scrollMarginTop = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const top = window.scrollY + target.getBoundingClientRect().top - scrollMarginTop;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

export function applyAmbassadorLandingHash({ behavior = "auto" } = {}) {
  const { hash } = window.location;
  if (!hash || hash.length < 2) return false;

  const target = document.querySelector(hash);
  if (!target || !target.closest(".ambassador-land")) return false;

  scrollToAmbassadorTarget(target, { behavior });
  return true;
}

export function scheduleAmbassadorLandingHash() {
  const run = () => {
    applyAmbassadorLandingHash({ behavior: "auto" });
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

export function wireAmbassadorLandingHashScroll() {
  if (window.__ambassadorLandingHashScrollWired) return;
  window.__ambassadorLandingHashScrollWired = true;

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const hash = link.getAttribute("href");
      if (!hash || hash.length < 2) return;

      const target = document.querySelector(hash);
      if (!target || !target.closest(".ambassador-land")) return;

      const fromNav = Boolean(link.closest(".ambassador-nav-links"));
      const fromLanding = Boolean(link.closest(".ambassador-land"));
      if (!fromNav && !fromLanding) return;

      event.preventDefault();
      if (window.location.hash !== hash) {
        history.pushState(null, "", hash);
      }
      scrollToAmbassadorTarget(target, { behavior: "smooth" });
    },
    true
  );

  window.addEventListener("popstate", () => {
    applyAmbassadorLandingHash({ behavior: "auto" });
  });
}
