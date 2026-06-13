# Partner portal backend

The public partner portal at `/partner` uses Supabase Auth plus self-service RPCs. This repo ships the migration and UI; the shared Kami Supabase project hosts the data and functions.

## Deploy checklist

1. Apply migrations to the Kami Supabase project (in order):
   - `supabase/migrations/20260613120000_partner_portal.sql`
   - `supabase/migrations/20260613190000_partner_program_parameters_auth_hardening.sql` — **required before external partner testing** (revokes anon execute on program parameters RPC; enforces partner membership)
2. On the **kami-landing-page** Vercel project, set:
   - `SUPABASE_ANON_KEY` (or use `assets/supabase-browser-public.js`)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; used by `/api/partner/*` for password reset)
   - `SUPABASE_URL` (optional; defaults to production project URL)
4. Add `https://kamisocial.com/partner` and `https://kamisocial.com/password-reset` to Supabase Auth redirect URLs.
5. **Link venues during partner onboarding** — use `kami_admin_link_partner_venue` or `kami_admin_create_partner_from_place`. Partners without venue links see the intentional empty state.
6. **Legal review** — confirm `assets/partner/agreements/partner_terms_v1.js` before requiring acceptance.
7. Redeploy landing-page after env + migration are in place.
8. **Post-deploy smoke test** — log in as a live partner account and walk agreement gate → Venues → Events tabs.

## RPCs (authenticated)

| RPC | Purpose |
|-----|---------|
| `get_my_partner_memberships` | Lists partner accounts the user belongs to (multi-partner support) |
| `get_my_partner_agreement_status` | Returns `not_partner`, `agreement_required`, or `dashboard` |
| `get_my_partner_dashboard` | Header, venues[], readiness, referral link, program terms |
| `get_my_partner_events` | Upcoming events across all linked venues |
| `accept_my_partner_agreement` | Stores agreement snapshot (requires `p_partner_id`) |
| `kami_build_partner_program_parameters` | Program copy + partner-specific rates (authenticated partner members only) |

## RPCs (public / anon)

| RPC | Purpose |
|-----|---------|
| `kami_partner_forgot_password_check` | Validates email belongs to a partner member before reset |

## Reused existing backend

- `partners`, `partner_members`, `partner_venues`
- `partner_program_settings`, `partner_agreement_acceptances`
- `promotion_links` (`link_type = partner_referral`)
- `places`, `events`
- `kami_resolve_auth_app_user_id`, `kami_partner_member_has_access`

## API routes (Vercel)

| Route | Notes |
|-------|------|
| `POST /api/partner/forgot-password` | Validates partner membership, sends reset link |
| `POST /api/partner/accept-agreement` | Forwards to RPC; captures IP + User-Agent |

## Agreement versioning

Agreement text lives in `assets/partner/agreements/`. When legal publishes a new version:

1. Add `partner_terms_v2.js` (or similar).
2. Register it in `assets/partner/agreements/index.js`.
3. Set `partner_program_settings.current_agreement_version` to the new version.
4. Partners without an acceptance for that version see the agreement flow again.

## Known gaps (V1)

- **Partner earnings / payouts**: Not implemented. Do not surface in portal.
- **Venue linking at onboarding**: Admin must link venues via `kami_admin_link_partner_venue` or `kami_admin_create_partner_from_place`.
- **Welcome email**: Not wired from this repo (unlike ambassador welcome).
- **Legal review**: Agreement text in `partner_terms_v1.js` should be confirmed before launch.

See also: [`docs/partner-portal-discovery.md`](./partner-portal-discovery.md), [`docs/partner-portal-v1-implementation-notes.md`](./partner-portal-v1-implementation-notes.md).
