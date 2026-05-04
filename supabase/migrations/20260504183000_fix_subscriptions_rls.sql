-- Fix RLS for subscriptions table to allow public access for the demo
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public select subscriptions" ON subscriptions;
CREATE POLICY "Public select subscriptions" ON subscriptions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert subscriptions" ON subscriptions;
CREATE POLICY "Public insert subscriptions" ON subscriptions FOR INSERT WITH CHECK (true);
GRANT SELECT, INSERT ON subscriptions TO anon, authenticated;
