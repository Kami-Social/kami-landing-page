# Partner Portal Discovery & Product Recommendation

**Branch:** `feature/partner-portal-discovery`  
**Date:** 2026-06-13  
**Status:** Discovery complete — no implementation in this branch  
**Scope:** Product design and architecture review only

---

## Executive Summary

Kami has a **solid partner backend foundation** in the shared Supabase project (10 partner tables, admin RPCs, referral link generation, agreement acceptance, venue analytics RPC). What does **not** exist yet is a partner-facing portal equivalent to the shipped ambassador portal at `/ambassador`.

The biggest surprise: **partner economics are modeled in schema but not executed in the referral pipeline.** `partners.rate_cents_per_registration` and `partner_payments` exist, but `kami_qualify_referral` only accrues cash bounties for `bounty_referral` / ambassador links — not `partner_referral`. There are **zero partner referral attributions** in production despite two active partner referral codes.

A second critical gap: **both live partners have no linked venues** (`partner_venues` is empty). Without venue linkage, the portal cannot answer the most basic question a venue owner has: *"Is my place on Kami, and is it live?"*

**Recommendation:** Ship Partner Portal **V1** as a thin, trust-building layer — login, agreement, identity confirmation, referral link, and support contact — mirroring the ambassador portal pattern. Defer earnings dashboards, visit analytics, and event metrics until venue linkage and referral economics are wired and populated. Avoid building a metrics-heavy SaaS dashboard; most proposed “analytics” would show zeros or misleading signals today.

---

## Investigation Method

| Source | What was reviewed |
|--------|-------------------|
| **Supabase (Kami project `bscnpilzmilzabagnypx`)** | Table schemas, row counts, RPC definitions, RLS policies, sample data |
| **This repo (`kami-landing-page`)** | Ambassador portal pattern (`/ambassador`, migrations, API routes, docs) |
| **Applied migrations** | `partners_admin_foundation`, `partner_outreach_limit_per_profile`, `partner_create_from_user`, `partner_referral_code_lowercase`, `partner_create_active`, `partner_welcome_email` |

Partner migrations live in the main Kami Supabase project, not in this landing-page repo (same pattern as ambassador backend).

---

## 1. Existing Partner Infrastructure

### 1.1 Partner Tables — Schema & Population

| Table | Rows (2026-06-13) | Purpose | Populated? | Partner-portal ready? |
|-------|-------------------|---------|------------|------------------------|
| `partners` | 2 | Partner org profile, rates, agreement, outreach flag | Test partners only | Partial — no earnings totals |
| `partner_members` | 2 | Users with roles (`owner`, `manager`, `staff`) | Yes (owners only) | Yes |
| `partner_venues` | **0** | Links partner ↔ `places` | **Empty** | **Blocked** |
| `partner_events` | 0 | Partner ↔ event associations | Empty | Not used |
| `partner_outreach_events` | 0 | In-venue connection requests | Empty | Backend only |
| `partner_active_presence` | 0 | Timed “active presence” activations | Empty | Theoretical |
| `partner_payments` | 0 | Payout records | Empty | Schema only |
| `partner_audit_events` | 2 | Admin audit trail | Creation events only | Admin/internal |
| `partner_program_settings` | 1 | Global program copy & agreement version | Seeded, text fields null | Partial |
| `partner_agreement_acceptances` | 0 | Immutable agreement records | Empty | RPC exists |

**Live partner records:** Two `active` venue-type partners created 2026-06-13. Both have `agreement_status = not_sent`, `points_balance = 0`, default `$2.00` rate. Referral codes exist (`partner_referral` links). **Neither has a linked place.**

### 1.2 Partner RPCs

#### Admin-only (require `is_admin()` or service role)

| RPC | Purpose |
|-----|---------|
| `kami_admin_create_partner_from_user` | Create active partner + owner member + referral link |
| `kami_admin_create_partner_from_place` | Create partner and link place (with or without owner) |
| `kami_admin_link_partner_venue` | Link additional venue |
| `kami_admin_add_partner_member` | Add staff; transitions user to partner program |
| `kami_admin_list_partners` | Paginated partner list with venue/member counts |
| `kami_admin_update_partner_status` | Status changes |
| `kami_admin_partner_referral_stats` | Registered + “qualified” referral counts + code |
| `kami_admin_validate_partner_owner_eligibility` | Blocks admin, ambassador, duplicate partner |
| `kami_admin_log_partner_audit_event` | Audit logging |

