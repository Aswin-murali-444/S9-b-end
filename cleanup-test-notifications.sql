-- Clean up test/demo notifications that may have invalid dates or test data
-- Run this in Supabase SQL Editor

-- Delete notifications with test data in title or message
DELETE FROM public.notifications
WHERE 
  title ILIKE '%test%' 
  OR title ILIKE '%sample%'
  OR message ILIKE '%test team%'
  OR message ILIKE '%sample service%'
  OR message ILIKE '%Test Team%'
  OR message ILIKE '%Sample Service%'
  OR metadata->>'test' = 'true';

-- Delete notifications with invalid/null created_at (they cause "Invalid Date")
DELETE FROM public.notifications
WHERE created_at IS NULL;

-- Update any notifications with invalid created_at to current timestamp
UPDATE public.notifications
SET created_at = NOW()
WHERE created_at IS NULL OR created_at < '2020-01-01'::timestamp;

-- Verify cleanup
SELECT 
  COUNT(*) as total_notifications,
  COUNT(CASE WHEN created_at IS NULL THEN 1 END) as null_dates,
  COUNT(CASE WHEN title ILIKE '%test%' OR message ILIKE '%test%' THEN 1 END) as test_notifications
FROM public.notifications;
