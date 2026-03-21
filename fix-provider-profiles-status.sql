-- Fix Provider Profiles Status System
-- This script fixes the profile_status enum and default value issue

-- 1) Create the profile_status enum if it doesn't exist
do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type public.profile_status as enum (
      'incomplete',
      'pending', 
      'active',
      'verified',
      'rejected',
      'suspended'
    );
    raise notice 'Created profile_status enum';
  else
    raise notice 'profile_status enum already exists';
  end if;
end $$;

-- 2) Fix the default value for the status column
-- The issue is that the column has a default of 'pending_verification' 
-- but the enum doesn't include that value
alter table public.provider_profiles 
alter column status set default 'incomplete';

-- 3) Handle the view dependency issue
-- First, drop the view that depends on the status column
drop view if exists public.provider_profile_view;

-- 4) Ensure the status column uses the correct enum type
-- First convert to text, then back to enum
alter table public.provider_profiles 
alter column status type text;

alter table public.provider_profiles 
alter column status type public.profile_status 
using status::public.profile_status;

-- 4) Set the correct default value
alter table public.provider_profiles 
alter column status set default 'incomplete';

-- 5) Add not null constraint if it doesn't exist
alter table public.provider_profiles 
alter column status set not null;

-- 6) Create index for better performance
create index if not exists idx_provider_profiles_status on public.provider_profiles(status);

-- 7) Recreate the view that was dropped
create or replace view public.provider_profile_view as
select
  spd.id as provider_id,
  spd.specialization,
  spd.service_category_id,
  spd.service_id,
  spd.experience_years as spd_experience_years, -- from service_provider_details
  spd.hourly_rate as spd_hourly_rate, -- from service_provider_details
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
  pp.hourly_rate, -- from provider_profiles (preferred)
  pp.years_of_experience, -- from provider_profiles (preferred)
  pp.status,
  pp.created_at,
  pp.updated_at
from public.service_provider_details spd
left join public.provider_profiles pp on pp.provider_id = spd.id;

-- 8) Add comment for documentation
comment on column public.provider_profiles.status is 'Profile status: incomplete, pending, active, verified, rejected, suspended';

-- Done! ✅
-- Now the profile completion should work correctly