#### Partner-accessible (authenticated member)

| RPC | Purpose | Portal-ready? |
|-----|---------|---------------|
| `accept_my_partner_agreement` | Agreement acceptance flow | Yes — mirror ambassador |
| `kami_partner_member_has_access` | Access check helper | Internal |
| `kami_partner_venue_analytics` | 7–90 day visit stats from `user_place_presence` | **Yes — needs linked venue** |
| `kami_partner_send_outreach_request` | Send connection request to user present at venue | App feature, not dashboard |

#### Missing (compared to ambassador portal)

Ambassador has a full self-service suite: `get_my_ambassador_agreement_status`, `get_my_ambassador_dashboard`, `get_my_ambassador_referrals`, `get_my_ambassador_payout_history`, etc.

**Partner has none of these `get_my_partner_*` dashboard RPCs.** This is the primary engineering gap for any portal beyond a static page.

### 1.3 RLS & Security Model

All 10 partner tables have **admin-only RLS** (no direct client table access). This matches the ambassador pattern: partners reach data only through `SECURITY DEFINER` RPCs scoped by `kami_partner_member_has_access` or `kami_resolve_auth_app_user_id()`.

**Trustworthy for portal:** Yes, if new RPCs follow the same pattern.

### 1.4 Referral Attribution Logic

```
Signup:  kami_record_referral_signup(code, user_id)
         → sets participant_source_type = 'partner' for partner_referral links
         → increments promotion_links.signup_count

Qualify: kami_qualify_referral(attribution_id)
         → awards user points to referrer (if configured)
         → bounty_ledger_entries ONLY for link_type = 'bounty_referral' + approved ambassador
         → NO partner cash accrual, NO update to partners.points_balance
```

Partner referral links (`link_type = 'partner_referral'`) store `partner_id` on `promotion_links`. Codes are auto-created via `kami_ensure_partner_referral_link` when an owner member is added.

**Admin stats RPC** (`kami_admin_partner_referral_stats`) counts attributions but uses a loose “qualified” filter (non-test, non-removed users) — not the same as `referral_attributions.status = 'qualified'`.

| Metric | Available? | Trustworthy today? |
|--------|------------|-------------------|
| Referral code | Yes (2 active) | Yes |
| Signups (`signup_count`) | Yes | Yes, when signups occur |
| Qualified referrals (status) | Theoretically | **No partner signups yet** |
| Partner earnings | Schema (`rate_cents_per_registration`) | **Not calculated anywhere** |
| Payout status | `partner_payments` table | **Empty, no accrual pipeline** |

### 1.5 Payout Systems

**Ambassadors:** `ambassador_profiles` tracks `accrued_cents`, `owed_cents`, `paid_cents`; `bounty_ledger_entries` + `ambassador_payments`; full portal history.

**Partners:** `partners` has `rate_cents_per_registration`, `rate_tiers`, `maximum_spend_cents`, `payout_threshold_cents`, `points_balance` — but **no `accrued_cents` / `owed_cents` / `paid_cents` columns** and no partner ledger table. `partner_payments` is admin-recorded payout history with no automated source.

**Conclusion:** Partner payout UI would be fiction until backend accrual is built.

### 1.6 Admin Pages

Partner admin tooling lives in the **Kami admin app** (not this repo). This repo documents the ambassador portal pattern only. Admin can create partners, link venues, view referral stats — but **no partner has a linked venue yet**.

---

## 2. Venue Data Review

### 2.1 Places Inventory

- **31 places** total: 30 active/public, 1 draft/admin_only
- Rich schema: name, description, category, address, geo, photo, points_value, presentation_mode, interest_categories, etc.
- **No `place_followers` table** — follower counts do not exist

### 2.2 Per-Venue Metrics Assessment

