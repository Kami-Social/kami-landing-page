# Google Admin setup — Android beta group automation

This site adds Android beta signups to the Google Group **`android-beta@kamisocial.com`** via a serverless API (`POST /api/beta/android`). Credentials never reach the browser.

## Overview

1. User submits email on the landing page.
2. `POST /api/beta/android` validates and normalizes the email.
3. (Optional) Email is stored in Supabase `beta_signups` when `SUPABASE_SERVICE_ROLE_KEY` is set.
4. Server uses **Google Admin SDK Directory API** to add the email as a **MEMBER** of the group.
5. Client shows success and the Google Play link.

## 1. Create a Google Cloud project & service account

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project for Kami Workspace automation.
3. Go to **APIs & Services → Library** and enable **Admin SDK API**.
4. Go to **APIs & Services → Credentials → Create credentials → Service account**.
5. Create a service account (e.g. `kami-android-beta-signup`).
6. Open the service account → **Keys → Add key → JSON**. Download the JSON key file.
   - Store it securely. **Do not commit it to git.**
7. Note the service account **Client ID** (numeric) from the service account details page.

From the JSON key:

| Env var | JSON field |
| -------- | ----------- |
| `GOOGLE_WORKSPACE_CLIENT_EMAIL` | `client_email` |
| `GOOGLE_WORKSPACE_PRIVATE_KEY` | `private_key` (paste into Vercel as one line with `\n` for newlines) |

## 2. Enable domain-wide delegation

1. In Google Cloud, open the service account → **Advanced settings**.
2. Enable **Domain-wide delegation**.
3. Copy the service account **Client ID**.

## 3. Authorize the scope in Google Admin Console

1. Sign in to [Google Admin Console](https://admin.google.com/) as a super admin.
2. Go to **Security → Access and data control → API controls → Domain-wide delegation**.
3. Click **Add new** (or **Manage Domain Wide Delegation**).
4. Enter the service account **Client ID**.
5. Add this OAuth scope (exactly):

```
https://www.googleapis.com/auth/admin.directory.group.member
```

6. Save.

## 4. Choose an admin user to impersonate

The API acts on behalf of a Workspace admin who can manage group membership.

Set:

```
GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL=you@kamisocial.com
```

Use a super admin or a delegated admin with permission to manage the `android-beta@kamisocial.com` group.

## 5. Confirm the Google Group

Ensure the group exists in Admin Console → **Directory → Groups**:

```
android-beta@kamisocial.com
```

Group settings should allow adding external members if testers use non-`@kamisocial.com` addresses.

## 6. Vercel environment variables

In the Vercel project for `kamisocial.com`, add:

| Variable | Example / notes |
| -------- | ---------------- |
| `GOOGLE_WORKSPACE_CLIENT_EMAIL` | `kami-android-beta-signup@....iam.gserviceaccount.com` |
| `GOOGLE_WORKSPACE_PRIVATE_KEY` | Full PEM private key; use `\n` for line breaks in Vercel UI |
| `GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL` | `benji@kamisocial.com` |
| `GOOGLE_ANDROID_BETA_GROUP_EMAIL` | `android-beta@kamisocial.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | (optional) For `beta_signups` table |
| `SUPABASE_URL` | (optional) Supabase project URL |

**Never** add these to `index.html` or any client-side code.

## 7. Deploy

1. Merge and deploy to Vercel (or redeploy after env changes).
2. Test:

```bash
curl -X POST https://www.kamisocial.com/api/beta/android \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","source":"website"}'
```

Expected success:

```json
{ "success": true, "message": "Added to Android beta group" }
```

If the email is already a member:

```json
{ "success": true, "message": "Already in Android beta group" }
```

Verify in Admin Console → Groups → Kami Android Beta → Members.

## 8. Local & preview API testing

Static `npm run dev` (`serve`) does **not** run Vercel functions. Use:

```bash
npm install
npx vercel dev
```

### Temporary Google Group test endpoint

`POST /api/test-google-group` — adds an email directly to the group (no Supabase). **Remove or protect before long-term production.**

**Preview deployment** (replace with your Vercel preview URL):

```bash
curl -X POST "https://YOUR-PREVIEW-URL.vercel.app/api/test-google-group" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

**Production** (after deploy):

```bash
curl -X POST "https://www.kamisocial.com/api/test-google-group" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com"}'
```

**Android beta signup** (full flow with optional Supabase capture):

```bash
curl -X POST "https://www.kamisocial.com/api/beta/android" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","source":"website"}'
```

Then POST to `http://localhost:3000/api/test-google-group` with the same env vars in a local `.env` file (gitignored).

## Troubleshooting

| Symptom | Likely cause |
| -------- | ------------- |
| `503` / not configured | Missing Google env vars on Vercel |
| `403` from Google | Domain-wide delegation scope not authorized, or impersonated admin lacks permission |
| `404` from Google | Wrong group email |
| Member not visible | Wrong group, or external member pending acceptance |
| Supabase insert fails | `beta_signups` table not created — see `docs/beta-signups.md` |

Logs in Vercel Functions omit credentials; check function logs for `[google-group]` or `[beta-signup-store]` prefixes.

## Security

- Server-only endpoint; no Google SDK in the browser.
- Basic rate limiting per IP and per email (in-memory per function instance).
- Request body size capped at 8 KB.
- Idempotent when the email is already a group member.
