-- Update all users to inactive status
-- Run this directly in Supabase SQL Editor

UPDATE users 
SET status = 'inactive'::user_status_enum
WHERE status IS NULL OR status != 'inactive'::user_status_enum;

-- Check how many were updated
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE status = 'inactive') as inactive_users,
    COUNT(*) FILTER (WHERE status = 'active') as active_users,
    COUNT(*) FILTER (WHERE status = 'suspended') as suspended_users,
    COUNT(*) FILTER (WHERE status = 'pending_verification') as pending_users
FROM users;

