alter table public.marking_sessions enable row level security;

do $$
begin
  create policy "public_select_marking_sessions"
  on public.marking_sessions
  for select
  to public
  using (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "public_insert_marking_sessions"
  on public.marking_sessions
  for insert
  to public
  with check (true);
exception
  when duplicate_object then null;
end $$;

grant select, insert on public.marking_sessions to anon, authenticated;
