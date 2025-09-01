-- Create Admin User Script
-- This script creates an admin user that can access the admin dashboard
-- without needing to select a role on the login page

-- Step 1: Create the admin user in the users table
INSERT INTO users (
    email, 
    password_hash, 
    role, 
    status, 
    email_verified,
    phone_verified,
    created_at,
    updated_at
) VALUES (
    'admin@yourcompany.com',  -- Change this to your admin email
    'admin_password_hash',     -- Replace with actual hashed password
    'admin',
    'active',
    true,
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO UPDATE SET
    role = 'admin',
    status = 'active',
    email_verified = true,
    updated_at = NOW();

-- Step 2: Create user profile for the admin
INSERT INTO user_profiles (
    id,
    first_name,
    last_name,
    phone,
    bio,
    created_at,
    updated_at
) 
SELECT 
    u.id,
    'Admin',
    'User',
    '+1234567890',  -- Change to your admin phone number
    'System Administrator',
    NOW(),
    NOW()
FROM users u 
WHERE u.email = 'admin@yourcompany.com'
ON CONFLICT (id) DO UPDATE SET
    first_name = 'Admin',
    last_name = 'User',
    updated_at = NOW();

-- Step 3: Verify the admin user was created
SELECT 
    u.id,
    u.email,
    u.role,
    u.status,
    u.email_verified,
    up.first_name,
    up.last_name
FROM users u
LEFT JOIN user_profiles up ON u.id = up.id
WHERE u.email = 'admin@yourcompany.com';

-- Step 4: Show all available roles
SELECT unnest(enum_range(NULL::user_role)) as available_roles;
