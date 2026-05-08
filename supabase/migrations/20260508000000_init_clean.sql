create extension if not exists pgcrypto;

create table if not exists public.marking_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  exam_board text not null,
  mode text not null,
  question_text text not null default '',
  answer_text text not null default '',
  upload_name text not null default '',
  score integer not null default 0,
  feedback jsonb not null default '{}'::jsonb
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  plan text not null,
  status text not null default 'active',
  provider text not null default 'stripe_link',
  notes text not null default ''
);

create index if not exists marking_sessions_created_at_idx on public.marking_sessions (created_at desc);
create index if not exists subscriptions_created_at_idx on public.subscriptions (created_at desc);
create index if not exists subscriptions_email_idx on public.subscriptions (email);

alter table public.marking_sessions enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists public_select_marking_sessions on public.marking_sessions;
drop policy if exists public_insert_marking_sessions on public.marking_sessions;
drop policy if exists public_select_subscriptions on public.subscriptions;
drop policy if exists public_insert_subscriptions on public.subscriptions;

create policy public_select_marking_sessions
  on public.marking_sessions
  for select
  to anon, authenticated
  using (true);

create policy public_insert_marking_sessions
  on public.marking_sessions
  for insert
  to anon, authenticated
  with check (true);

create policy public_select_subscriptions
  on public.subscriptions
  for select
  to anon, authenticated
  using (true);

create policy public_insert_subscriptions
  on public.subscriptions
  for insert
  to anon, authenticated
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert on public.marking_sessions to anon, authenticated;
grant select, insert on public.subscriptions to anon, authenticated;
