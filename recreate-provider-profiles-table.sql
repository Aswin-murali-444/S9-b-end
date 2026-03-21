-- Create a new working provider_profiles table
-- This replaces the broken one

-- 1) Drop the broken table (this will also drop the view)
DROP VIEW IF EXISTS public.provider_profile_view;
DROP TABLE IF EXISTS public.provider_profiles CASCADE;

-- 2) Create the correct enum
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

-- 3) Create the new table with correct structure
CREATE TABLE public.provider_profiles (
  -- 1:1 mapping to a service provider
  provider_id uuid PRIMARY KEY REFERENCES public.service_provider_details(id) ON DELETE CASCADE,

  -- Personal Information
  first_name text,
  last_name text,
  phone varchar(20),

  -- Location Information
  pincode varchar(20),
  city varchar(100),
  state varchar(100),
  address text,
  location_latitude decimal(10,8),
  location_longitude decimal(11,8),

  -- Professional Information
  bio text,
  qualifications text[],
  certifications text[],
  languages text[],
  hourly_rate decimal(10,2),
  years_of_experience integer,

  -- Documents & Verification
  profile_photo_url text,
  aadhaar_number varchar(20),
  aadhaar_name text,
  aadhaar_dob date,
  aadhaar_gender text,
  aadhaar_address text,

  -- Profile Status with CORRECT default
  status public.profile_status DEFAULT 'incomplete' NOT NULL,

  -- Metadata
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4) Create indexes
CREATE INDEX idx_provider_profiles_status ON public.provider_profiles(status);
CREATE INDEX idx_provider_profiles_city ON public.provider_profiles(city);
CREATE INDEX idx_provider_profiles_state ON public.provider_profiles(state);
CREATE INDEX idx_provider_profiles_pincode ON public.provider_profiles(pincode);

-- 5) Create updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

CREATE TRIGGER trg_provider_profiles_updated_at
BEFORE UPDATE ON public.provider_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Recreate the view
CREATE VIEW public.provider_profile_view AS
SELECT
  spd.id as provider_id,
  spd.specialization,
  spd.service_category_id,
  spd.service_id,
  spd.experience_years as spd_experience_years,
  spd.hourly_rate as spd_hourly_rate,
  pp.first_name,
  pp.last_name,
  pp.phone,
  pp.pincode,
  pp.city,
  pp.state,
  pp.address,
  pp.location_latitude,
  pp.location_longitude,
  pp.bio,
  pp.qualifications,
  pp.certifications,
  pp.languages,
  pp.profile_photo_url,
  pp.aadhaar_number,
  pp.aadhaar_name,
  pp.aadhaar_dob,
  pp.aadhaar_gender,
  pp.aadhaar_address,
  pp.hourly_rate,
  pp.years_of_experience,
  pp.status,
  pp.created_at,
  pp.updated_at
FROM public.service_provider_details spd
LEFT JOIN public.provider_profiles pp ON pp.provider_id = spd.id;

-- Done! ✅
-- The table is now fixed and should work correctly
