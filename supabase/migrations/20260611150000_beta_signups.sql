-- Website beta signup capture (Android/iOS landing page forms).
-- Inserts are performed by Vercel serverless handlers using the service role.

create table public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  platform text not null check (platform in ('android', 'ios')),
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create unique index beta_signups_email_platform_idx
  on public.beta_signups (lower(trim(email)), platform);

alter table public.beta_signups enable row level security;

comment on table public.beta_signups is
  'Marketing-site beta waitlist/signup emails. Service-role API inserts only.';
