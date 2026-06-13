#!/usr/bin/env node
/**
 * Capture partner portal screenshots for QA docs.
 * Public states: live page at BASE_URL.
 * Authenticated states: HTML rendered with production-shaped fixture data + portal CSS.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs/partner-portal-screenshots");
const BASE_URL = process.env.PARTNER_QA_BASE_URL || "http://localhost:3456";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(innerHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kami Partner Portal</title>
  <link rel="stylesheet" href="${BASE_URL}/assets/partner/styles.css" />
</head>
<body>
  <nav>
    <div class="nav-inner">
      <a href="/" aria-label="Kami home">
        <img class="wordmark-img" src="${BASE_URL}/assets/logo-wordmark.png" alt="Kami" />
      </a>
      <a class="nav-link" href="/">Back to Kami</a>
    </div>
  </nav>
  <main class="container">
    <div id="partner-root">${innerHtml}</div>
  </main>
  <footer>
    <p>© Kami Social · <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a></p>
  </footer>
</body>
</html>`;
}

const programParams = {
  qualification_requirements:
    "Referred users must create a Kami account using your partner referral link, complete onboarding, and meet Kami's active-user criteria (non-test account, not removed, in good standing). Qualification is determined when Kami verifies the referral.",
  compensation_rate:
    "Compensation rates are shown in your Partner Portal and may vary by partner agreement. Contact partners@kamisocial.com with questions about your rate.",
  payout_threshold: "$50.00 USD",
  payout_schedule:
    "Payouts are processed periodically for approved balances that meet the payout threshold shown in your Partner Portal, unless otherwise noted in your agreement.",
};

function termsSummary(params) {
  return `<dl class="terms-grid">
    <div class="terms-row"><dt>Qualification</dt><dd>${escapeHtml(params.qualification_requirements)}</dd></div>
    <div class="terms-row"><dt>Compensation</dt><dd>${escapeHtml(params.compensation_rate)}</dd></div>
    <div class="terms-row"><dt>Payout threshold</dt><dd>${escapeHtml(params.payout_threshold)}</dd></div>
    <div class="terms-row"><dt>Payout schedule</dt><dd>${escapeHtml(params.payout_schedule)}</dd></div>
  </dl>`;
}

function agreementFixture() {
  return shell(`
    <section class="panel agreement-panel">
      <div class="agreement-panel-top">
        <div class="agreement-panel-head">
          <h2 class="agreement-page-title">Accept Partner Agreement</h2>
          <p class="agreement-intro">Review your partner program terms for <strong>Mike Rowan</strong> and accept to continue.</p>
        </div>
      </div>
      ${termsSummary(programParams)}
    </section>
    <section class="panel agreement-doc-panel">
      <h3>Kami Partner Program Agreement</h3>
      <div class="agreement-scroll">Partner agrees to promote Kami in accordance with program guidelines…</div>
      <label class="check-row"><input type="checkbox" /> I have read and agree to the Kami Partner Program Agreement.</label>
      <div class="agreement-actions">
        <button class="btn" type="button" disabled>Accept and Continue</button>
        <button class="btn secondary" type="button">Log out</button>
      </div>
    </section>`);
}

function emptyVenuesFixture() {
  return shell(`
    <section class="panel dashboard-header">
      <div class="dashboard-header-main">
        <div class="eyebrow dashboard-eyebrow">Partner Portal</div>
        <div class="header-main">
          <div class="header-copy">
            <h1>Stephanie</h1>
            <p class="muted">mendezzjjesse210@gmail.com · Joined Jun 13, 2026</p>
          </div>
        </div>
      </div>
      <span class="status-badge">Active partner</span>
    </section>
    <div class="portal-tabs" role="tablist">
      <button type="button" class="portal-tab is-active" role="tab" aria-selected="true">Venues</button>
      <button type="button" class="portal-tab" role="tab" aria-selected="false">Events</button>
    </div>
    <div id="tab-venues">
      <section class="panel">
        <h2>Your Venues</h2>
        <div class="empty-state">
          <h3>No venues linked yet</h3>
          <p>No venues have been linked to this partner account yet. Contact <a href="mailto:partners@kamisocial.com">partners@kamisocial.com</a> if you believe this is an error or need help getting set up.</p>
        </div>
      </section>
      <section class="panel">
        <h2>Venue Readiness</h2>
        <ul class="readiness-list">
          <li class="readiness-item"><span class="readiness-mark">○</span><span>Venue linked</span></li>
          <li class="readiness-item"><span class="readiness-mark">○</span><span>Venue published on Kami</span></li>
          <li class="readiness-item is-met"><span class="readiness-mark">✓</span><span>Partner agreement accepted</span></li>
          <li class="readiness-item is-met"><span class="readiness-mark">✓</span><span>Referral link active</span></li>
        </ul>
      </section>
      <section class="panel referral-panel">
        <h2>Referral Program</h2>
        <p class="muted">Share this link with customers and followers to help grow the Kami community.</p>
        <div class="copy-grid">
          <div><label>Referral Code</label><p class="copy-value">mikerowan</p></div>
          <div><label>Referral Link</label><p class="copy-value copy-value-link">https://kamisocial.com/invite/mikerowan</p></div>
        </div>
        <p class="referral-stat"><strong>0</strong> registrations via your link</p>
      </section>
    </div>`);
}

function venuesTabFixture() {
  return shell(`
    <section class="panel dashboard-header">
      <div class="dashboard-header-main">
        <div class="eyebrow dashboard-eyebrow">Partner Portal</div>
        <div class="header-copy"><h1>Mike Rowan</h1><p class="muted">bensdecker+2@gmail.com · Joined Jun 13, 2026</p></div>
      </div>
      <span class="status-badge">Active partner</span>
    </section>
    <div class="portal-tabs"><button class="portal-tab is-active">Venues</button><button class="portal-tab">Events</button></div>
    <div id="tab-venues">
      <section class="panel">
        <h2>Your Venues</h2>
        <p class="muted">2 venues linked to your partner account.</p>
        <div class="venue-grid venue-grid--multi">
          <article class="venue-card">
            <div class="venue-photo venue-photo-fallback" aria-hidden="true">B</div>
            <div>
              <h3>Bennu Coffee</h3>
              <p class="venue-meta">Coffee · East Austin<br>Austin, TX</p>
              <div class="venue-badges"><span class="venue-badge is-good">Active</span><span class="venue-badge is-good">Public</span><span class="venue-badge is-good">Published on Kami</span></div>
            </div>
          </article>
          <article class="venue-card">
            <div class="venue-photo venue-photo-fallback" aria-hidden="true">C</div>
            <div>
              <h3>Cosmic Coffee</h3>
              <p class="venue-meta">Coffee · South Austin<br>Austin, TX</p>
              <div class="venue-badges"><span class="venue-badge is-good">Active</span><span class="venue-badge is-good">Public</span><span class="venue-badge is-warn">Not published</span></div>
            </div>
          </article>
        </div>
      </section>
      <section class="panel referral-panel">
        <h2>Referral Program</h2>
        <p class="referral-stat"><strong>3</strong> registrations via your link</p>
      </section>
    </div>`);
}

function eventsTabFixture() {
  return shell(`
    <section class="panel dashboard-header">
      <div class="header-copy"><h1>Mike Rowan</h1></div>
      <span class="status-badge">Active partner</span>
    </section>
    <div class="portal-tabs"><button class="portal-tab">Venues</button><button class="portal-tab is-active">Events</button></div>
    <div id="tab-events">
      <section class="panel">
        <div class="empty-state">
          <h3>No upcoming events found</h3>
          <p>There are no upcoming published events across your linked venues right now. Events will appear here when they are scheduled at venues on your account.</p>
        </div>
      </section>
    </div>`);
}

async function screenshotPage(page, url, file, { fullPage = true, waitMs = 500 } = {}) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, waitMs));
  await page.screenshot({ path: path.join(OUT, file), fullPage });
  console.log("saved", file);
}

async function screenshotHtml(page, html, file) {
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  console.log("saved", file);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await screenshotPage(page, `${BASE_URL}/partner`, "01-login.png");

  await page.goto(`${BASE_URL}/partner`, { waitUntil: "networkidle2" });
  await page.waitForSelector("#login-email");
  await page.type("#login-email", "notanemail");
  await page.click("#forgot-password");
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, "02-forgot-password-invalid.png"), fullPage: true });
  console.log("saved 02-forgot-password-invalid.png");

  await page.click("#partner-dialog-ok");
  await page.evaluate(() => {
    document.getElementById("login-email").value = "nobody@example.com";
  });
  await page.click("#forgot-password");
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, "03-forgot-password-not-found.png"), fullPage: true });
  console.log("saved 03-forgot-password-not-found.png");

  await screenshotHtml(page, agreementFixture(), "04-agreement-gate.png");
  await screenshotHtml(page, emptyVenuesFixture(), "05-empty-venues.png");
  await screenshotHtml(page, venuesTabFixture(), "06-venues-tab.png");
  await screenshotHtml(page, eventsTabFixture(), "07-events-tab.png");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
