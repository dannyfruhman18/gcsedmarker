create extension if not exists pgcrypto;

create table if not exists public.marking_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  exam_board text not null,
  mode text not null,
  question_text text not null default '',
  answer_text text not null default '',
  upload_name text,
  score integer,
  feedback jsonb not null default '{}'::jsonb
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  plan text not null,
  status text not null,
  provider text not null default 'stripe_link',
  notes text
);

alter table public.marking_sessions enable row level security;
alter table public.subscriptions enable row level security;

create policy "public read marking_sessions"
  on public.marking_sessions
  for select
  using (true);

create policy "public insert marking_sessions"
  on public.marking_sessions
  for insert
  with check (true);

create policy "public read subscriptions"
  on public.subscriptions
  for select
  using (true);

create policy "public insert subscriptions"
  on public.subscriptions
  for insert
  with check (true);
