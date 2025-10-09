-- Sample Data for Bookings Table
-- Run this after creating the bookings table to insert test data

-- Insert sample bookings (make sure you have users, services, and categories first)
INSERT INTO bookings (
    user_id, 
    service_id, 
    category_id,
    scheduled_date, 
    scheduled_time,
    service_address, 
    service_city, 
    service_state, 
    service_country,
    service_postal_code,
    contact_phone, 
    contact_email,
    special_instructions,
    payment_method, 
    booking_status,
    payment_status,
    priority_level,
    booking_source
) VALUES 
-- Booking 1: Pending booking
(
    (SELECT id FROM users WHERE role = 'customer' LIMIT 1),
    (SELECT id FROM services WHERE active = true LIMIT 1),
    (SELECT id FROM service_categories WHERE active = true LIMIT 1),
    CURRENT_DATE + INTERVAL '2 days',
    '10:00:00',
    '123 Main Street, Apartment 4B',
    'Mumbai',
    'Maharashtra',
    'India',
    '400001',
    '+91-9876543210',
    'customer@example.com',
    'Please call before arriving',
    'card',
    'pending',
    'pending',
    'normal',
    'web'
),

-- Booking 2: Confirmed booking
(
    (SELECT id FROM users WHERE role = 'customer' LIMIT 1),
    (SELECT id FROM services WHERE active = true OFFSET 1 LIMIT 1),
    (SELECT id FROM service_categories WHERE active = true OFFSET 1 LIMIT 1),
    CURRENT_DATE + INTERVAL '3 days',
    '14:00:00',
    '456 Park Avenue, Floor 2',
    'Delhi',
    'Delhi',
    'India',
    '110001',
    '+91-9876543211',
    'customer2@example.com',
    'Gate code: 1234',
    'upi',
    'confirmed',
    'completed',
    'high',
    'mobile'
),

-- Booking 3: In progress booking
(
    (SELECT id FROM users WHERE role = 'customer' LIMIT 1),
    (SELECT id FROM services WHERE active = true OFFSET 2 LIMIT 1),
    (SELECT id FROM service_categories WHERE active = true LIMIT 1),
    CURRENT_DATE,
    '09:00:00',
    '789 Garden Road, House 15',
    'Bangalore',
    'Karnataka',
    'India',
    '560001',
    '+91-9876543212',
    'customer3@example.com',
    'Please use back entrance',
    'cod',
    'in_progress',
    'pending',
    'normal',
    'web'
),

-- Booking 4: Completed booking with rating
(
    (SELECT id FROM users WHERE role = 'customer' LIMIT 1),
    (SELECT id FROM services WHERE active = true LIMIT 1),
    (SELECT id FROM service_categories WHERE active = true LIMIT 1),
    CURRENT_DATE - INTERVAL '1 day',
    '11:00:00',
    '321 Oak Street, Unit 7',
    'Chennai',
    'Tamil Nadu',
    'India',
    '600001',
    '+91-9876543213',
    'customer4@example.com',
    'Excellent service, very professional',
    'card',
    'completed',
    'completed',
    'normal',
    'web'
);

-- Update the completed booking with ratings
UPDATE bookings 
SET 
    customer_rating = 5,
    customer_feedback = 'Excellent service! Very professional and punctual.',
    provider_rating = 4,
    provider_feedback = 'Good customer, clear instructions.',
    feedback_submitted_at = NOW(),
    completed_at = NOW()
WHERE booking_status = 'completed';

-- Update the in-progress booking with provider assignment
UPDATE bookings 
SET 
    assigned_provider_id = (SELECT id FROM users WHERE role = 'service_provider' LIMIT 1),
    provider_assigned_at = NOW(),
    provider_confirmed_at = NOW(),
    started_at = NOW()
WHERE booking_status = 'in_progress';

-- Update the confirmed booking with provider assignment
UPDATE bookings 
SET 
    assigned_provider_id = (SELECT id FROM users WHERE role = 'service_provider' LIMIT 1),
    provider_assigned_at = NOW(),
    provider_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE booking_status = 'confirmed';

