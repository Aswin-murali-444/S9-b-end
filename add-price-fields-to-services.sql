-- Add price and offer_price fields to existing services table
-- Run this in your Supabase SQL Editor if you already have the services table

-- Add price column
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS price DECIMAL(10,0);

-- Add offer_price column  
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS offer_price DECIMAL(10,0);

-- Add offer_percentage column
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS offer_percentage DECIMAL(5,2);

-- Add offer_enabled column
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS offer_enabled BOOLEAN DEFAULT FALSE;

-- Add comments to the columns
COMMENT ON COLUMN services.price IS 'Service price in Indian Rupees';
COMMENT ON COLUMN services.offer_price IS 'Special offer price in Indian Rupees (optional)';
COMMENT ON COLUMN services.offer_percentage IS 'Offer percentage (e.g., 20.00 for 20%)';
COMMENT ON COLUMN services.offer_enabled IS 'Whether the percentage offer is active';

-- Show the updated table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'services' 
ORDER BY ordinal_position;
