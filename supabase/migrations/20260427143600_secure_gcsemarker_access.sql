alter table public.marking_sessions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.marking_sessions enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists public_select_marking_sessions on public.marking_sessions;
drop policy if exists public_insert_marking_sessions on public.marking_sessions;
drop policy if exists public_select_subscriptions on public.subscriptions;
drop policy if exists public_insert_subscriptions on public.subscriptions;
drop policy if exists owner_update_marking_sessions on public.marking_sessions;
drop policy if exists owner_update_subscriptions on public.subscriptions;

create policy owner_select_marking_sessions
on public.marking_sessions
for select
to authenticated
using (auth.uid() = user_id);

create policy owner_insert_marking_sessions
on public.marking_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy owner_update_marking_sessions
on public.marking_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy owner_select_subscriptions
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

create policy owner_insert_subscriptions
on public.subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy owner_update_subscriptions
on public.subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
