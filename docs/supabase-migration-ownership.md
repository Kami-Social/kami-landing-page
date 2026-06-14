# Supabase migration ownership

This repo shares one Supabase project with the main Kami app. Migration history must stay aligned with production, or CLI tools will report drift and block pushes.

## Canonical owner

The **main `kami` repo** is the canonical owner for Supabase migrations going forward.

All routine schema, RPC, policy, and storage changes should be authored, reviewed, and applied from that repo first.

## Landing-page repo rule

This **landing-page repo should not create Supabase migrations by default.**

Portal and static-site work here should consume schema that already exists in production. Treat the main `kami` repo as the source of truth for database evolution.

## When portal work needs database changes

1. Create and apply the migration in the **main `kami` repo**.
2. Verify it is applied to the linked Supabase project.
3. Update landing-page code (RPC calls, types, portal UI) to use the new schema.
4. Do **not** add a parallel migration file here unless you are handling an documented emergency (see below).

## Emergency exceptions

If landing-page must ship a database change before the main repo can catch up:

- Add a migration here only with an explicit note in the PR/commit explaining why.
- Reconcile immediately: port the same change to the main `kami` repo so both codebases and histories converge.
- Run a migration audit before any `supabase db push` from this repo.

## CLI hygiene

- Do **not** run `supabase db push` from landing-page unless migration history has been verified clean (`supabase migration list` shows no unexpected local-only pending versions).
- Prefer `supabase migration list` and targeted queries over blind pushes when history has diverged in the past.
- Keep migration audit artifacts (dumps, repair logs, reconcile notes) **out of git**. The `backups/` directory is gitignored for this reason.

## Why this matters

Two repos previously applied equivalent portal changes under different migration version IDs. That caused CLI drift even when production schema was correct. Centralizing ownership in `kami` prevents duplicate histories and makes repair/reconciliation the exception, not the norm.
