-- Fix Provider Profiles Status System
-- This script ensures the provider_profiles table has the correct status field and enum

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

-- 2) Add status column to provider_profiles table if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' 
    and table_name = 'provider_profiles' 
    and column_name = 'status'
  ) then
    alter table public.provider_profiles 
    add column status public.profile_status default 'incomplete' not null;
    raise notice 'Added status column to provider_profiles table';
  else
    raise notice 'status column already exists in provider_profiles table';
  end if;
end $$;

-- 3) Ensure service_provider_details has the correct status constraint
do $$
begin
  -- Drop existing constraint if it exists
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name = 'sp_details_status_check'
  ) then
    alter table public.service_provider_details drop constraint sp_details_status_check;
    raise notice 'Dropped existing status constraint';
  end if;
  
  -- Add the correct constraint
  alter table public.service_provider_details 
  add constraint sp_details_status_check 
  check (status in ('active','suspended','pending_verification','inactive'));
  
  raise notice 'Added correct status constraint to service_provider_details';
end $$;

-- 4) Create indexes for better performance
create index if not exists idx_provider_profiles_status on public.provider_profiles(status);
create index if not exists idx_service_provider_details_status on public.service_provider_details(status);

-- 5) Add comments for documentation
comment on column public.provider_profiles.status is 'Profile status: incomplete, pending, active, verified, rejected, suspended';
comment on column public.service_provider_details.status is 'Service provider status: active, suspended, pending_verification, inactive';

-- Done! ✅
