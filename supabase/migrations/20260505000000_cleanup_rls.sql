do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('marking_sessions', 'subscriptions')
  loop
    execute format('drop policy if exists %I on public.%I', policy_record.policyname, policy_record.tablename);
  end loop;
end $$;

alter table public.marking_sessions enable row level security;
alter table public.subscriptions enable row level security;

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
