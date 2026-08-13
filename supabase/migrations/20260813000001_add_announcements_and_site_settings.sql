/*
# Add announcements and site_settings tables

1. New Tables
   - `announcements`
     - id (uuid, primary key)
     - text (text, not null) — the announcement message shown in the top bar
     - is_active (boolean, default true) — whether the announcement is visible
     - created_at (timestamp)
     - updated_at (timestamp)
   - `site_settings`
     - id (uuid, primary key)
     - key (text, not null, unique) — setting identifier (e.g. 'hero_background_image')
     - value (text) — setting value
     - label (text) — human-friendly label
     - description (text) — help text
     - created_at (timestamp)
     - updated_at (timestamp)

2. Security
   - RLS enabled on both tables
   - anon can SELECT active announcements and all settings
   - anon can INSERT/UPDATE/DELETE (matching existing permissive pattern)
*/

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  label text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Policies for announcements
DROP POLICY IF EXISTS "anon_select_announcements" ON announcements;
CREATE POLICY "anon_select_announcements" ON announcements FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "anon_all_announcements" ON announcements;
CREATE POLICY "anon_all_announcements" ON announcements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Policies for site_settings
DROP POLICY IF EXISTS "anon_select_site_settings" ON site_settings;
CREATE POLICY "anon_select_site_settings" ON site_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_all_site_settings" ON site_settings;
CREATE POLICY "anon_all_site_settings" ON site_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Seed: initial announcement (only if no active announcement exists)
INSERT INTO announcements (text, is_active)
SELECT
  '⚡ FREE SHIPPING NATIONWIDE ⚡  •  QUALITY STREETWEAR FROM BANGLADESH  •  NEW ARRIVALS EVERY WEEK  •',
  true
WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE is_active = true);

-- Seed: hero background image setting
INSERT INTO site_settings (key, value, label, description)
VALUES
  (
    'hero_background_image',
    'https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=1600',
    'Hero Background Image',
    'Background image URL for the hero banner on the homepage (recommended 1600x1000px)'
  )
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE site_settings.value IS NULL;
