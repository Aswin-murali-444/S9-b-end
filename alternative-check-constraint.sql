-- Alternative Solution: Use CHECK constraint with predefined values
-- This often works better in Supabase for dropdowns

-- Drop the ENUM approach and use VARCHAR with CHECK constraint
ALTER TABLE services DROP COLUMN IF EXISTS service_type;
DROP TYPE IF EXISTS service_type_enum CASCADE;

-- Create the column with CHECK constraint (this often shows as dropdown in Supabase)
ALTER TABLE services 
ADD COLUMN service_type VARCHAR(20) DEFAULT 'individual' 
CHECK (service_type IN ('individual', 'group'));

-- Add comment
COMMENT ON COLUMN services.service_type IS 'Defines whether the service is for individual customers or group bookings';

-- Create index
CREATE INDEX IF NOT EXISTS idx_services_service_type ON services(service_type);

-- Update existing services
UPDATE services SET service_type = 'individual' WHERE service_type IS NULL;

-- Set NOT NULL
ALTER TABLE services ALTER COLUMN service_type SET NOT NULL;

-- Verify
SELECT 'CHECK Constraint Dropdown Applied!' as status;

-- Show the column details
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    check_clause
FROM information_schema.columns c
LEFT JOIN information_schema.check_constraints cc ON c.table_name = cc.table_name
WHERE c.table_name = 'services' 
AND c.column_name = 'service_type';

-- Show sample data
SELECT 
    id,
    name,
    service_type,
    active
FROM services 
ORDER BY created_at DESC 
LIMIT 5;
