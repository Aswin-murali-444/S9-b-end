-- Minimal Services Table Creation
-- Run this in your Supabase SQL Editor

-- Create the services table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  icon_url TEXT, -- Service icon/image URL
  duration TEXT, -- Estimated duration (e.g., '1-2 hours', '30 minutes')
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index for category + name combination
CREATE UNIQUE INDEX IF NOT EXISTS ux_services_category_name_ci 
ON services (category_id, LOWER(name));

-- Create helpful indexes
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for services table
DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at
BEFORE UPDATE ON services
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Test the table by inserting a sample service
INSERT INTO services (category_id, name, description, icon_url, duration, active) 
SELECT 
    sc.id,
    'Test Service',
    'This is a test service to verify the table works',
    null,
    '1 hour',
    true
FROM service_categories sc 
WHERE sc.active = true 
LIMIT 1
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

-- Show the created services
SELECT 
    s.id,
    s.name as service_name,
    sc.name as category_name,
    s.description,
    s.icon_url,
    s.duration,
    s.active,
    s.created_at
FROM services s
JOIN service_categories sc ON s.category_id = sc.id
ORDER BY s.created_at DESC;
