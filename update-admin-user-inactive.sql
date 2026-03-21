-- Update admin@example.com to inactive status
-- Run this in Supabase SQL Editor

-- First, check current status
SELECT id, email, status 
FROM users 
WHERE email = 'admin@example.com';

-- Update to inactive
UPDATE users 
SET status = 'inactive'::user_status_enum
WHERE email = 'admin@example.com';

-- Verify the update
SELECT id, email, status 
FROM users 
WHERE email = 'admin@example.com';

