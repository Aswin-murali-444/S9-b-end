-- Simple script to remove 'caretaker' role from Supabase
-- This is a safer approach that works with Supabase's constraints

-- Step 1: Update any existing users with 'caretaker' role to 'service_provider'
UPDATE users 
SET role = 'service_provider' 
WHERE role = 'caretaker';

-- Step 2: Verify no users have 'caretaker' role anymore
SELECT COUNT(*) as caretaker_users_count 
FROM users 
WHERE role = 'caretaker';

-- Step 3: Check current enum values
SELECT unnest(enum_range(NULL::user_role)) as current_roles;

-- Note: To completely remove 'caretaker' from the enum, you may need to:
-- 1. Go to Supabase Dashboard > Database > Types
-- 2. Find the 'user_role' enum type
-- 3. Manually remove the 'caretaker' value from the enum
-- 4. Or contact Supabase support for enum value removal

-- Alternative: If you can't remove the enum value, you can add a check constraint
-- to prevent new users from being assigned the 'caretaker' role:

-- Add constraint to prevent caretaker role assignment
ALTER TABLE users 
ADD CONSTRAINT check_valid_roles 
CHECK (role IN ('customer', 'service_provider', 'supervisor', 'driver', 'admin'));
