-- Add service_type field to services table
-- This field will distinguish between 'individual' and 'group' services

-- Add the service_type column to the services table
ALTER TABLE services 
ADD COLUMN service_type VARCHAR(20) DEFAULT 'individual' CHECK (service_type IN ('individual', 'group'));

-- Add comment to explain the field
COMMENT ON COLUMN services.service_type IS 'Defines whether the service is for individual customers or group bookings';

-- Create index for better performance when filtering by service type
CREATE INDEX IF NOT EXISTS idx_services_service_type ON services(service_type);

-- Update existing services to have 'individual' as default (they already exist as individual services)
UPDATE services SET service_type = 'individual' WHERE service_type IS NULL;

-- Make the column NOT NULL after setting defaults
ALTER TABLE services ALTER COLUMN service_type SET NOT NULL;

-- Show the updated table structure
SELECT 'Services table updated with service_type field' as status;
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'services' 
ORDER BY ordinal_position;