| Metric | Available? | Source | Reliable? | Partner-facing? | Notes |
|--------|------------|--------|-----------|-----------------|-------|
| Name, photo, address | Yes | `places` | Yes | Yes | Core identity |
| Published status | Yes | `places.status`, `visibility` | Yes | Yes | High value for “is my venue live?” |
| Points value | Yes | `places.points_value` | Yes | Maybe | Explains user incentives |
| Profile completeness | Derivable | Required fields null check | Yes | Yes | Actionable for onboarding |
| Additional images | Yes | `place_images` | **0 rows** | Later | Not populated |
| Live presence (“here now”) | Yes | `kami_place_presence_count` | Moderate | V1.5 | TTL-based, excludes ghosts |
| Visit analytics (7–90d) | Yes | `kami_partner_venue_analytics` | Moderate | V1.5 | Includes demo presence rows |
| Unique / first-time visitors | Yes | Same RPC | Moderate | V1.5 | Useful once volume exists |
| Busiest day/hour | Yes | Same RPC | Weak at low N | Future | Noisy with <30 visits |
| Wall posts | Yes | `place_wall_posts` (7 total, 1 place) | Low volume | Defer | Moderation concerns |
| Referral revenue | No | — | — | Defer | Not implemented |
| Ambassador activity at venue | Partial | `user_place_presence` | No attribution | Defer | Cannot distinguish ambassadors |
| Follower count | No | — | — | Defer | Table does not exist |

**Presence data (platform-wide):** 97 `user_place_presence` rows across 9 places. Top venue: 28 unique users. This is enough to demo analytics for linked venues in Austin test market, but not enough for partners nationally.

---

## 3. Event Data Review

| Metric | Available? | Meaningful? | Surface now? |
|--------|------------|-------------|--------------|
| Upcoming events at venue | Yes | `kami_place_events_for_venue` | V1.5 — if venue has events |
| Published status | Yes | `events.status` | Yes |
| Event points | Yes | `events.points_value` | Maybe |
| Live event attendance | Yes | `kami_event_presence_count` | Defer — 1 event row, 1 event-presence row |
| Historical attendance | Partial | `user_place_presence` where `event_id` set | Defer — essentially no data |
| Event referrals | No | — | Defer |
| Partner ↔ event link | Schema | `partner_events` empty | Defer |

**Platform state:** 1 published event (“Test Meetup” at Bennu Coffee). Event-specific presence is not mature enough for partner dashboards.

---

## 4. Ambassador Relationship Review

| Question | Finding |
|----------|---------|
| Referral attribution to venue | **No.** Ambassador referrals are user-scoped (`user_referral`), not venue-scoped |
| Ambassadors active at venue | Presence rows exist but **no ambassador flag on presence** |
| Ambassador venue visits | Not tracked separately from any user visit |
| Ambassador ↔ venue connections | **No direct model.** `kami_partner_send_outreach_request` lets a partner member send a connection request to someone physically present — niche in-app feature |
| Ambassador content at venue | `place_wall_posts` — user-generated, not ambassador-specific |

**Recommendation:** **Defer all ambassador insights** in partner portal. Data model does not support “ambassadors who drove traffic to your venue” without significant new engineering and privacy review.

---

## 5. Referral Program Review

### What exists

- Partner referral codes: `https://www.kamisocial.com/invite/{code}` (same invite flow as ambassadors)
- Signup tracking via `referral_attributions` + `promotion_links.signup_count`
- Qualification pipeline shared with ambassadors (pending → qualified)
- Program settings: `partner_program_settings` with `current_agreement_version = partner_terms_v1`, `payout_threshold_cents = 5000` ($50)

### What partners should see vs. keep internal

| Data | Partner-facing? | Rationale |
|------|-----------------|-----------|
| Referral link + code | **Yes (V1)** | Primary growth tool |
| Signup count (aggregate) | **Yes (V1)** | Simple, understandable |
| Individual referred users | **V1.5** | Privacy — show like ambassador portal (name/handle, no PII) |
| Qualification status per referral | **V1.5** | Useful once qualifications happen |
| Dollar earnings / owed / paid | **After backend built** | Would mislead today |
| Payout history | **After backend built** | Table empty |
| Rate tiers / cap | **Yes (V1)** | Shown at agreement acceptance (mirror ambassador) |
| Admin rejection reasons | Internal | Support channel only |

### Confusing elements to avoid

- Showing “qualified referrals” using admin RPC’s loose filter vs. attribution `status`
- Showing `$2/referral` earnings when accrual does not run
- Mixing `partners.points_balance` (unused, always 0) with user points economics

---

## 6. Existing Analytics Review

### Reusable today

| Metric / RPC | Reuse for partners? | Effort |
|--------------|----------------------|--------|
| `kami_partner_venue_analytics` | Direct reuse | Low (RPC exists) |
| `kami_place_presence_count` | “People here now” | Low |
| `kami_place_events_for_venue` | Event list | Low |
| `kami_admin_partner_referral_stats` | Adapt to partner-scoped RPC | Medium |
| Ambassador dashboard RPC pattern | Template for `get_my_partner_*` | Medium |

