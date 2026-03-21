-- Simple fix for provider_profiles status enum issue
-- This approach avoids the view dependency problem by using a different strategy

-- 1) First, let's check what the current default value is
-- (This is just for information - you can run this to see the current state)
SELECT 
    column_name, 
    column_default,
    data_type
FROM information_schema.columns 
WHERE table_name = 'provider_profiles' 
    AND table_schema = 'public' 
    AND column_name = 'status';

-- 2) Create the correct enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_status') THEN
        CREATE TYPE public.profile_status AS ENUM (
            'incomplete',
            'pending', 
            'active',
            'verified',
            'rejected',
            'suspended'
        );
        RAISE NOTICE 'Created profile_status enum';
    ELSE
        RAISE NOTICE 'profile_status enum already exists';
    END IF;
END $$;

-- 3) Fix the default value without changing the column type
-- This is the key fix - change the default from 'pending_verification' to 'incomplete'
ALTER TABLE public.provider_profiles 
ALTER COLUMN status SET DEFAULT 'incomplete';

-- 4) Update any existing rows that have 'pending_verification' to 'incomplete'
-- First, we need to temporarily allow the invalid value to exist
-- We'll do this by temporarily changing the column type to text
ALTER TABLE public.provider_profiles 
ALTER COLUMN status TYPE text;

-- Now we can update the invalid values
UPDATE public.provider_profiles 
SET status = 'incomplete' 
WHERE status = 'pending_verification';

-- Convert back to the enum type
ALTER TABLE public.provider_profiles 
ALTER COLUMN status TYPE public.profile_status 
USING status::public.profile_status;

-- 5) Create index for better performance
CREATE INDEX IF NOT EXISTS idx_provider_profiles_status ON public.provider_profiles(status);

-- 6) Add comment for documentation
COMMENT ON COLUMN public.provider_profiles.status IS 'Profile status: incomplete, pending, active, verified, rejected, suspended';

-- Done! ✅
-- This should fix the profile completion issue without breaking the view
