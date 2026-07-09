-- Fixes the delete+insert race in weight saving: enforce one entry per user
-- per day so the client can use an atomic upsert (onConflict: 'user_id,date').
-- Run this in the Supabase SQL Editor (or via `supabase db push`) BEFORE
-- deploying the updated app.

-- 1. Remove any duplicates that the old delete+insert flow may have created,
--    keeping the most recently created entry for each (user_id, date).
DELETE FROM public.weight_entries a
USING public.weight_entries b
WHERE a.user_id = b.user_id
  AND a.date = b.date
  AND a.created_at < b.created_at;

-- 2. Enforce uniqueness going forward.
ALTER TABLE public.weight_entries
  ADD CONSTRAINT weight_entries_user_id_date_key UNIQUE (user_id, date);
