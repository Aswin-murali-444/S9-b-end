-- Complete Services Database Setup
-- Run this script in your Supabase SQL Editor to set up the complete services system

-- 1. Create service_categories table
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

-- 2. Create services table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  icon_url TEXT, -- Service icon/image URL
  duration TEXT, -- Estimated duration (e.g., '1-2 hours', '30 minutes')
  price DECIMAL(10,2), -- Service price
  offer_price DECIMAL(10,2), -- Special offer price (optional)
  offer_percentage DECIMAL(5,2), -- Offer percentage (e.g., 20.00 for 20%)
  offer_enabled BOOLEAN DEFAULT FALSE, -- Whether the offer is active
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_service_categories_name ON service_categories(name);
CREATE INDEX IF NOT EXISTS idx_service_categories_active ON service_categories(active);
CREATE INDEX IF NOT EXISTS idx_service_categories_status ON service_categories(status);

CREATE UNIQUE INDEX IF NOT EXISTS ux_services_category_name_ci 
ON services (category_id, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);

-- 4. Create trigger function for updated_at (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create triggers for updated_at
DROP TRIGGER IF EXISTS update_service_categories_updated_at ON service_categories;
CREATE TRIGGER update_service_categories_updated_at
BEFORE UPDATE ON service_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON services;
CREATE TRIGGER update_services_updated_at
BEFORE UPDATE ON services
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Insert sample categories
INSERT INTO service_categories (name, description, active, status) VALUES
('Home Maintenance', 'Cleaning, repairs, and general home upkeep services', true, 'active'),
('Caregiving', 'Elder care, child care, and personal assistance services', true, 'active'),
('Transportation', 'Ride services, delivery, and transportation solutions', true, 'active'),
('Technology', 'IT support, device setup, and technical assistance', true, 'active'),
('Healthcare', 'Medical services, wellness, and health-related support', true, 'active')
ON CONFLICT (name) DO NOTHING;

-- 7. Insert sample services
INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Home Deep Cleaning',
    'Professional deep cleaning service for your entire home including kitchen, bathrooms, and living areas',
    '2-3 hours',
    75.00,
    60.00,
    20.00,
    true,
    true
FROM service_categories sc 
WHERE sc.name = 'Home Maintenance'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Plumbing Repair',
    'Expert plumbing services for leaks, clogs, and general repairs',
    '1-2 hours',
    120.00,
    null,
    null,
    false,
    true
FROM service_categories sc 
WHERE sc.name = 'Home Maintenance'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Electrical Services',
    'Licensed electrician for wiring, outlets, and electrical repairs',
    '1-3 hours',
    150.00,
    120.00,
    20.00,
    true,
    true
FROM service_categories sc 
WHERE sc.name = 'Home Maintenance'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Elder Care Assistance',
    'Compassionate care for elderly individuals including medication reminders and companionship',
    '4-8 hours',
    45.00,
    null,
    null,
    false,
    true
FROM service_categories sc 
WHERE sc.name = 'Caregiving'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Child Care Services',
    'Professional child care for working parents with certified caregivers',
    '4-10 hours',
    25.00,
    20.00,
    20.00,
    true,
    true
FROM service_categories sc 
WHERE sc.name = 'Caregiving'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Ride Service',
    'Reliable transportation service for appointments, shopping, and general travel',
    '30 minutes - 2 hours',
    15.00,
    null,
    null,
    false,
    true
FROM service_categories sc 
WHERE sc.name = 'Transportation'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Package Delivery',
    'Secure package delivery and pickup services',
    '30-60 minutes',
    8.00,
    6.00,
    25.00,
    true,
    true
FROM service_categories sc 
WHERE sc.name = 'Transportation'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Computer Setup & Repair',
    'Professional computer setup, troubleshooting, and repair services',
    '1-3 hours',
    80.00,
    null,
    null,
    false,
    true
FROM service_categories sc 
WHERE sc.name = 'Technology'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Smart Home Installation',
    'Installation and setup of smart home devices and systems',
    '2-4 hours',
    200.00,
    160.00,
    20.00,
    true,
    true
FROM service_categories sc 
WHERE sc.name = 'Technology'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, duration, price, offer_price, offer_percentage, offer_enabled, active) 
SELECT 
    sc.id,
    'Health Checkup',
    'Basic health assessment and vital signs monitoring',
    '1 hour',
    50.00,
    null,
    null,
    false,
    true
FROM service_categories sc 
WHERE sc.name = 'Healthcare'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

-- 8. Show the results
SELECT 'Categories Created:' as info;
SELECT 
    id,
    name,
    description,
    active,
    status,
    created_at
FROM service_categories
ORDER BY created_at ASC;

SELECT 'Services Created:' as info;
SELECT 
    s.id,
    s.name as service_name,
    sc.name as category_name,
    s.description,
    s.duration,
    s.price,
    s.offer_price,
    s.offer_percentage,
    s.offer_enabled,
    s.active
FROM services s
JOIN service_categories sc ON s.category_id = sc.id
ORDER BY sc.name, s.name;

SELECT 'Setup Complete!' as status;