### Requires significant engineering

- Partner earnings accrual on qualification
- Partner payout lifecycle (`owed` → `partner_payments`)
- Event historical attendance aggregates
- Ambassador-at-venue reporting
- Follower / save metrics
- Cohort / funnel / benchmark analytics

### Weak signals (avoid as launch metrics)

- Busiest hour/day with <50 visits
- Event attendance with single-digit events
- `partner_active_presence` (unused)
- Platform-wide admin metrics shown per-venue without linkage

---

## 7. Recommended Partner Portal V1

> **Goal:** Confirm identity, complete agreement, share referral link, get help.  
> **Not goal:** Analytics dashboard.

### Information Architecture (V1)

```
/partner
├── Auth (login / password reset)
├── Agreement gate (if not signed)
└── Dashboard
    ├── Header (partner name, status, contact email)
    ├── Your venue (or “No venue linked — contact Kami”)
    ├── Referral link (copy/share)
    ├── Program summary (rate, qualification, payout threshold — from settings)
    ├── Agreement & terms
    └── Support (hello@ / partners@ email)
```

### V1 Sections — Detail

#### A. Header / Account

| Element | Why | Data source | Complexity | Business value |
|---------|-----|-------------|------------|----------------|
| Partner display name | Confirm correct account | `partners.display_name` | Low | High |
| Program status | Know if active/suspended | `partners.status` | Low | High |
| Contact email | Account verification | `partners.contact_email` | Low | Medium |

**Decision enabled:** “Am I in the right account?”

#### B. Venue Overview (conditional)

| Element | Why | Data source | Complexity | Business value |
|---------|-----|-------------|------------|----------------|
| Venue name & photo | Confirm place is on Kami | `places` via `partner_venues` | Low | **High** |
| Status (active/public) | Know if discoverable | `places.status`, `visibility` | Low | **High** |
| Profile completeness checklist | Prompt to fix gaps | Derived field null checks | Low | High |
| “No venue linked” state | Set expectations | `partner_venues` empty | Low | **Critical today** |

**Decision enabled:** “Is my venue live on Kami?”

*Note:* Until admin links venues during onboarding, many partners will see the empty state — this is honest and drives ops follow-up.

#### C. Referral Link

| Element | Why | Data source | Complexity | Business value |
|---------|-----|-------------|------------|----------------|
| Referral code & URL | Drive signups | `promotion_links` (`partner_referral`) | Low | **High** |
| Copy / share affordance | Reduce friction | Client-side | Low | High |
| Total signups (number only) | Simple feedback loop | `promotion_links.signup_count` | Low | Medium |

**Decision enabled:** “How do I invite customers to Kami?”

*Do not show earnings in V1.*

#### D. Agreement & Program Terms

| Element | Why | Data source | Complexity | Business value |
|---------|-----|-------------|------------|----------------|
| Agreement acceptance flow | Legal gate | `accept_my_partner_agreement`, `partner_program_settings` | Medium (mirror ambassador) | **Required** |
| Rate & payout threshold | Transparency | `partners.rate_cents_per_registration`, settings | Low | High |
| Program requirements text | Set expectations | `partner_program_settings` (needs admin copy) | Low | Medium |

**Decision enabled:** “What did I agree to?” / “Can I participate?”

#### E. Support

| Element | Why | Data source | Complexity | Business value |
|---------|-----|-------------|------------|----------------|
| Contact link | Human escalation | Static / env | Trivial | High |
| FAQ link (optional) | Reduce support load | Marketing site | Trivial | Medium |

**Decision enabled:** “Who do I ask about my venue or payouts?”

### V1 Engineering Notes (documentation only — not in scope to build)

1. Add RPCs mirroring ambassador: `get_my_partner_agreement_status`, `get_my_partner_dashboard`
2. Portal route at `/partner` on landing-page (same stack as `/ambassador`)
3. API routes for agreement accept, forgot-password (partner-scoped)
4. **Ops prerequisite:** Link `partner_venues` during partner creation
5. Seed `partner_program_settings` qualification/compensation copy (currently null)

---

## 8. Recommended Partner Portal V1.5

Features that add real value once V1 is live and venues are linked.

