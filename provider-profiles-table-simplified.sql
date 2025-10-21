-- =====================================================
-- PROVIDER PROFILES TABLE - SIMPLIFIED VERSION
-- =====================================================
-- This creates the provider_profiles table WITHOUT the unnecessary view
-- The view was removed because it's not needed for the current implementation

-- 1) Create the provider_profiles table
create table if not exists public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.service_provider_details(id) on delete cascade,
  first_name varchar(100) not null,
  last_name varchar(100) not null,
  phone varchar(15) not null,
  pincode varchar(6) not null,
  city varchar(100) not null,
  state varchar(100) not null,
  address text not null,
  location_latitude decimal(10, 8),
  location_longitude decimal(11, 8),
  bio text,
  qualifications text[] default '{}',
  certifications text[] default '{}',
  languages text[] default '{}',
  profile_photo_url text,
  aadhaar_number varchar(12),
  aadhaar_name varchar(200),
  aadhaar_dob date,
  aadhaar_gender varchar(10),
  aadhaar_address text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint provider_profiles_provider_id_unique unique (provider_id)
);

-- 2) Create indexes for better performance
create index if not exists idx_provider_profiles_provider_id on public.provider_profiles(provider_id);
create index if not exists idx_provider_profiles_pincode on public.provider_profiles(pincode);
create index if not exists idx_provider_profiles_city on public.provider_profiles(city);
create index if not exists idx_provider_profiles_state on public.provider_profiles(state);

-- 3) Add comments for documentation
comment on table public.provider_profiles is 'Stores detailed profile information for service providers, linked to service_provider_details.';
comment on column public.provider_profiles.provider_id is 'Foreign key to service_provider_details.id (1:1 relationship).';
comment on column public.provider_profiles.first_name is 'Provider first name (required).';
comment on column public.provider_profiles.last_name is 'Provider last name (required).';
comment on column public.provider_profiles.phone is 'Provider phone number (required).';
comment on column public.provider_profiles.pincode is '6-digit postal code (required).';
comment on column public.provider_profiles.city is 'City name (required).';
comment on column public.provider_profiles.state is 'State name (required).';
comment on column public.provider_profiles.address is 'Full address (required).';
comment on column public.provider_profiles.location_latitude is 'GPS latitude for location services (optional).';
comment on column public.provider_profiles.location_longitude is 'GPS longitude for location services (optional).';
comment on column public.provider_profiles.bio is 'Provider bio/description (optional).';
comment on column public.provider_profiles.qualifications is 'List of qualifications as an array of text values.';
comment on column public.provider_profiles.certifications is 'List of certifications (optional).';
comment on column public.provider_profiles.languages is 'Languages spoken as an array of text values.';
comment on column public.provider_profiles.profile_photo_url is 'URL or storage path to profile photo in storage; not binary.';
comment on column public.provider_profiles.aadhaar_number is 'Aadhaar number extracted from OCR/API; do not store Aadhaar images.';

-- 4) Create updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger handle_provider_profiles_updated_at
  before update on public.provider_profiles
  for each row execute procedure public.handle_updated_at();

-- 5) Optional Row Level Security (uncomment to enable in Supabase)
-- alter table public.provider_profiles enable row level security;
-- create policy "Allow owners read" on public.provider_profiles
--   for select using (auth.uid() = provider_id);
-- create policy "Allow owners upsert" on public.provider_profiles
--   for all using (auth.uid() = provider_id) with check (auth.uid() = provider_id);

-- =====================================================
-- NOTES:
-- =====================================================
-- 1. This table stores profile completion data from the modal
-- 2. It has a 1:1 relationship with service_provider_details
-- 3. No view is created - queries are made directly to tables
-- 4. The API endpoints work directly with this table
-- 5. Simpler and more maintainable than the view approach
-- =====================================================
