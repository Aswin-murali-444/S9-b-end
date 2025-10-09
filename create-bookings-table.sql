-- Bookings Table Creation Script
-- This script creates a comprehensive bookings table that captures all data from the booking modal
-- and connects to users, services, and service_categories tables

-- 1. Create the bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User and Service References
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  
  -- Scheduling Information
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60, -- Service duration in minutes
  
  -- Location Information
  service_address TEXT NOT NULL,
  service_city VARCHAR(100),
  service_state VARCHAR(100),
  service_country VARCHAR(100),
  service_postal_code VARCHAR(20),
  service_location_latitude DECIMAL(10, 8), -- GPS coordinates if available
  service_location_longitude DECIMAL(11, 8),
  service_location_accuracy_m INTEGER,
  
  -- Contact Information
  contact_phone VARCHAR(20) NOT NULL,
  contact_email VARCHAR(255),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  
  -- Additional Notes and Requirements
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
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('card', 'upi', 'cod', 'wallet', 'netbanking')),
  payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
  payment_transaction_id VARCHAR(255),
  payment_gateway_response JSONB,
  
  -- Booking Status and Workflow
  booking_status VARCHAR(50) DEFAULT 'pending' CHECK (booking_status IN (
    'pending',           -- Just created, waiting for confirmation
    'confirmed',         -- Confirmed by admin/system
    'assigned',          -- Service provider assigned
    'in_progress',       -- Service is being performed
    'completed',         -- Service completed successfully
    'cancelled',         -- Cancelled by customer or admin
    'rescheduled',       -- Rescheduled to different time
    'no_show',           -- Customer didn't show up
    'disputed'           -- There's a dispute about the service
  )),
  
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
  internal_status VARCHAR(50) DEFAULT 'active' CHECK (internal_status IN ('active', 'archived', 'deleted')),
  priority_level VARCHAR(20) DEFAULT 'normal' CHECK (priority_level IN ('low', 'normal', 'high', 'urgent')),
  
  -- Metadata
  booking_source VARCHAR(50) DEFAULT 'web' CHECK (booking_source IN ('web', 'mobile', 'admin', 'api')),
  ip_address INET,
  user_agent TEXT,
  referral_source VARCHAR(255)
);

