-- Add service_type field to services table with ENUM dropdown
-- Run this SQL directly in your Supabase SQL Editor

-- Create ENUM type for service types (this creates the dropdown)
CREATE TYPE service_type_enum AS ENUM ('individual', 'group');

-- Add the service_type column to the services table using the ENUM
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS service_type service_type_enum DEFAULT 'individual';

-- Add comment to explain the field
COMMENT ON COLUMN services.service_type IS 'Defines whether the service is for individual customers or group bookings';

-- Create index for better performance when filtering by service type
CREATE INDEX IF NOT EXISTS idx_services_service_type ON services(service_type);

-- Update existing services to have 'individual' as default (they already exist as individual services)
UPDATE services SET service_type = 'individual' WHERE service_type IS NULL;

-- Make the column NOT NULL after setting defaults
ALTER TABLE services ALTER COLUMN service_type SET NOT NULL;

-- Show the updated table structure
SELECT 'Services table updated with service_type ENUM field' as status;

-- Verify the changes by showing some sample data
SELECT 
    id,
    name,
    service_type,
    active,
    created_at
FROM services 
ORDER BY created_at DESC 
LIMIT 10;

-- SUCCESS MESSAGE
SELECT 
    '🎉 SUCCESS! Service Type ENUM Migration Completed Successfully!' as message,
    '✅ ENUM type created with dropdown options: individual, group' as enum_status,
    '✅ service_type column added to services table' as column_status,
    '✅ All existing services set to individual type' as data_status,
    '✅ Database index created for performance' as index_status,
    '✅ Column set to NOT NULL with default value' as constraint_status,
    '🚀 You can now use the dropdown in Supabase table editor!' as next_step;
