-- Time Leak Quiz tables. Run once in the Supabase SQL editor.
-- Anonymous answers and contact details are kept in separate tables.
-- Row Level Security is on with no public policies: only the server
-- (service role key in Vercel env vars) can read or write.

create extension if not exists pgcrypto;

create table if not exists public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  answers jsonb not null,
  business_type text,
  team_size text,
  hours_per_week numeric,
  monthly_cost integer,
  recoverable_low integer,
  recoverable_high integer,
  missed_revenue integer,
  friction integer,
  tier text,
  top_leaks text[],
  change_feeling text
);

create table if not exists public.quiz_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  response_id uuid references public.quiz_responses(id) on delete set null,
  first_name text not null,
  email text not null,
  business_name text,
  consent boolean not null default false,
  consent_text text,
  unsubscribed_at timestamptz
);

create index if not exists quiz_leads_email_idx on public.quiz_leads (email);

alter table public.quiz_responses enable row level security;
alter table public.quiz_leads enable row level security;
-- No policies on purpose. The anon key cannot read or write either table.
