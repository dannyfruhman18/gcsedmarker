-- Allow anonymous visibility of pending_payment subscription rows as well.
-- This keeps browser-side subscription status checks aligned with the app logic.

drop policy if exists public_select_subscriptions on public.subscriptions;

create policy public_select_subscriptions
  on public.subscriptions
  for select
  to anon, authenticated
  using (status in ('active', 'trialing', 'pending_payment'));
