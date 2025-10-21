-- Add 'active' status to profile_status enum
-- This script adds the 'active' status to the existing profile_status enum

-- Add 'active' to the existing profile_status enum
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
  end if;
end $$;

-- Update the comment to reflect the new status
comment on type public.profile_status is 'Enum type for provider profile status tracking completion and verification states: incomplete, pending, verified, rejected, suspended, active.';

-- Optional: Update any existing 'pending' profiles to 'active' if they should be active
-- Uncomment the following lines if you want to migrate existing pending profiles to active
-- update public.provider_profiles 
-- set status = 'active' 
-- where status = 'pending' 
-- and created_at < now() - interval '24 hours'; -- Only profiles older than 24 hours

-- Done ✅
