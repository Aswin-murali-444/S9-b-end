-- Provider Profiles Table with Status Field
-- This creates a `provider_profiles` table that stores profile information collected
-- from the Profile Completion modal. It links 1:1 to `service_provider_details` (and implicitly users)
-- and stores ONLY Aadhaar extracted data (NOT the Aadhaar images). Profile photo is stored as a URL.

-- 1) Create enum type for profile status (only if it doesn't exist)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type public.profile_status as enum (
      'incomplete',     -- Profile is not yet completed
      'pending',        -- Profile completed, awaiting verification
      'active',         -- Profile completed and active (ready to receive bookings)
      'verified',       -- Profile verified and approved
      'rejected',       -- Profile rejected (needs revision)
      'suspended'       -- Profile temporarily suspended
    );
  end if;
end $$;

-- 2) Table
create table if not exists public.provider_profiles (
  -- 1:1 mapping to a service provider (same id as public.users and service_provider_details.id)
  provider_id uuid primary key references public.service_provider_details(id) on delete cascade,

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
  certifications text[], -- optional
  languages text[], -- optional, supports quick-add chips
  hourly_rate decimal(10,2), -- hourly rate in local currency
  years_of_experience integer, -- years of experience in the field

  -- Documents & Verification (Aadhaar extracted fields only; NO image storage here)
  profile_photo_url text, -- URL or storage path for profile photo
  aadhaar_number varchar(20),
  aadhaar_name text,
  aadhaar_dob date,
  aadhaar_gender text,
  aadhaar_address text,

  -- Profile Status
  status public.profile_status default 'incomplete' not null,

  -- Metadata
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 3) Ensure columns exist when table already existed previously (idempotent safety)
do $$
begin
  -- Add status column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'status'
  ) then
    alter table public.provider_profiles add column status public.profile_status default 'incomplete' not null;
  end if;
  
  -- Add location_latitude column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'location_latitude'
  ) then
    alter table public.provider_profiles add column location_latitude decimal(10,8);
  end if;
  
  -- Add location_longitude column if it doesn't exist
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

-- 4) Useful indexes
create index if not exists idx_provider_profiles_city on public.provider_profiles(city);
create index if not exists idx_provider_profiles_state on public.provider_profiles(state);
create index if not exists idx_provider_profiles_pincode on public.provider_profiles(pincode);
create index if not exists idx_provider_profiles_languages on public.provider_profiles using gin(languages);
create index if not exists idx_provider_profiles_status on public.provider_profiles(status);
create index if not exists idx_provider_profiles_hourly_rate on public.provider_profiles(hourly_rate);
create index if not exists idx_provider_profiles_years_experience on public.provider_profiles(years_of_experience);

-- 5) updated_at trigger (re-uses global helper if present)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_provider_profiles_updated_at on public.provider_profiles;
create trigger trg_provider_profiles_updated_at
before update on public.provider_profiles
for each row execute function public.set_updated_at();

-- 6) Comments for documentation
comment on table public.provider_profiles is 'Stores provider profile info linked 1:1 with service_provider_details; contains personal, location, professional info, profile photo URL, and Aadhaar extracted fields only.';
comment on column public.provider_profiles.provider_id is 'Primary key; also FK to service_provider_details(id), which equals users(id).';
comment on column public.provider_profiles.qualifications is 'List of qualifications (free-form).';
comment on column public.provider_profiles.certifications is 'List of certifications (optional).';
comment on column public.provider_profiles.languages is 'Languages spoken as an array of text values.';
comment on column public.provider_profiles.profile_photo_url is 'URL or storage path to profile photo in storage; not binary.';
comment on column public.provider_profiles.aadhaar_number is 'Aadhaar number extracted from OCR/API; do not store Aadhaar images.';
comment on column public.provider_profiles.status is 'Profile completion and verification status: incomplete, pending, active, verified, rejected, suspended.';
comment on column public.provider_profiles.hourly_rate is 'Hourly rate charged by the provider in local currency (decimal with 2 decimal places).';
comment on column public.provider_profiles.years_of_experience is 'Number of years of experience the provider has in their field (integer).';
comment on type public.profile_status is 'Enum type for provider profile status tracking completion and verification states: incomplete, pending, active, verified, rejected, suspended.';

-- 7) Optional Row Level Security (uncomment to enable in Supabase)
-- alter table public.provider_profiles enable row level security;
-- create policy "Allow owners read" on public.provider_profiles
--   for select using (auth.uid() = provider_id);
-- create policy "Allow owners upsert" on public.provider_profiles
--   for all using (auth.uid() = provider_id) with check (auth.uid() = provider_id);

-- 8) Convenience view joining read-only service fields (category/service/rate live in service_provider_details)
-- Ensure dependent columns exist on service_provider_details for compatibility
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_provider_details' and column_name = 'experience_years'
  ) then
    alter table public.service_provider_details add column experience_years integer default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_provider_details' and column_name = 'hourly_rate'
  ) then
    alter table public.service_provider_details add column hourly_rate decimal(10,2) default 0.00;
  end if;
end $$;

-- Actual view definition
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

-- 9) Helper function to update profile status
create or replace function public.update_profile_status(
  p_provider_id uuid,
  p_status public.profile_status,
  p_reason text default null
)
returns boolean as $$
begin
  update public.provider_profiles 
  set 
    status = p_status,
    updated_at = now()
  where provider_id = p_provider_id;
  
  -- Log status change if reason provided
  if p_reason is not null then
    insert into public.profile_status_log (provider_id, old_status, new_status, reason, created_at)
    values (p_provider_id, (select status from public.provider_profiles where provider_id = p_provider_id), p_status, p_reason, now());
  end if;
  
  return true;
exception
  when others then
    return false;
end;
$$ language plpgsql;

-- 10) Optional: Create status log table for tracking status changes
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

-- Done ✅
