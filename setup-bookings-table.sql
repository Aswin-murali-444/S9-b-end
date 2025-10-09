-- Simple Bookings Table Setup for Supabase
-- Run this single script in your Supabase SQL Editor

-- 1. Create ENUM types for dropdown values
CREATE TYPE booking_status_enum AS ENUM (
    'pending',
    'confirmed', 
    'assigned',
    'in_progress',
    'completed',
    'cancelled',
    'rescheduled',
    'no_show',
    'disputed'
);

CREATE TYPE payment_status_enum AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'refunded',
    'cancelled'
);

CREATE TYPE payment_method_enum AS ENUM (
    'card',
    'upi',
    'cod',
    'wallet',
    'netbanking'
);

CREATE TYPE priority_level_enum AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);

CREATE TYPE booking_source_enum AS ENUM (
    'web',
    'mobile',
    'admin',
    'api'
);

CREATE TYPE internal_status_enum AS ENUM (
    'active',
    'archived',
    'deleted'
);

-- 2. Create the bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User and Service References
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
    
    -- Scheduling Information
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    
    -- Location Information
    service_address TEXT NOT NULL,
    service_city VARCHAR(100),
    service_state VARCHAR(100),
    service_country VARCHAR(100),
    service_postal_code VARCHAR(20),
    service_location_latitude DECIMAL(10, 8),
    service_location_longitude DECIMAL(11, 8),
    service_location_accuracy_m INTEGER,
    
    -- Contact Information
    contact_phone VARCHAR(20) NOT NULL,
    contact_email VARCHAR(255),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(20),
    
    -- Additional Information
    special_instructions TEXT,
    additional_requirements TEXT,
    preferred_provider_notes TEXT,
    
    -- Pricing Information
    base_price DECIMAL(10,2) NOT NULL,
    service_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL,
    offer_applied BOOLEAN DEFAULT FALSE,
    offer_discount_amount DECIMAL(10,2) DEFAULT 0.00,
    
    -- Payment Information
    payment_method payment_method_enum NOT NULL,
    payment_status payment_status_enum DEFAULT 'pending',
    payment_transaction_id VARCHAR(255),
    payment_gateway_response JSONB,
    
    -- Booking Status (Dropdown-friendly)
    booking_status booking_status_enum DEFAULT 'pending',
    
    -- Service Provider Assignment
    assigned_provider_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider_assigned_at TIMESTAMPTZ,
    provider_confirmed_at TIMESTAMPTZ,
    
    -- Timeline Tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    
    -- Rating and Feedback
    customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
    customer_feedback TEXT,
    provider_rating INTEGER CHECK (provider_rating >= 1 AND provider_rating <= 5),
    provider_feedback TEXT,
    feedback_submitted_at TIMESTAMPTZ,
    
    -- Administrative Fields
    admin_notes TEXT,
    internal_status internal_status_enum DEFAULT 'active',
    priority_level priority_level_enum DEFAULT 'normal',
    
    -- Metadata
    booking_source booking_source_enum DEFAULT 'web',
    ip_address INET,
    user_agent TEXT,
    referral_source VARCHAR(255)
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_category_id ON bookings(category_id);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_provider_id ON bookings(assigned_provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_status ON bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date ON bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_internal_status ON bookings(internal_status);

-- 4. Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger for bookings table
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. Create automatic pricing calculation function
CREATE OR REPLACE FUNCTION calculate_booking_pricing()
RETURNS TRIGGER AS $$
BEGIN
    -- Get service pricing information
    SELECT 
        COALESCE(
            CASE WHEN s.offer_enabled = TRUE THEN s.offer_price ELSE s.price END,
            0
        ),
        CASE WHEN s.offer_enabled = TRUE THEN TRUE ELSE FALSE END,
        CASE WHEN s.offer_enabled = TRUE THEN (s.price - s.offer_price) ELSE 0 END
    INTO 
        NEW.base_price,
        NEW.offer_applied,
        NEW.offer_discount_amount
    FROM services s
    WHERE s.id = NEW.service_id;
    
    -- Calculate service fee (10% of base price)
    NEW.service_fee := ROUND(NEW.base_price * 0.1, 2);
    
    -- Calculate tax (18% of base price + service fee)
    NEW.tax_amount := ROUND((NEW.base_price + NEW.service_fee) * 0.18, 2);
    
    -- Calculate total amount
    NEW.total_amount := NEW.base_price + NEW.service_fee + NEW.tax_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger for automatic pricing calculation
DROP TRIGGER IF EXISTS calculate_booking_pricing_trigger ON bookings;
CREATE TRIGGER calculate_booking_pricing_trigger
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION calculate_booking_pricing();

-- 8. Create a comprehensive view for booking details
CREATE OR REPLACE VIEW booking_details_view AS
SELECT 
    b.id,
    b.booking_status,
    b.payment_status,
    b.scheduled_date,
    b.scheduled_time,
    b.total_amount,
    b.payment_method,
    b.created_at,
    b.priority_level,
    
    -- Customer Information
    u.full_name as customer_name,
    u.email as customer_email,
    up.phone as customer_phone,
    
    -- Service Information
    s.name as service_name,
    s.description as service_description,
    s.duration as service_duration,
    
    -- Category Information
    sc.name as category_name,
    sc.description as category_description,
    
    -- Provider Information
    p.full_name as provider_name,
    p.email as provider_email,
    pp.phone as provider_phone,
    
    -- Location Information
    b.service_address,
    b.service_city,
    b.service_state,
    b.contact_phone,
    b.special_instructions,
    
    -- Ratings and Feedback
    b.customer_rating,
    b.customer_feedback,
    b.provider_rating,
    b.provider_feedback
    
FROM bookings b
LEFT JOIN users u ON b.user_id = u.id
LEFT JOIN user_profiles up ON u.id = up.id
LEFT JOIN services s ON b.service_id = s.id
LEFT JOIN service_categories sc ON b.category_id = sc.id
LEFT JOIN users p ON b.assigned_provider_id = p.id
LEFT JOIN user_profiles pp ON p.id = pp.id
WHERE b.internal_status = 'active';

-- 9. Enable Row Level Security
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS policies
-- Users can view their own bookings
CREATE POLICY "Users can view their own bookings" ON bookings
    FOR SELECT USING (auth.uid() = (SELECT auth_user_id FROM users WHERE id = user_id));

-- Users can create their own bookings
CREATE POLICY "Users can create their own bookings" ON bookings
    FOR INSERT WITH CHECK (auth.uid() = (SELECT auth_user_id FROM users WHERE id = user_id));

-- Service providers can view bookings assigned to them
CREATE POLICY "Providers can view assigned bookings" ON bookings
    FOR SELECT USING (auth.uid() = (SELECT auth_user_id FROM users WHERE id = assigned_provider_id));

-- Admins can do everything
CREATE POLICY "Admins can manage all bookings" ON bookings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE auth_user_id = auth.uid()
            AND role = 'admin'
        )
    );

-- 11. Grant permissions
GRANT SELECT, INSERT, UPDATE ON bookings TO authenticated;
GRANT SELECT ON booking_details_view TO authenticated;

-- 12. Add table comments
COMMENT ON TABLE bookings IS 'Stores all booking information from the booking modal';
COMMENT ON COLUMN bookings.booking_status IS 'Current booking status - appears as dropdown in Supabase';
COMMENT ON COLUMN bookings.payment_status IS 'Payment status - appears as dropdown in Supabase';
COMMENT ON COLUMN bookings.payment_method IS 'Payment method used - appears as dropdown in Supabase';
COMMENT ON COLUMN bookings.priority_level IS 'Booking priority level - appears as dropdown in Supabase';

-- 13. Success message
SELECT 'Bookings table created successfully with dropdown-friendly status fields!' as status;
