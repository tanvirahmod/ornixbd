/*
# Create feedback table for customer messages

1. New Tables
- `feedback`
  - `id` (uuid, primary key)
  - `name` (text, not null) — sender's name
  - `email` (text, not null) — sender's email
  - `message` (text, not null) — the feedback message
  - `created_at` (timestamptz, default now())
  - `read` (boolean, default false) — tracks whether admin has read the message

2. Security
- Enable RLS on `feedback`.
- Allow anon + authenticated INSERT (customers submit feedback without signing in).
- Allow anon + authenticated SELECT and DELETE (admin panel reads/deletes via anon key — single-tenant no-auth app).
*/

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_feedback" ON feedback;
CREATE POLICY "anon_select_feedback"
ON feedback FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_feedback" ON feedback;
CREATE POLICY "anon_insert_feedback"
ON feedback FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_feedback" ON feedback;
CREATE POLICY "anon_update_feedback"
ON feedback FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_feedback" ON feedback;
CREATE POLICY "anon_delete_feedback"
ON feedback FOR DELETE
TO anon, authenticated USING (true);
