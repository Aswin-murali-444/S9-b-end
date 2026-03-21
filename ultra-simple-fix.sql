-- Ultra-simple fix for provider_profiles status enum issue
-- This approach avoids all potential issues by being very careful about the order

-- 1) First, let's check what the current default value is
-- (This is just for information)
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

-- 3) The main fix - change the default value
-- This is the most important part
ALTER TABLE public.provider_profiles 
ALTER COLUMN status SET DEFAULT 'incomplete';

-- 4) Create index for better performance
CREATE INDEX IF NOT EXISTS idx_provider_profiles_status ON public.provider_profiles(status);

-- 5) Add comment for documentation
COMMENT ON COLUMN public.provider_profiles.status IS 'Profile status: incomplete, pending, active, verified, rejected, suspended';

-- Done! ✅
-- This should fix the profile completion issue
-- The key fix is changing the default value from 'pending_verification' to 'incomplete'
