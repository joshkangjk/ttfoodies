-- ============================================================================
-- TTFoodie: Share Inbox + Profiles Setup
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- 1. Create profiles table (if it doesn't exist) with a share_token
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Auto-create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for existing users
INSERT INTO profiles (id)
SELECT id FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 2. Create the share_inbox table
CREATE TABLE IF NOT EXISTS share_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE share_inbox ENABLE ROW LEVEL SECURITY;

-- Users can read their own inbox
CREATE POLICY "Users can read own inbox"
  ON share_inbox FOR SELECT
  USING (auth.uid() = user_id);

-- The API route uses service role key, so RLS is bypassed for writes.
-- But add a policy for the PWA to read via the anon key too:
CREATE POLICY "Users can update own inbox"
  ON share_inbox FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-cleanup: delete processed shares older than 1 hour
-- (Optional: run via Supabase Cron or pg_cron)
