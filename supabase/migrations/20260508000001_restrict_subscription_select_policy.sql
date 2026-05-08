-- Restrict anonymous visibility of subscription rows to active/trialing records only.
-- Production should still move entitlement checks to authenticated users or a server-side function.

drop policy if exists public_select_subscriptions on public.subscriptions;

create policy public_select_subscriptions
  on public.subscriptions
  for select
  to anon, authenticated
  using (status in ('active', 'trialing'));
