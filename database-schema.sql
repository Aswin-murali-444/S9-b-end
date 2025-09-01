-- Database Schema for S9 Mini Application
-- This schema handles different user roles: Customer, Service Provider, Supervisor, Driver, Admin
-- 
-- Role Descriptions:
-- - customer: End users who book and receive services
-- - service_provider: Businesses and individuals who provide various services
-- - supervisor: Team leaders who oversee operations and manage staff
-- - driver: Transportation service providers
-- - admin: Platform administrators with system-wide access

-- Create enum for user roles (with error handling)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('customer', 'service_provider', 'supervisor', 'driver', 'admin');
    END IF;
END $$;

-- Add new enum values if they don't exist (must be done outside of transaction blocks)
DO $$ 
BEGIN
    -- Check if supervisor value exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON e.enumtypid = t.oid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'supervisor'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'supervisor';
    END IF;
    
    -- Check if admin value exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON e.enumtypid = t.oid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'admin';
    END IF;
END $$;

-- Create enum for user status (with error handling)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
        CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
    END IF;
END $$;

-- Main users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    status user_status DEFAULT 'pending_verification',
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles table (extends user information)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    gender VARCHAR(10),
    profile_picture_url TEXT,
    bio TEXT,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Role-specific tables for additional information

-- Customer-specific information
CREATE TABLE IF NOT EXISTS customer_details (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_services TEXT[],
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    special_requirements TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service Provider-specific information
CREATE TABLE IF NOT EXISTS service_provider_details (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(200),
    business_license VARCHAR(100),
    services_offered TEXT[],
    years_of_experience INTEGER,
    hourly_rate DECIMAL(10,2),
    availability_schedule JSONB,
    service_areas TEXT[],
    certifications TEXT[],
    insurance_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Supervisor-specific information
CREATE TABLE IF NOT EXISTS supervisor_details (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specializations TEXT[],
    years_of_experience INTEGER,
    hourly_rate DECIMAL(10,2),
    availability_schedule JSONB,
    service_areas TEXT[],
    certifications TEXT[],
    background_check_status VARCHAR(50),
    professional_references TEXT[],
    team_size INTEGER,
    management_experience INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Driver-specific information
CREATE TABLE IF NOT EXISTS driver_details (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    driver_license_number VARCHAR(100),
    vehicle_type VARCHAR(100),
    vehicle_model VARCHAR(100),
    vehicle_year INTEGER,
    vehicle_plate_number VARCHAR(20),
    insurance_info TEXT,
    driving_record TEXT,
    service_areas TEXT[],
    hourly_rate DECIMAL(10,2),
    availability_schedule JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_profiles_updated_at') THEN
        CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_customer_details_updated_at') THEN
        CREATE TRIGGER update_customer_details_updated_at BEFORE UPDATE ON customer_details
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_provider_details_updated_at') THEN
        CREATE TRIGGER update_service_provider_details_updated_at BEFORE UPDATE ON service_provider_details
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_supervisor_details_updated_at') THEN
        CREATE TRIGGER update_supervisor_details_updated_at BEFORE UPDATE ON supervisor_details
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_driver_details_updated_at') THEN
        CREATE TRIGGER update_driver_details_updated_at BEFORE UPDATE ON driver_details
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Insert sample data for testing (with error handling)
-- Note: If you encounter enum value errors, run the enum update section separately first
DO $$ 
BEGIN
    -- Insert users if they don't exist
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'customer@example.com') THEN
        INSERT INTO users (email, password_hash, role, status, email_verified) VALUES
        ('customer@example.com', 'hashed_password_123', 'customer', 'active', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'provider@example.com') THEN
        INSERT INTO users (email, password_hash, role, status, email_verified) VALUES
        ('provider@example.com', 'hashed_password_456', 'service_provider', 'active', true);
    END IF;
    
    -- Try to insert supervisor user (may fail if enum value not yet available)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'supervisor@example.com') THEN
            INSERT INTO users (email, password_hash, role, status, email_verified) VALUES
            ('supervisor@example.com', 'hashed_password_789', 'supervisor', 'active', true);
        END IF;
    EXCEPTION
        WHEN invalid_parameter_value THEN
            -- Enum value not available yet, skip for now
            RAISE NOTICE 'Supervisor role not yet available, skipping supervisor user creation';
    END;
    
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'driver@example.com') THEN
        INSERT INTO users (email, password_hash, role, status, email_verified) VALUES
        ('driver@example.com', 'hashed_password_012', 'driver', 'active', true);
    END IF;
    
    -- Try to insert admin user (may fail if enum value not yet available)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@example.com') THEN
            INSERT INTO users (email, password_hash, role, status, email_verified) VALUES
            ('admin@example.com', 'hashed_password_admin', 'admin', 'active', true);
        END IF;
    EXCEPTION
        WHEN invalid_parameter_value THEN
            -- Enum value not available yet, skip for now
            RAISE NOTICE 'Admin role not yet available, skipping admin user creation';
    END;
END $$;

-- Insert corresponding profiles (with error handling)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT id FROM users WHERE email = 'customer@example.com')) THEN
        INSERT INTO user_profiles (id, first_name, last_name, phone) VALUES
        ((SELECT id FROM users WHERE email = 'customer@example.com'), 'John', 'Customer', '+1234567890');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT id FROM users WHERE email = 'provider@example.com')) THEN
        INSERT INTO user_profiles (id, first_name, last_name, phone) VALUES
        ((SELECT id FROM users WHERE email = 'provider@example.com'), 'Jane', 'Provider', '+1234567891');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT id FROM users WHERE email = 'supervisor@example.com')) THEN
        INSERT INTO user_profiles (id, first_name, last_name, phone) VALUES
        ((SELECT id FROM users WHERE email = 'supervisor@example.com'), 'Bob', 'Supervisor', '+1234567892');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT id FROM users WHERE email = 'driver@example.com')) THEN
        INSERT INTO user_profiles (id, first_name, last_name, phone) VALUES
        ((SELECT id FROM users WHERE email = 'driver@example.com'), 'Alice', 'Driver', '+1234567893');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = (SELECT id FROM users WHERE email = 'admin@example.com')) THEN
        INSERT INTO user_profiles (id, first_name, last_name, phone) VALUES
        ((SELECT id FROM users WHERE email = 'admin@example.com'), 'Admin', 'User', '+1234567894');
    END IF;