| Feature | Why | Data source | Complexity | Value |
|---------|-----|-------------|------------|-------|
| **Visit summary (7 days)** | “Are people showing up?” | `kami_partner_venue_analytics` | Low | High |
| **People here now** | Real-time social proof | `kami_place_presence_count` | Low | Medium |
| **Referral list** | See pending vs qualified | `referral_attributions` + RPC | Medium | High |
| **Upcoming events** | Promote happenings | `kami_place_events_for_venue` | Low | Medium (market-dependent) |
| **Payout summary** | Cash motivation | Requires accrual backend first | **High** | High (when wired) |
| **Staff members list** | Multi-user venues | `partner_members` | Low | Medium |
| **Change log** | Transparency on status changes | `partner_audit_events` (filtered) | Medium | Low |

---

## 9. Partner Portal Future (Defer)

| Idea | Why defer |
|------|-----------|
| Advanced visit analytics (cohorts, funnels) | Low data volume; high misinterpretation risk |
| Ambassador leaderboards at venue | No attribution model |
| Traffic source breakdown | Not tracked per venue |
| Comparative benchmarking | Privacy + insufficient baseline |
| Partner profile self-editing | Needs moderation workflow |
| In-portal outreach | Belongs in mobile app (`kami_partner_send_outreach_request`) |
| `partner_active_presence` management | Product undefined; table empty |
| Points balance / partner rewards | `points_balance` unused; unclear product |
| Event attendance dashboards | ~1 event in system |
| Wall post moderation | Admin-only today; liability |

---

## 10. Risks & Assumptions

### Risks

1. **Empty venue links** — Portal V1 venue section will show “not linked” for current partners unless ops links places first.
2. **Referral economics gap** — Showing dollar amounts before accrual pipeline exists will erode trust.
3. **Analytics with demo data** — `user_place_presence` includes `demo` status rows; partners may see inflated counts if not filtered in copy.
4. **Ambassador/partner exclusivity** — Users cannot be both; transitioning deactivates ambassador (`kami_transition_user_to_partner_program`).
5. **Program settings incomplete** — `qualification_requirements` and `compensation_rate` are null in settings row; agreement flow needs copy before launch.
6. **No partner forgot-password flow yet** — Must be built (ambassador pattern exists).

### Assumptions

- Partner portal ships on `kami-landing-page` static site + Supabase Auth (same as ambassador)
- Partners are created by admin today; self-serve signup is out of scope
- Primary partner type is **venue** (`partner_type = 'venue'`)
- Invite URL format remains `https://www.kamisocial.com/invite/{code}`
- Venue owners care most about: (1) being live on Kami, (2) getting referral link, (3) knowing if people visit — in that order

---

## 11. Suggested Information Architecture (Full Vision)

```
/partner
├── Auth
├── Agreement (gate)
└── Home
    ├── Venue          ← V1 identity; V1.5 analytics
    ├── Referrals      ← V1 link; V1.5 list
    ├── Events         ← V1.5 (if events exist)
    ├── Payouts        ← Post-accrual backend
    ├── Team           ← V1.5
    ├── Program terms  ← V1
    └── Settings       ← Future (password, notifications)
```

**V1 can be single-page** (ambassador model) without tabs. Add tabs when V1.5 metrics justify navigation.

---

## 12. Wireframe-Level Section Recommendations

### V1 — Single dashboard page

```
┌─────────────────────────────────────────────┐
│ [Kami logo]                    [Sign out]   │
├─────────────────────────────────────────────┤
│  Partner Name                    ● Active   │
│  contact@venue.com                          │
├─────────────────────────────────────────────┤
│  YOUR VENUE                                 │
│  ┌──────┐  Venue Name                       │
│  │ photo│  Active · Public                   │
│  └──────┘  ✓ Name  ✓ Photo  ○ Description   │
│  — OR —                                     │
│  ⚠ No venue linked. Contact partners@...    │
├─────────────────────────────────────────────┤
│  REFERRAL LINK                              │
│  kamisocial.com/invite/abc123    [Copy]     │
│  0 signups so far                           │
├─────────────────────────────────────────────┤
│  PROGRAM                                    │
│  $2.00 per qualified referral               │
│  Payout threshold: $50                      │
│  [View agreement]                           │
├─────────────────────────────────────────────┤
│  Need help? partners@kamisocial.com         │
└─────────────────────────────────────────────┘
```

### V1.5 — Venue tab addition

```
│  VISITS (last 7 days)                       │
│  12 unique visitors · 18 total visits         │
│  3 first-time visitors                      │
│  (vs 8 unique prior period)                 │
│                                             │
│  HERE NOW: 2 people                         │
```

### V1.5 — Referrals tab

