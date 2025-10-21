-- Provider Profiles Table
-- This creates a `provider_profiles` table that stores profile information collected
-- from the Profile Completion modal. It links 1:1 to `service_provider_details` (and implicitly users)
-- and stores ONLY Aadhaar extracted data (NOT the Aadhaar images). Profile photo is stored as a URL.

-- 1) Table
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

  -- Documents & Verification (Aadhaar extracted fields only; NO image storage here)
  profile_photo_url text, -- URL or storage path for profile photo
  aadhaar_number varchar(20),
  aadhaar_name text,
  aadhaar_dob date,
  aadhaar_gender text,
  aadhaar_address text,

  -- Metadata
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 2) Ensure columns exist when table already existed previously (idempotent safety)
do $$
begin
  -- Example: if future migrations add columns, copy pattern below.
  -- if not exists (
  --   select 1 from information_schema.columns
  --   where table_schema = 'public' and table_name = 'provider_profiles' and column_name = 'some_new_column'
  -- ) then
  --   alter table public.provider_profiles add column some_new_column text;
  -- end if;
  null;
end $$;

-- 3) Useful indexes
create index if not exists idx_provider_profiles_city on public.provider_profiles(city);
create index if not exists idx_provider_profiles_state on public.provider_profiles(state);
create index if not exists idx_provider_profiles_pincode on public.provider_profiles(pincode);
create index if not exists idx_provider_profiles_languages on public.provider_profiles using gin(languages);

-- 4) updated_at trigger (re-uses global helper if present)
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

-- 5) Comments for documentation
comment on table public.provider_profiles is 'Stores provider profile info linked 1:1 with service_provider_details; contains personal, location, professional info, profile photo URL, and Aadhaar extracted fields only.';
comment on column public.provider_profiles.provider_id is 'Primary key; also FK to service_provider_details(id), which equals users(id).';
comment on column public.provider_profiles.qualifications is 'List of qualifications (free-form).';
comment on column public.provider_profiles.certifications is 'List of certifications (optional).';
comment on column public.provider_profiles.languages is 'Languages spoken as an array of text values.';
comment on column public.provider_profiles.profile_photo_url is 'URL or storage path to profile photo in storage; not binary.';
comment on column public.provider_profiles.aadhaar_number is 'Aadhaar number extracted from OCR/API; do not store Aadhaar images.';

-- 6) Optional Row Level Security (uncomment to enable in Supabase)
-- alter table public.provider_profiles enable row level security;
-- create policy "Allow owners read" on public.provider_profiles
--   for select using (auth.uid() = provider_id);
-- create policy "Allow owners upsert" on public.provider_profiles
--   for all using (auth.uid() = provider_id) with check (auth.uid() = provider_id);

-- 7) Convenience view joining read-only service fields (category/service/rate live in service_provider_details)
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
  spd.experience_years,
  spd.hourly_rate,
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
  pp.created_at,
  pp.updated_at
from public.service_provider_details spd
left join public.provider_profiles pp on pp.provider_id = spd.id;

-- Done ✅