END $$;

-- Insert role-specific details (with error handling)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM customer_details WHERE id = (SELECT id FROM users WHERE email = 'customer@example.com')) THEN
        INSERT INTO customer_details (id, preferred_services) VALUES
        ((SELECT id FROM users WHERE email = 'customer@example.com'), ARRAY['cleaning', 'cooking', 'transportation']);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM service_provider_details WHERE id = (SELECT id FROM users WHERE email = 'provider@example.com')) THEN
        INSERT INTO service_provider_details (id, business_name, services_offered, hourly_rate) VALUES
        ((SELECT id FROM users WHERE email = 'provider@example.com'), 'CleanPro Services', ARRAY['cleaning', 'maintenance'], 25.00);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM supervisor_details WHERE id = (SELECT id FROM users WHERE email = 'supervisor@example.com')) THEN
        INSERT INTO supervisor_details (id, specializations, hourly_rate, team_size, management_experience) VALUES
        ((SELECT id FROM users WHERE email = 'supervisor@example.com'), ARRAY['team_management', 'quality_assurance'], 30.00, 12, 5);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM driver_details WHERE id = (SELECT id FROM users WHERE email = 'driver@example.com')) THEN
        INSERT INTO driver_details (id, vehicle_type, hourly_rate) VALUES
        ((SELECT id FROM users WHERE email = 'driver@example.com'), 'Sedan', 15.00);
    END IF;
END $$;

-- Note: Admin users typically don't need role-specific details as they have system-wide access
-- The admin role is used for platform management, user administration, and system oversight

-- Additional admin functionality tables

-- System settings table for admin configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string',
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin audit log for tracking administrative actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for admin tables
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_user_id ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- Create trigger for system_settings updated_at
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_system_settings_updated_at') THEN
        CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Insert some default system settings (with error handling)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'platform_name') THEN
        INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
        ('platform_name', 'S9 Mini', 'string', 'Platform display name', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'maintenance_mode') THEN
        INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
        ('maintenance_mode', 'false', 'boolean', 'Platform maintenance mode', true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'max_file_upload_size') THEN
        INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
        ('max_file_upload_size', '10485760', 'number', 'Maximum file upload size in bytes', false);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'session_timeout_minutes') THEN
        INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
        ('session_timeout_minutes', '1440', 'number', 'User session timeout in minutes', false);
    END IF;
END $$;

-- Insert sample admin audit log entry (with error handling)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE action = 'user_created' AND target_id = (SELECT id FROM users WHERE email = 'customer@example.com')) THEN
        INSERT INTO admin_audit_log (admin_user_id, action, target_type, target_id, details, ip_address) VALUES
        ((SELECT id FROM users WHERE email = 'admin@example.com'), 'user_created', 'user', (SELECT id FROM users WHERE email = 'customer@example.com'), '{"email": "customer@example.com", "role": "customer"}', '127.0.0.1');
    END IF;
END $$;

-- ===================================================================
-- IMPORTANT: If you encounter enum value errors, follow these steps:
-- ===================================================================
-- 
-- 1. First, run only the enum creation and update sections:
--    - Run from the beginning up to the "Create indexes for better performance" section
--    - This will create/update the enum types
-- 
-- 2. Commit the transaction or start a new session
-- 
-- 3. Then run the rest of the script for data insertion
-- 
-- Alternative approach: Run the entire script in multiple parts:
-- 
-- Part 1: Run this section separately first:
/*
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('customer', 'service_provider', 'supervisor', 'driver', 'admin');
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON e.enumtypid = t.oid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'supervisor'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'supervisor';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e 
        JOIN pg_type t ON e.enumtypid = t.oid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'admin';
    END IF;
END $$;
*/

-- Part 2: Then run the rest of the script
-- ===================================================================
