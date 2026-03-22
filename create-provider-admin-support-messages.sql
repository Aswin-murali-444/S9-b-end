-- Linked provider admin support messages table.
-- This stores structured provider-dashboard support requests and links
-- each row to the canonical contact_messages inbox row.

create table if not exists public.provider_admin_support_messages (
  id uuid primary key default gen_random_uuid(),
  contact_message_id uuid not null unique references public.contact_messages(id) on delete cascade,
  provider_user_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_user_id uuid null references public.users(id) on delete set null,
  admin_reply text null,
  replied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_provider_admin_support_provider_user
  on public.provider_admin_support_messages(provider_user_id);

create index if not exists idx_provider_admin_support_status
  on public.provider_admin_support_messages(status);

create index if not exists idx_provider_admin_support_created_at
  on public.provider_admin_support_messages(created_at desc);
