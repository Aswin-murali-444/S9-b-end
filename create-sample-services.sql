-- Sample Services Data
-- This script adds sample services to existing categories
-- Run this after the main database schema and service categories are set up

-- First, let's ensure we have some categories to work with
INSERT INTO service_categories (name, description, active) VALUES
('Home Maintenance', 'Repairs and maintenance for homes', true),
('Elder Care', 'Care and assistance for the elderly', true),
('Transport', 'Driver and logistics services', true),
('Delivery', 'Parcel and medicine delivery', true)
ON CONFLICT (LOWER(name)) DO NOTHING;

-- Now add sample services for each category
-- Home Maintenance Services
INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Plumbing Repair',
    'Fix leaks, unclog drains, and repair plumbing fixtures',
    'fixed',
    75.00,
    '1-2 hours',
    true
FROM service_categories sc WHERE sc.name = 'Home Maintenance'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Electrical Work',
    'Install outlets, fix wiring, and electrical repairs',
    'hourly',
    45.00,
    '1-3 hours',
    true
FROM service_categories sc WHERE sc.name = 'Home Maintenance'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'HVAC Maintenance',
    'Heating, ventilation, and air conditioning service',
    'fixed',
    120.00,
    '2-4 hours',
    true
FROM service_categories sc WHERE sc.name = 'Home Maintenance'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

-- Elder Care Services
INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Personal Care Assistance',
    'Help with daily activities like bathing, dressing, and grooming',
    'hourly',
    25.00,
    '2-4 hours',
    true
FROM service_categories sc WHERE sc.name = 'Elder Care'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Medication Management',
    'Help with medication reminders and organization',
    'fixed',
    30.00,
    '30 minutes',
    true
FROM service_categories sc WHERE sc.name = 'Elder Care'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Companion Care',
    'Social interaction and emotional support',
    'hourly',
    20.00,
    '2-8 hours',
    true
FROM service_categories sc WHERE sc.name = 'Elder Care'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

-- Transport Services
INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Airport Transfer',
    'Reliable transportation to and from airports',
    'fixed',
    50.00,
    '1-2 hours',
    true
FROM service_categories sc WHERE sc.name = 'Transport'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Medical Appointments',
    'Transportation to doctor visits and medical facilities',
    'per_km',
    2.50,
    '1-3 hours',
    true
FROM service_categories sc WHERE sc.name = 'Transport'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Grocery Shopping',
    'Transportation for grocery shopping and errands',
    'hourly',
    15.00,
    '1-2 hours',
    true
FROM service_categories sc WHERE sc.name = 'Transport'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

-- Delivery Services
INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Medicine Delivery',
    'Prescription and over-the-counter medication delivery',
    'fixed',
    8.00,
    '30-60 minutes',
    true
FROM service_categories sc WHERE sc.name = 'Delivery'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Grocery Delivery',
    'Fresh groceries and household items delivered to your door',
    'per_km',
    1.50,
    '1-2 hours',
    true
FROM service_categories sc WHERE sc.name = 'Delivery'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

INSERT INTO services (category_id, name, description, pricing_model, base_price, duration, active) 
SELECT 
    sc.id,
    'Package Pickup',
    'Pick up and deliver packages from various locations',
    'fixed',
    12.00,
    '30-90 minutes',
    true
FROM service_categories sc WHERE sc.name = 'Delivery'
ON CONFLICT (category_id, LOWER(name)) DO NOTHING;

-- Display the created services
SELECT 
    s.id,
    s.name as service_name,
    sc.name as category_name,
    s.pricing_model,
    s.base_price,
    s.duration,
    s.active,
    s.created_at
FROM services s
JOIN service_categories sc ON s.category_id = sc.id
ORDER BY sc.name, s.name;
