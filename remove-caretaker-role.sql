-- Remove 'caretaker' role from user_role enum
-- This script removes the 'caretaker' value from the user_role enum type

-- First, check if any users currently have the 'caretaker' role
-- If there are any, we need to update them to a different role first
DO $$
DECLARE
    caretaker_count INTEGER;
BEGIN
    -- Count users with caretaker role
    SELECT COUNT(*) INTO caretaker_count 
    FROM users 
    WHERE role = 'caretaker';
    
    -- If there are users with caretaker role, update them to service_provider
    IF caretaker_count > 0 THEN
        RAISE NOTICE 'Found % users with caretaker role. Updating them to service_provider role.', caretaker_count;
        UPDATE users 
        SET role = 'service_provider' 
        WHERE role = 'caretaker';
    END IF;
END $$;

-- Remove the 'caretaker' value from the enum
-- Note: PostgreSQL doesn't support removing enum values directly
-- We need to create a new enum without 'caretaker' and migrate the data

-- Step 1: Create a new enum type without 'caretaker'
DO $$
BEGIN
    -- Create new enum type without caretaker
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_new') THEN
        CREATE TYPE user_role_new AS ENUM ('customer', 'service_provider', 'supervisor', 'driver', 'admin');
    END IF;
END $$;

-- Step 2: Add a new column with the new enum type
ALTER TABLE users ADD COLUMN role_new user_role_new;

-- Step 3: Copy data from old column to new column (excluding caretaker)
UPDATE users 
SET role_new = role::text::user_role_new
WHERE role != 'caretaker';

-- Step 4: Drop the old column
ALTER TABLE users DROP COLUMN role;

-- Step 5: Rename the new column to the original name
ALTER TABLE users RENAME COLUMN role_new TO role;

-- Step 6: Make the column NOT NULL again
ALTER TABLE users ALTER COLUMN role SET NOT NULL;

-- Step 7: Drop the old enum type
DROP TYPE user_role;

-- Step 8: Rename the new enum type to the original name
ALTER TYPE user_role_new RENAME TO user_role;

-- Step 9: Recreate the index on the role column
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Verify the change
SELECT unnest(enum_range(NULL::user_role)) as available_roles;
