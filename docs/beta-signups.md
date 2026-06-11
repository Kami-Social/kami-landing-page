# Beta signups

## Android (implemented)

**Endpoint:** `POST /api/beta/android`

**Flow:**

1. Validate and normalize email (lowercase).
2. Insert into Supabase `beta_signups` when `SUPABASE_SERVICE_ROLE_KEY` is configured (skipped if not). Storage failures are logged but do not block step 3.
3. Add member to Google Group via Admin SDK (`GOOGLE_ANDROID_BETA_GROUP_EMAIL`, default `android-beta@kamisocial.com`).
4. Return JSON `{ success: true, message: "..." }`.

**Setup:** See [google-admin-android-beta-setup.md](./google-admin-android-beta-setup.md).

**Frontend:** Mock signup on `localhost` only; production calls the API.

## iOS (not implemented)

**Endpoint:** `POST /api/beta/ios` (planned)

Store signup and optional TestFlight invite queue.

## Supabase table

Migration: `supabase/migrations/20260611150000_beta_signups.sql`

| Field        | Type        | Notes                                      |
| ------------ | ----------- | ------------------------------------------ |
| `id`         | uuid        | Primary key                                |
| `email`      | text        | Normalized (trimmed, lowercased) on insert |
| `platform`   | text        | `android` or `ios`                         |
| `source`     | text        | Default `website`                          |
| `created_at` | timestamptz | Server default `now()`                     |

If `SUPABASE_SERVICE_ROLE_KEY` is not set, storage is skipped and signup proceeds to Google Group add. If it is set but insert fails (other than duplicate email), the failure is logged and signup still proceeds to Google Group add.

## Environment variables (Android)

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `GOOGLE_WORKSPACE_CLIENT_EMAIL` | Yes | Service account email |
| `GOOGLE_WORKSPACE_PRIVATE_KEY` | Yes | Service account PEM key |
| `GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL` | Yes | Admin user to impersonate |
| `GOOGLE_ANDROID_BETA_GROUP_EMAIL` | No | Default `android-beta@kamisocial.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Persist signups |
| `SUPABASE_URL` | No | Supabase project URL |

## Security

- Never expose Google or Supabase service credentials in the static site.
- Do not reference Google Groups or Play Console mechanics in user-facing copy.
