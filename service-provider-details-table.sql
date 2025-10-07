-- Creates the service_provider_details table and links it 1:1 with users(id)

-- 1) Table
create table if not exists public.service_provider_details (
  id uuid primary key references public.users(id) on delete cascade,
  specialization text,
  service_category_id uuid,
  service_id uuid,
  status text default 'pending_verification',
  created_by_admin boolean default true,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Ensure columns exist when table already existed previously
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_provider_details' and column_name = 'service_category_id'
  ) then
    alter table public.service_provider_details add column service_category_id uuid;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_provider_details' and column_name = 'service_id'
  ) then
    alter table public.service_provider_details add column service_id uuid;
  end if;
end $$;

-- Add foreign keys if missing
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_sp_details_category' and table_schema = 'public'
  ) then
    alter table public.service_provider_details
      add constraint fk_sp_details_category foreign key (service_category_id)
      references public.service_categories(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'fk_sp_details_service' and table_schema = 'public'
  ) then
    alter table public.service_provider_details
      add constraint fk_sp_details_service foreign key (service_id)
      references public.services(id) on delete set null;
  end if;
end $$;

-- 2) Suggested enum-like constraint for status
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'service_provider_details'
      and constraint_name = 'sp_details_status_check'
  ) then
    alter table public.service_provider_details
      add constraint sp_details_status_check
      check (status in ('active','suspended','pending_verification','inactive'));
  end if;
end $$;

-- 3) Indexes
create index if not exists idx_sp_details_status on public.service_provider_details(status);
create index if not exists idx_sp_details_service_category on public.service_provider_details(service_category_id);
create index if not exists idx_sp_details_service on public.service_provider_details(service_id);
create index if not exists idx_sp_details_created_at on public.service_provider_details(created_at);

-- 4) updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sp_details_updated_at on public.service_provider_details;
create trigger trg_sp_details_updated_at
before update on public.service_provider_details
for each row execute function public.set_updated_at();

-- 5) Row Level Security (optional)
-- alter table public.service_provider_details enable row level security;
-- create policy "Allow owners read" on public.service_provider_details
--   for select using (auth.uid() = id);
-- create policy "Allow owners update" on public.service_provider_details
--   for update using (auth.uid() = id);
-- create policy "Admins full access" on public.service_provider_details
--   for all using (exists (
--     select 1 from public.users u
--     where u.id = auth.uid() and u.role = 'admin'
--   ));

-- Done ✅


