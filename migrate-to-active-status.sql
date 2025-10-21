-- Complete Profile Status Migration to 'active'
-- This script migrates the profile completion system to set status to 'active' instead of 'pending'

-- 1) Add 'active' status to the existing profile_status enum
do $$
begin
  -- Check if 'active' already exists in the enum
  if not exists (
    select 1 from pg_enum 
    where enumlabel = 'active' 
    and enumtypid = (select oid from pg_type where typname = 'profile_status')
  ) then
    -- Add 'active' to the enum
    alter type public.profile_status add value 'active';
    raise notice 'Added ''active'' status to profile_status enum';
  else
    raise notice '''active'' status already exists in profile_status enum';
  end if;
end $$;

-- 2) Update existing 'pending' profiles to 'active' (optional - uncomment if needed)
-- This migrates existing pending profiles to active status
-- Uncomment the following block if you want to migrate existing data
/*
do $$
declare
  updated_count integer;
begin
  update public.provider_profiles 
  set status = 'active' 
  where status = 'pending';
  
  get diagnostics updated_count = row_count;
  raise notice 'Updated % profiles from pending to active', updated_count;
end $$;
*/

-- 3) Update the enum comment to reflect all available statuses
comment on type public.profile_status is 'Enum type for provider profile status tracking completion and verification states: incomplete, pending, active, verified, rejected, suspended.';

-- 4) Update the table column comment
comment on column public.provider_profiles.status is 'Profile completion and verification status: incomplete, pending, active, verified, rejected, suspended.';

-- 5) Create a helper function to set profile to active on completion
create or replace function public.set_profile_active_on_completion(
  p_provider_id uuid
)
returns boolean as $$
begin
  update public.provider_profiles 
  set 
    status = 'active',
    updated_at = now()
  where provider_id = p_provider_id;
  
  -- Log the status change
  insert into public.profile_status_log (provider_id, old_status, new_status, reason, created_at)
  values (p_provider_id, 'incomplete', 'active', 'Profile completed successfully', now());
  
  return true;
exception
  when others then
    return false;
end;
$$ language plpgsql;

-- 6) Add comment for the helper function
comment on function public.set_profile_active_on_completion(uuid) is 'Sets provider profile status to active when profile completion is successful.';

-- Done ✅
-- The backend code in routes/users.js has been updated to use 'active' status
-- Run this migration script to update your database schema
