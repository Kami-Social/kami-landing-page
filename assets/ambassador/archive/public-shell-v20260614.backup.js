/**
 * Backup of the ambassador logged-out public shell (pre–June 2026 landing redesign).
 * Previously inlined in assets/ambassador/app.js as renderPublicShell().
 * Restored from commit state ~20260614.
 */
export function renderPublicShellBackupHTML({ misconfigured = false } = {}) {
  const misconfiguredHtml = misconfigured
    ? `<div class="msg err">This page could not load Supabase configuration. Set <strong>SUPABASE_ANON_KEY</strong> on the Vercel project or add the anon key to <code>assets/supabase-browser-public.js</code>.</div>`
    : "";

  return `
    <section class="hero-block">
      <img class="hero-logo" src="/assets/k-mark-transparent.png" alt="Kami" width="72" height="72" />
      <div class="eyebrow">Kami Ambassador Program</div>
      <h1>Help grow the Kami network.</h1>
      <p class="hero-copy">Earn rewards for introducing people to Kami and helping build stronger real-world communities.</p>
      <ul class="hero-benefits" aria-label="Program benefits">
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
          <span>Referral Rewards</span>
        </li>
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg>
          <span>Early Feature Access</span>
        </li>
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
          <span>Help Shape Kami</span>
        </li>
        <li>
          <svg class="hero-benefit-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>Grow the Network</span>
        </li>
      </ul>
    </section>
    <section class="panel login-panel">
      <h2>Ambassador Login</h2>
      ${misconfiguredHtml}
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
  `;
}
