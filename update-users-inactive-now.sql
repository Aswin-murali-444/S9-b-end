-- Update all users to inactive status
-- Run this DIRECTLY in Supabase SQL Editor

-- First, check current status
SELECT 
    status,
    COUNT(*) as count
FROM users
GROUP BY status
ORDER BY status;

-- Update all users to inactive
UPDATE users 
SET status = 'inactive'::user_status_enum
WHERE status IS NULL OR status != 'inactive'::user_status_enum;

-- Verify the update
SELECT 
    status,
    COUNT(*) as count
FROM users
GROUP BY status
ORDER BY status;

-- Show summary
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE status = 'inactive') as inactive_count,
    COUNT(*) FILTER (WHERE status = 'active') as active_count
FROM users;

