# Partner Portal V1 — Implementation Notes

**Branch:** `feature/partner-portal-discovery`  
**Date:** 2026-06-13

## What was built

Partner Portal V1 at `/partner` — onboarding, status, multi-venue visibility, referral link, program terms, and cross-venue events list. No analytics, earnings, or charts.

## Routes added

| Route | File |
|-------|------|
| `/partner` | `partner/index.html` |
| `POST /api/partner/accept-agreement` | `api/partner/accept-agreement.js` |
| `POST /api/partner/forgot-password` | `api/partner/forgot-password.js` |

Rewrites added to `vercel.json` and `serve.json`.

## Data sources

| UI section | RPC / table |
|------------|-------------|
| Partner header | `get_my_partner_dashboard` → `partners`, `partner_members` |
| Venues list | `get_my_partner_dashboard` → `partner_venues` + `places` |
| Readiness checklist | Derived in `get_my_partner_dashboard` |
| Referral program | `promotion_links` (`partner_referral`) |
| Program terms | `kami_build_partner_program_parameters` + `partner_program_settings` |
| Events tab | `get_my_partner_events` → `partner_venues` + `places` + `events` |
| Agreement gate | `get_my_partner_agreement_status`, `accept_my_partner_agreement` |
| Multi-partner switch | `get_my_partner_memberships` |

## Migration required

Apply to Kami Supabase project:

```
supabase/migrations/20260613120000_partner_portal.sql
```

**Production status (2026-06-13):** Applied safely. Verified via `list_migrations` and `pg_proc` query — all seven partner portal functions exist.

### Exact production changes

| Change | Detail |
|--------|--------|
| `partner_program_settings` UPDATE | Backfilled null/empty `qualification_requirements`, `compensation_rate`, and `payout_schedule` for active settings row |
| `kami_build_partner_program_parameters(uuid)` | Returns program copy + partner rate/threshold for agreement and dashboard |
| `get_my_partner_memberships()` | Lists partner accounts for current user (multi-partner switcher) |
| `get_my_partner_agreement_status(uuid?)` | Returns `not_partner`, `agreement_required`, or `dashboard` |
| `accept_my_partner_agreement(...)` | Stores agreement + program parameter snapshot |
| `get_my_partner_dashboard(uuid)` | Header, `venues[]`, readiness checklist, referral link, program terms |
| `get_my_partner_events(uuid)` | Upcoming events across all linked venues |
| `kami_partner_forgot_password_check(text)` | Public RPC: validates email is a partner member before reset |

Applied to production as migration versions `20260613154838`–`20260613154940` (fragmented apply during implementation). The repo file `20260613120000_partner_portal.sql` is the canonical source for other environments.

**No destructive DDL:** No tables dropped, no columns removed, no RLS policies weakened. Only function definitions and a settings copy UPDATE.

## QA pass (pre-commit, 2026-06-13)

### Security

- `SUPABASE_SERVICE_ROLE_KEY` appears only in server-side `api/` helpers (`api/partner/forgot-password.js` via `createAdminClient`). **Not** in `assets/partner/*`, `partner/index.html`, or client bundles.
- Browser uses anon/publishable key via `assets/supabase-browser-public.js` and `/api/supabase-public`.
- `.env*` files are gitignored; QA env pulls were not committed.

### Local `/partner` verification

| State | Result |
|-------|--------|
| Logged-out login shell | Pass — screenshot `01-login.png` |
| Forgot password (invalid email) | Pass — RPC + UI dialog `02-forgot-password-invalid.png` |
| Forgot password (unknown email) | Pass — `03-forgot-password-not-found.png` |
| Agreement gate | Pass — fixture render matches production RPC shape `04-agreement-gate.png` |
| Empty venues | Pass — Stephanie partner (0 venues) `05-empty-venues.png` |
| Venues tab (multi-venue) | Pass — Mike Rowan (2 venues) `06-venues-tab.png` |
| Events tab (empty) | Pass — `07-events-tab.png` |
| Multi-partner switcher | **Not testable** — no user belongs to multiple partner accounts in production data |

### V1 scope guard

No analytics, earnings, payout history, charts, ambassador metrics, or speculative metrics in partner UI. Program terms mention payout threshold/schedule as informational copy only (not earnings dashboard).

### Post-deploy manual check

After deploy, log in as `bensdecker+2@gmail.com` (Mike Rowan) or `mendezzjjesse210@gmail.com` (Stephanie) to confirm live agreement gate → dashboard flow with production auth. Both partners currently have unsigned agreements in production.