-- 2. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_category_id ON bookings(category_id);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_provider_id ON bookings(assigned_provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_status ON bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date ON bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_bookings_internal_status ON bookings(internal_status);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings(user_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_status ON bookings(assigned_provider_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(scheduled_date, booking_status);

-- 3. Create trigger function for updated_at (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger for bookings table
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Create a function to automatically calculate pricing
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

-- 6. Create trigger for automatic pricing calculation
DROP TRIGGER IF EXISTS calculate_booking_pricing_trigger ON bookings;
CREATE TRIGGER calculate_booking_pricing_trigger
    BEFORE INSERT OR UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION calculate_booking_pricing();

-- 7. Create a function to validate booking status transitions
CREATE OR REPLACE FUNCTION validate_booking_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Define valid status transitions
    IF OLD.booking_status IS NOT NULL THEN
        CASE OLD.booking_status
            WHEN 'pending' THEN
                IF NEW.booking_status NOT IN ('confirmed', 'cancelled') THEN
                    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.booking_status, NEW.booking_status;
                END IF;
            WHEN 'confirmed' THEN
                IF NEW.booking_status NOT IN ('assigned', 'cancelled', 'rescheduled') THEN
                    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.booking_status, NEW.booking_status;
                END IF;
            WHEN 'assigned' THEN
                IF NEW.booking_status NOT IN ('in_progress', 'cancelled', 'no_show') THEN
                    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.booking_status, NEW.booking_status;
                END IF;
            WHEN 'in_progress' THEN
                IF NEW.booking_status NOT IN ('completed', 'disputed') THEN
                    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.booking_status, NEW.booking_status;
                END IF;
            WHEN 'completed' THEN
                IF NEW.booking_status NOT IN ('disputed') THEN
                    RAISE EXCEPTION 'Invalid status transition from % to %', OLD.booking_status, NEW.booking_status;
                END IF;
            WHEN 'cancelled' THEN
                RAISE EXCEPTION 'Cannot change status from cancelled';
            WHEN 'disputed' THEN
                RAISE EXCEPTION 'Cannot change status from disputed without admin intervention';
        END CASE;
    END IF;
    
    -- Set timestamps based on status changes
    IF NEW.booking_status != OLD.booking_status THEN
        CASE NEW.booking_status
            WHEN 'confirmed' THEN
                NEW.confirmed_at := NOW();
            WHEN 'in_progress' THEN
                NEW.started_at := NOW();
            WHEN 'completed' THEN
                NEW.completed_at := NOW();
            WHEN 'cancelled' THEN
                NEW.cancelled_at := NOW();
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create trigger for status validation
DROP TRIGGER IF EXISTS validate_booking_status_trigger ON bookings;
CREATE TRIGGER validate_booking_status_trigger
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION validate_booking_status_transition();

-- 9. Create a view for booking details with related information
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
    
    -- User Information
    u.full_name as customer_name,
    u.email as customer_email,
    u.phone as customer_phone,
    
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
    p.phone as provider_phone,
    
    -- Location Information
    b.service_address,
    b.service_city,
    b.service_state,
    b.contact_phone,
    b.special_instructions,
    
    -- Ratings
    b.customer_rating,
    b.customer_feedback,
    b.provider_rating,
    b.provider_feedback
    
FROM bookings b
LEFT JOIN users u ON b.user_id = u.id
LEFT JOIN services s ON b.service_id = s.id
LEFT JOIN service_categories sc ON b.category_id = sc.id
LEFT JOIN users p ON b.assigned_provider_id = p.id
WHERE b.internal_status = 'active';

-- 10. Create Row Level Security (RLS) policies
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own bookings
CREATE POLICY "Users can view their own bookings" ON bookings
    FOR SELECT USING (auth.uid()::text = (SELECT auth_user_id FROM users WHERE id = user_id));

-- Policy for users to create their own bookings
CREATE POLICY "Users can create their own bookings" ON bookings
    FOR INSERT WITH CHECK (auth.uid()::text = (SELECT auth_user_id FROM users WHERE id = user_id));

-- Policy for users to update their own bookings (limited fields)
CREATE POLICY "Users can update their own bookings" ON bookings
    FOR UPDATE USING (auth.uid()::text = (SELECT auth_user_id FROM users WHERE id = user_id))
    WITH CHECK (auth.uid()::text = (SELECT auth_user_id FROM users WHERE id = user_id));

-- Policy for service providers to see bookings assigned to them
CREATE POLICY "Providers can view assigned bookings" ON bookings
    FOR SELECT USING (auth.uid()::text = (SELECT auth_user_id FROM users WHERE id = assigned_provider_id));

-- Policy for service providers to update assigned bookings
CREATE POLICY "Providers can update assigned bookings" ON bookings
    FOR UPDATE USING (auth.uid()::text = (SELECT auth_user_id FROM users WHERE id = assigned_provider_id));

-- Policy for admins to see all bookings
CREATE POLICY "Admins can view all bookings" ON bookings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid()::text 
            AND role IN ('admin', 'super_admin')
        )
    );

-- 11. Create sample data (optional - for testing)
-- Uncomment the following section if you want to insert sample data

/*
INSERT INTO bookings (
    user_id, service_id, category_id,
    scheduled_date, scheduled_time,
    service_address, service_city, service_state, service_country,
    contact_phone, payment_method, booking_status
) VALUES (
    (SELECT id FROM users LIMIT 1), -- Replace with actual user ID
    (SELECT id FROM services LIMIT 1), -- Replace with actual service ID
    (SELECT id FROM service_categories LIMIT 1), -- Replace with actual category ID
    CURRENT_DATE + INTERVAL '1 day',
    '10:00:00',
    '123 Main Street, Apartment 4B',
    'Mumbai',
    'Maharashtra',
    'India',
    '+91-9876543210',
    'card',
    'pending'
);
*/

-- 12. Create a function to get booking statistics
CREATE OR REPLACE FUNCTION get_booking_statistics()
RETURNS TABLE (
    total_bookings BIGINT,
    pending_bookings BIGINT,
    confirmed_bookings BIGINT,
    completed_bookings BIGINT,
    cancelled_bookings BIGINT,
    total_revenue DECIMAL(12,2),
    avg_rating DECIMAL(3,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_bookings,
        COUNT(*) FILTER (WHERE booking_status = 'pending') as pending_bookings,
        COUNT(*) FILTER (WHERE booking_status = 'confirmed') as confirmed_bookings,
        COUNT(*) FILTER (WHERE booking_status = 'completed') as completed_bookings,
        COUNT(*) FILTER (WHERE booking_status = 'cancelled') as cancelled_bookings,
        COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'completed'), 0) as total_revenue,
        COALESCE(AVG(customer_rating), 0) as avg_rating
    FROM bookings
    WHERE internal_status = 'active'
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 13. Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON bookings TO authenticated;
GRANT SELECT ON booking_details_view TO authenticated;
GRANT EXECUTE ON FUNCTION get_booking_statistics() TO authenticated;

-- 14. Create comments for documentation
COMMENT ON TABLE bookings IS 'Stores all booking information from the booking modal including scheduling, location, payment, and status tracking';
COMMENT ON COLUMN bookings.booking_status IS 'Current status of the booking: pending, confirmed, assigned, in_progress, completed, cancelled, rescheduled, no_show, disputed';
COMMENT ON COLUMN bookings.payment_status IS 'Payment status: pending, processing, completed, failed, refunded, cancelled';
COMMENT ON COLUMN bookings.payment_method IS 'Payment method used: card, upi, cod, wallet, netbanking';
COMMENT ON COLUMN bookings.service_address IS 'Complete service address where the service will be performed';
COMMENT ON COLUMN bookings.contact_phone IS 'Customer contact number for the service';
COMMENT ON COLUMN bookings.special_instructions IS 'Any special instructions or requirements from the customer';
COMMENT ON COLUMN bookings.internal_status IS 'Internal status for data management: active, archived, deleted';

-- 15. Final verification query
SELECT 
    'Bookings table created successfully!' as status,
    COUNT(*) as existing_bookings
FROM bookings;

-- Show table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'bookings' 
ORDER BY ordinal_position;
