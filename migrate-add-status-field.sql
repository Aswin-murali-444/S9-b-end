-- Migration script to add status field to existing provider_profiles table
-- Run this if you already have the provider_profiles table without the status field

-- 1) Create enum type for profile status (if it doesn't exist)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type public.profile_status as enum (
      'incomplete',     -- Profile is not yet completed
      'pending',        -- Profile completed, awaiting verification
      'verified',        -- Profile verified and approved
      'rejected',        -- Profile rejected (needs revision)
      'suspended'        -- Profile temporarily suspended
    );
  end if;
end $$;

-- 2) Add status column to existing table
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'status'
  ) then
    alter table public.provider_profiles add column status public.profile_status default 'incomplete' not null;
  end if;
end $$;

-- 3) Add location columns if they don't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'location_latitude'
  ) then
    alter table public.provider_profiles add column location_latitude decimal(10,8);
  end if;
  
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'location_longitude'
  ) then
    alter table public.provider_profiles add column location_longitude decimal(11,8);
  end if;
  
  -- Add hourly_rate column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'hourly_rate'
  ) then
    alter table public.provider_profiles add column hourly_rate decimal(10,2);
  end if;
  
  -- Add years_of_experience column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'years_of_experience'
  ) then
    alter table public.provider_profiles add column years_of_experience integer;
  end if;
end $$;

-- 4) Add indexes for new fields
create index if not exists idx_provider_profiles_status on public.provider_profiles(status);
create index if not exists idx_provider_profiles_hourly_rate on public.provider_profiles(hourly_rate);
create index if not exists idx_provider_profiles_years_experience on public.provider_profiles(years_of_experience);

-- 5) Update existing profiles to 'pending' status if they have complete data
update public.provider_profiles 
set status = 'pending' 
where status = 'incomplete' 
  and first_name is not null 
  and last_name is not null 
  and phone is not null 
  and address is not null 
  and city is not null 
  and state is not null 
  and pincode is not null;

-- 6) Add comments
comment on column public.provider_profiles.status is 'Profile completion and verification status: incomplete, pending, verified, rejected, suspended.';
comment on column public.provider_profiles.hourly_rate is 'Hourly rate charged by the provider in local currency (decimal with 2 decimal places).';
comment on column public.provider_profiles.years_of_experience is 'Number of years of experience the provider has in their field (integer).';
comment on type public.profile_status is 'Enum type for provider profile status tracking completion and verification states.';

-- 7) Create status log table if it doesn't exist
create table if not exists public.profile_status_log (
  id uuid default gen_random_uuid() primary key,
  provider_id uuid references public.provider_profiles(provider_id) on delete cascade,
  old_status public.profile_status,
  new_status public.profile_status not null,
  reason text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_profile_status_log_provider_id on public.profile_status_log(provider_id);
create index if not exists idx_profile_status_log_created_at on public.profile_status_log(created_at);

comment on table public.profile_status_log is 'Logs all profile status changes for audit trail.';
comment on column public.profile_status_log.reason is 'Optional reason for status change (e.g., "Document verification failed", "Profile approved by admin").';

-- 8) Update the view to include status and new fields
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

-- Migration complete ✅
