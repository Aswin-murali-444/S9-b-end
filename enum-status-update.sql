-- ENUM Status Update Script
-- This script creates ENUM types for all status fields to enable dropdown options in Supabase

-- 1. Create ENUM types for all status fields (only if they don't exist)
DO $$
BEGIN
  -- User status ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_enum') THEN
    CREATE TYPE user_status_enum AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
  END IF;

  -- User role ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'customer', 'service_provider', 'supervisor', 'driver');
  END IF;

  -- Service provider details status ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_provider_status_enum') THEN
    CREATE TYPE service_provider_status_enum AS ENUM ('active', 'suspended', 'pending_verification', 'inactive');
  END IF;

  -- Team status ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_status_enum') THEN
    CREATE TYPE team_status_enum AS ENUM ('active', 'inactive', 'suspended');
  END IF;

  -- Team member role ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_member_role_enum') THEN
    CREATE TYPE team_member_role_enum AS ENUM ('leader', 'supervisor', 'member', 'trainee');
  END IF;

  -- Team member status ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_member_status_enum') THEN
    CREATE TYPE team_member_status_enum AS ENUM ('active', 'inactive', 'on_leave');
  END IF;

  -- Team assignment status ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_assignment_status_enum') THEN
    CREATE TYPE team_assignment_status_enum AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
  END IF;

  -- Service category status ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_category_status_enum') THEN
    CREATE TYPE service_category_status_enum AS ENUM ('active', 'inactive', 'suspended');
  END IF;

  -- Service status ENUM
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_status_enum') THEN
    CREATE TYPE service_status_enum AS ENUM ('active', 'inactive', 'suspended');
  END IF;
END $$;

-- 2. Update existing tables to use ENUM types (if they exist)

-- Update users table status column (if exists)
DO $$
BEGIN
  -- Check if users table exists and has status column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'status'
  ) THEN
    -- Add new ENUM column
    ALTER TABLE users ADD COLUMN status_new user_status_enum;
    
    -- Copy data from old column to new column
    UPDATE users SET status_new = status::user_status_enum;
    
    -- Drop old column and rename new column
    ALTER TABLE users DROP COLUMN status;
    ALTER TABLE users RENAME COLUMN status_new TO status;
    
    -- Set default value
    ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active';
  END IF;
END $$;

-- Update users table role column (if exists)
DO $$
BEGIN
  -- Check if users table exists and has role column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'role'
  ) THEN
    -- Add new ENUM column
    ALTER TABLE users ADD COLUMN role_new user_role_enum;
    
    -- Copy data from old column to new column
    UPDATE users SET role_new = role::user_role_enum;
    
    -- Drop old column and rename new column
    ALTER TABLE users DROP COLUMN role;
    ALTER TABLE users RENAME COLUMN role_new TO role;
    
    -- Set default value
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer';
  END IF;
END $$;

-- Update service_provider_details table status column
DO $$
BEGIN
  -- Check if service_provider_details table exists and has status column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'service_provider_details' 
    AND column_name = 'status'
  ) THEN
    -- Add new ENUM column
    ALTER TABLE service_provider_details ADD COLUMN status_new service_provider_status_enum;
    
    -- Copy data from old column to new column
    UPDATE service_provider_details SET status_new = status::service_provider_status_enum;
    
    -- Drop old column and rename new column
    ALTER TABLE service_provider_details DROP COLUMN status;
    ALTER TABLE service_provider_details RENAME COLUMN status_new TO status;
    
    -- Set default value
    ALTER TABLE service_provider_details ALTER COLUMN status SET DEFAULT 'pending_verification';
  END IF;
END $$;

-- Update service_categories table status column (if exists)
DO $$
BEGIN
  -- Check if service_categories table exists and has status column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'service_categories' 
    AND column_name = 'status'
  ) THEN
    -- Add new ENUM column
    ALTER TABLE service_categories ADD COLUMN status_new service_category_status_enum;
    
    -- Copy data from old column to new column
    UPDATE service_categories SET status_new = status::service_category_status_enum;
    
    -- Drop old column and rename new column
    ALTER TABLE service_categories DROP COLUMN status;
    ALTER TABLE service_categories RENAME COLUMN status_new TO status;
    
    -- Set default value
    ALTER TABLE service_categories ALTER COLUMN status SET DEFAULT 'active';
  END IF;
END $$;

-- Update services table status column (if exists)
DO $$
BEGIN
  -- Check if services table exists and has status column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'services' 
    AND column_name = 'status'
  ) THEN
    -- Add new ENUM column
    ALTER TABLE services ADD COLUMN status_new service_status_enum;
    
    -- Copy data from old column to new column
    UPDATE services SET status_new = status::service_status_enum;
    
    -- Drop old column and rename new column
    ALTER TABLE services DROP COLUMN status;
    ALTER TABLE services RENAME COLUMN status_new TO status;
    
    -- Set default value
    ALTER TABLE services ALTER COLUMN status SET DEFAULT 'active';
  END IF;
END $$;

-- 3. Create indexes for better performance on ENUM columns
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_service_provider_details_status ON service_provider_details(status);
CREATE INDEX IF NOT EXISTS idx_service_categories_status ON service_categories(status);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);

-- 4. Add comments for documentation
COMMENT ON TYPE user_status_enum IS 'User account status options';
COMMENT ON TYPE user_role_enum IS 'User role types in the system';
COMMENT ON TYPE service_provider_status_enum IS 'Service provider account status options';
COMMENT ON TYPE team_status_enum IS 'Team status options';
COMMENT ON TYPE team_member_role_enum IS 'Team member role types';
COMMENT ON TYPE team_member_status_enum IS 'Team member status options';
COMMENT ON TYPE team_assignment_status_enum IS 'Team assignment status options';
COMMENT ON TYPE service_category_status_enum IS 'Service category status options';
COMMENT ON TYPE service_status_enum IS 'Service status options';

-- 5. Grant permissions (if using RLS)
-- GRANT USAGE ON TYPE user_status_enum TO authenticated;
-- GRANT USAGE ON TYPE user_role_enum TO authenticated;
-- GRANT USAGE ON TYPE service_provider_status_enum TO authenticated;
-- GRANT USAGE ON TYPE team_status_enum TO authenticated;
-- GRANT USAGE ON TYPE team_member_role_enum TO authenticated;
-- GRANT USAGE ON TYPE team_member_status_enum TO authenticated;
-- GRANT USAGE ON TYPE team_assignment_status_enum TO authenticated;
-- GRANT USAGE ON TYPE service_category_status_enum TO authenticated;
-- GRANT USAGE ON TYPE service_status_enum TO authenticated;

-- Done ✅
-- All status fields now use ENUM types for dropdown options in Supabase
