-- Troubleshooting: Service Type ENUM Dropdown Not Showing
-- Run these queries to diagnose and fix the issue

-- 1. Check if the ENUM type exists
SELECT 
    typname as enum_name,
    typtype as type_type,
    typcategory as category
FROM pg_type 
WHERE typname = 'service_type_enum';

-- 2. Check the ENUM values
SELECT 
    enumlabel as enum_value,
    enumsortorder as sort_order
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'service_type_enum')
ORDER BY enumsortorder;

-- 3. Check the services table structure
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'services' 
AND column_name = 'service_type';

-- 4. If ENUM doesn't exist or is wrong, recreate it properly
-- First, drop the column if it exists
ALTER TABLE services DROP COLUMN IF EXISTS service_type;

-- Drop the ENUM type if it exists
DROP TYPE IF EXISTS service_type_enum CASCADE;

-- Create the ENUM type fresh
CREATE TYPE service_type_enum AS ENUM ('individual', 'group');

-- Add the column back with the ENUM
ALTER TABLE services 
ADD COLUMN service_type service_type_enum DEFAULT 'individual';

-- Add comment
COMMENT ON COLUMN services.service_type IS 'Defines whether the service is for individual customers or group bookings';

-- Create index
CREATE INDEX IF NOT EXISTS idx_services_service_type ON services(service_type);

-- Update existing services
UPDATE services SET service_type = 'individual' WHERE service_type IS NULL;

-- Set NOT NULL
ALTER TABLE services ALTER COLUMN service_type SET NOT NULL;

-- 5. Verify the fix
SELECT 'ENUM Dropdown Fix Applied Successfully!' as status;

-- Show the column details again
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'services' 
AND column_name = 'service_type';

-- Show sample data
SELECT 
    id,
    name,
    service_type,
    active
FROM services 
ORDER BY created_at DESC 
LIMIT 5;
