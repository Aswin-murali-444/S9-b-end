-- Fix service_provider_details status default to pending_verification
-- This script ensures the service_provider_details table has the correct default value

-- 1) Check current default value
SELECT 
    column_name, 
    column_default,
    data_type
FROM information_schema.columns 
WHERE table_name = 'service_provider_details' 
    AND table_schema = 'public' 
    AND column_name = 'status';

-- 2) Set the correct default value
ALTER TABLE public.service_provider_details 
ALTER COLUMN status SET DEFAULT 'pending_verification';

-- 3) Verify the change
SELECT 
    column_name, 
    column_default,
    data_type
FROM information_schema.columns 
WHERE table_name = 'service_provider_details' 
    AND table_schema = 'public' 
    AND column_name = 'status';

-- 4) Test insert without specifying status (should use default)
-- This is just for testing - you can uncomment to test
/*
INSERT INTO public.service_provider_details (
    id, 
    specialization, 
    created_by_admin
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Test Specialization',
    true
);

-- Check what was inserted
SELECT id, status FROM public.service_provider_details 
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Clean up test data
DELETE FROM public.service_provider_details 
WHERE id = '00000000-0000-0000-0000-000000000001';
*/

-- Done ✅