## Screenshots

Captured in `docs/partner-portal-screenshots/`:

1. `01-login.png` — logged out
2. `02-forgot-password-invalid.png` — forgot password validation
3. `03-forgot-password-not-found.png` — unknown email
4. `04-agreement-gate.png` — agreement required
5. `05-empty-venues.png` — no linked venues
6. `06-venues-tab.png` — multi-venue grid
7. `07-events-tab.png` — events empty state

Regenerate: `npx serve . -p 3456` then `node scripts/capture-partner-portal-screenshots.mjs`

Authenticated QA session (requires local `SUPABASE_SERVICE_ROLE_KEY`): `node scripts/qa-partner-portal-session.js <partner-email>`

## Admin updates recommended

1. **Link venues when creating partners** — Use `kami_admin_create_partner_from_place` or `kami_admin_link_partner_venue` after partner creation. Current test partners were created without venue links (admin workflow gap, not portal bug).

2. **Review program settings** — Migration seeds default copy for null fields in `partner_program_settings`. Admins should review and customize via admin tooling or SQL.

3. **Supabase Auth redirect URLs** — Add `/partner` and password-reset redirect if partners will reset passwords from the portal.

4. **Legal review** — Confirm `assets/partner/agreements/partner_terms_v1.js` before requiring acceptance in production.

## Known platform gaps (documented, not fixed in V1)

### 1. Partners without linked venues

**Finding:** Admin workflow issue. `kami_admin_create_partner_from_user` creates the partner and referral link but does not require a venue link. Both live test partners had zero `partner_venues` rows.

**Portal behavior:** Shows intentional empty state with support contact. Readiness checklist shows "Venue linked" and "Venue published" as incomplete.

**Recommendation:** Update admin partner creation flow to require or prompt venue linkage. Not blocking portal launch.

### 2. Partner program settings had null copy

**Finding:** Seed/migration issue in original `partners_admin_foundation`. Qualification and compensation text were null.

**V1 fix:** Migration `20260613120000_partner_portal.sql` backfills defaults via `UPDATE ... WHERE is_active = true`. UI also uses fallbacks in `kami_build_partner_program_parameters` and frontend `terms-summary.js`.

### 3. Partner referral earnings do not accrue

**Current behavior:**

- `kami_record_referral_signup` records signups for `partner_referral` links (`participant_source_type = 'partner'`).
- `kami_qualify_referral` awards user points and ambassador bounties only for `bounty_referral` / approved ambassadors.
- **No partner cash accrual** runs on qualification.
- `partners.rate_cents_per_registration` is display-only today.
- `partner_payments` has no automated source.

**V1 decision:** No earnings UI. Portal shows signup count only.

**Future requirements:**

1. Extend `kami_qualify_referral` (or add partner-specific path) to accrue partner earnings on qualified `partner_referral` attributions.
2. Add partner earnings columns or ledger (mirror `ambassador_profiles` / `bounty_ledger_entries` pattern).
3. Populate `partner_payments` from approved balances.
4. Add payout history RPC before surfacing in portal.

## Architecture: multi-venue support

- `get_my_partner_dashboard` returns `venues` as a JSON array (all active `partner_venues`).
- UI renders single featured card or multi-column grid based on count.
- `get_my_partner_events` aggregates events across **all** linked venues.
- `get_my_partner_memberships` supports users on multiple partner accounts (selector shown when >1).

## Screenshots

Capture after deploy or local serve:

1. Login screen — `/partner` logged out
2. Forgot password dialogs — invalid / not found
3. Agreement flow — partner before acceptance
4. Venues tab — empty venues state (no linked venues)
5. Venues tab — with referral + readiness (after agreement)
6. Events tab — empty state

Run locally: `npx serve . -p 3456` then `node scripts/capture-partner-portal-screenshots.mjs`

See `docs/partner-portal-screenshots/` for captured QA images (2026-06-13).

## Files added

```
partner/index.html
assets/partner/app.js
assets/partner/styles.css
assets/partner/format.js
assets/partner/terms-summary.js
assets/partner/agreements/partner_terms_v1.js
assets/partner/agreements/index.js
api/partner/accept-agreement.js
api/partner/forgot-password.js
supabase/migrations/20260613120000_partner_portal.sql
docs/partner-portal-backend.md
docs/partner-portal-v1-implementation-notes.md
```