-- Insert a few more bookings with different statuses
INSERT INTO bookings (
    user_id, 
    service_id, 
    category_id,
    scheduled_date, 
    scheduled_time,
    service_address, 
    service_city, 
    service_state, 
    service_country,
    contact_phone, 
    special_instructions,
    payment_method, 
    booking_status,
    payment_status,
    priority_level
) VALUES 
-- Cancelled booking
(
    (SELECT id FROM users WHERE role = 'customer' LIMIT 1),
    (SELECT id FROM services WHERE active = true LIMIT 1),
    (SELECT id FROM service_categories WHERE active = true LIMIT 1),
    CURRENT_DATE + INTERVAL '1 day',
    '16:00:00',
    '555 Pine Street, Apt 3',
    'Pune',
    'Maharashtra',
    'India',
    '+91-9876543214',
    'Cancelled due to emergency',
    'card',
    'cancelled',
    'refunded',
    'normal'
),

-- Rescheduled booking
(
    (SELECT id FROM users WHERE role = 'customer' LIMIT 1),
    (SELECT id FROM services WHERE active = true OFFSET 1 LIMIT 1),
    (SELECT id FROM service_categories WHERE active = true OFFSET 1 LIMIT 1),
    CURRENT_DATE + INTERVAL '5 days',
    '13:00:00',
    '777 Elm Street, Floor 5',
    'Hyderabad',
    'Telangana',
    'India',
    '+91-9876543215',
    'Rescheduled from earlier date',
    'upi',
    'rescheduled',
    'completed',
    'low'
),

-- No show booking
(
    (SELECT id FROM users WHERE role = 'customer' LIMIT 1),
    (SELECT id FROM services WHERE active = true OFFSET 2 LIMIT 1),
    (SELECT id FROM service_categories WHERE active = true LIMIT 1),
    CURRENT_DATE - INTERVAL '2 days',
    '15:00:00',
    '999 Maple Avenue, House 12',
    'Kolkata',
    'West Bengal',
    'India',
    '+91-9876543216',
    'Customer did not show up',
    'cod',
    'no_show',
    'pending',
    'normal'
);

-- Update timestamps for the cancelled booking
UPDATE bookings 
SET 
    cancelled_at = NOW(),
    updated_at = NOW()
WHERE booking_status = 'cancelled';

-- Update timestamps for the rescheduled booking
UPDATE bookings 
SET 
    confirmed_at = NOW(),
    updated_at = NOW()
WHERE booking_status = 'rescheduled';

-- Update timestamps for the no show booking
UPDATE bookings 
SET 
    updated_at = NOW()
WHERE booking_status = 'no_show';

-- Create a view for easy testing
CREATE OR REPLACE VIEW sample_bookings_summary AS
SELECT 
    b.id,
    b.booking_status,
    b.payment_status,
    b.scheduled_date,
    b.scheduled_time,
    b.total_amount,
    b.payment_method,
    u.full_name as customer_name,
    s.name as service_name,
    sc.name as category_name,
    p.full_name as provider_name,
    b.customer_rating,
    b.created_at
FROM bookings b
LEFT JOIN users u ON b.user_id = u.id
LEFT JOIN services s ON b.service_id = s.id
LEFT JOIN service_categories sc ON b.category_id = sc.id
LEFT JOIN users p ON b.assigned_provider_id = p.id
ORDER BY b.created_at DESC;

-- Show summary of inserted data
SELECT 
    'Sample bookings inserted successfully!' as status,
    COUNT(*) as total_bookings,
    COUNT(*) FILTER (WHERE booking_status = 'pending') as pending_bookings,
    COUNT(*) FILTER (WHERE booking_status = 'confirmed') as confirmed_bookings,
    COUNT(*) FILTER (WHERE booking_status = 'in_progress') as in_progress_bookings,
    COUNT(*) FILTER (WHERE booking_status = 'completed') as completed_bookings,
    COUNT(*) FILTER (WHERE booking_status = 'cancelled') as cancelled_bookings,
    COUNT(*) FILTER (WHERE booking_status = 'rescheduled') as rescheduled_bookings,
    COUNT(*) FILTER (WHERE booking_status = 'no_show') as no_show_bookings,
    SUM(total_amount) as total_revenue,
    AVG(customer_rating) as avg_rating
FROM bookings;

-- Show the sample bookings
SELECT * FROM sample_bookings_summary;
