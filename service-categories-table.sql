-- Service Categories Table Creation
-- Run this in your Supabase SQL Editor

-- Create the service_categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT, -- Category icon/image URL
  settings JSONB, -- Additional category settings
  active BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_categories_name ON service_categories(name);
CREATE INDEX IF NOT EXISTS idx_service_categories_active ON service_categories(active);
CREATE INDEX IF NOT EXISTS idx_service_categories_status ON service_categories(status);

-- Create trigger function for updated_at (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for service_categories table
DROP TRIGGER IF EXISTS update_service_categories_updated_at ON service_categories;
CREATE TRIGGER update_service_categories_updated_at
BEFORE UPDATE ON service_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample categories
INSERT INTO service_categories (name, description, active, status) VALUES
('Home Maintenance', 'Cleaning, repairs, and general home upkeep services', true, 'active'),
('Caregiving', 'Elder care, child care, and personal assistance services', true, 'active'),
('Transportation', 'Ride services, delivery, and transportation solutions', true, 'active'),
('Technology', 'IT support, device setup, and technical assistance', true, 'active'),
('Healthcare', 'Medical services, wellness, and health-related support', true, 'active')
ON CONFLICT (name) DO NOTHING;

-- Show the created categories
SELECT 
    id,
    name,
    description,
    icon_url,
    active,
    status,
    created_at
FROM service_categories
ORDER BY created_at ASC;
