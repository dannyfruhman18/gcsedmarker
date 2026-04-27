alter table public.marking_sessions enable row level security;
alter table public.subscriptions enable row level security;

do $$
begin
  create policy "public_select_marking_sessions"
  on public.marking_sessions
  for select
  using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_insert_marking_sessions"
  on public.marking_sessions
  for insert
  with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_select_subscriptions"
  on public.subscriptions
  for select
  using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_insert_subscriptions"
  on public.subscriptions
  for insert
  with check (true);
exception
  when duplicate_object then null;
end $$;