```
│  REFERRALS                                  │
│  Name        Status      Date               │
│  ─────────────────────────────────          │
│  (empty state: share your link above)       │
```

---

## 13. Element Decision Matrix (Required Fields)

| Element | Decision it supports | Data source | Trustworthy? | Actionable? | Effort justified? |
|---------|---------------------|-------------|--------------|-------------|-------------------|
| Venue name/status | Is my place live? | `places` + `partner_venues` | Yes | Yes — contact Kami if wrong | **Yes (V1)** |
| Referral link | How do I grow Kami users? | `promotion_links` | Yes | Yes — share link | **Yes (V1)** |
| Signup count | Is anyone using my link? | `promotion_links.signup_count` | Yes | Yes | **Yes (V1)** |
| Agreement | Can I participate legally? | Agreement RPCs | Yes | Yes — must accept | **Yes (V1)** |
| 7-day visits | Are people coming? | `kami_partner_venue_analytics` | Moderate | Yes — hours, events | **Yes (V1.5)** |
| Here-now count | Is anyone here right now? | `kami_place_presence_count` | Moderate | Somewhat | Yes (V1.5) |
| Referral earnings $ | What do I earn? | Not implemented | **No** | No | **No — defer** |
| Payout history | Was I paid? | `partner_payments` | N/A (empty) | No | **No — defer** |
| Ambassador visits | Are ambassadors helping? | Not tracked | **No** | No | **No — defer** |
| Event attendance | How was my event? | ~no data | **No** | No | **No — defer** |
| Busiest hour | When should I staff up? | Analytics RPC | Weak | Maybe | Future |
| Follower count | How popular am I? | Does not exist | **No** | No | **No** |

---

## 14. Major Findings & Surprises

1. **No `get_my_partner_*` RPCs** — Backend is admin-centric; ambassador portal pattern must be replicated before any UI.
2. **Partners exist without venues** — Both production partners have referral codes but zero `partner_venues` rows.
3. **Partner referral economics not wired** — `$2/registration` on `partners` table is inert; qualification does not create partner payouts.
4. **`partners.points_balance` appears unused** — No code references updating it; do not surface in portal.
5. **`kami_partner_venue_analytics` already exists** — Best near-term metric source; ahead of dashboard RPCs.
6. **Ambassador portal is the blueprint** — Agreement gate, dashboard RPC, Vercel API routes, Resend email — all portable.
7. **Presence data is real but small** — 97 rows / 9 venues; viable for pilot market, not national dashboards.
8. **No follower model** — Common SaaS metric unavailable; do not invent.
9. **Outreach feature is in-app, not portal** — `kami_partner_send_outreach_request` requires physical presence.
10. **Program settings need copy** — Legal/ops must fill `partner_program_settings` before agreement launch.

---

## 15. Recommended Implementation Sequence (Post-Discovery)

For engineering planning only — **not part of this branch.**

| Phase | Work | Depends on |
|-------|------|------------|
| **0 — Ops** | Link venues to partners at creation | Admin workflow |
| **1 — RPCs** | `get_my_partner_agreement_status`, `get_my_partner_dashboard` | — |
| **2 — Portal V1** | `/partner` page + agreement + auth API routes | Phase 1 |
| **3 — Referral accrual** | Extend `kami_qualify_referral` for partners; add owed/paid tracking | Product/legal sign-off |
| **4 — Portal V1.5** | Venue analytics, referral list RPC, events section | Phases 0–3 |
| **5 — Payouts UI** | After accrual + `partner_payments` populated | Phase 3 |

---

## Appendix A: Related Tables (Non-Partner)

| Table | Rows | Relevance |
|-------|------|-----------|
| `places` | 31 | Venue profiles |
| `events` | 1 | Venue events |
| `user_place_presence` | 97 | Visit / presence analytics |
| `place_wall_posts` | 7 | UGC at venues |
| `promotion_links` | 17 | Referral codes |
| `referral_attributions` | 1 | All ambassador, zero partner |
| `ambassador_profiles` | 3 | Reference payout model |
| `point_ledger_entries` | 77 | User points (not partner) |

## Appendix B: Ambassador Portal Reference

See [`docs/ambassador-portal-backend.md`](./ambassador-portal-backend.md) for the established pattern this portal should follow.

## Appendix C: Discovery Queries

Row counts and schema verified via Supabase MCP against project `bscnpilzmilzabagnypx` on 2026-06-13. No production data was modified during discovery.
