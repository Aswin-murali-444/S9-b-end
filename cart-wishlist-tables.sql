-- =====================================================
-- CART AND WISHLIST TABLES
-- =====================================================
-- This creates tables to store user cart and wishlist data persistently

-- 1) Create user_cart table
create table if not exists public.user_cart (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  quantity integer not null default 1,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint user_cart_user_service_unique unique (user_id, service_id)
);

-- 2) Create user_wishlist table
create table if not exists public.user_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint user_wishlist_user_service_unique unique (user_id, service_id)
);

-- 3) Create indexes for better performance
create index if not exists idx_user_cart_user_id on public.user_cart(user_id);
create index if not exists idx_user_cart_service_id on public.user_cart(service_id);
create index if not exists idx_user_cart_added_at on public.user_cart(added_at);

create index if not exists idx_user_wishlist_user_id on public.user_wishlist(user_id);
create index if not exists idx_user_wishlist_service_id on public.user_wishlist(service_id);
create index if not exists idx_user_wishlist_added_at on public.user_wishlist(added_at);

-- 4) Add comments for documentation
comment on table public.user_cart is 'Stores items in user shopping cart with quantities.';
comment on table public.user_wishlist is 'Stores services saved to user wishlist.';

comment on column public.user_cart.user_id is 'Foreign key to users.id - identifies the cart owner.';
comment on column public.user_cart.service_id is 'Foreign key to services.id - the service in cart.';
comment on column public.user_cart.quantity is 'Number of this service in cart (default 1).';

comment on column public.user_wishlist.user_id is 'Foreign key to users.id - identifies the wishlist owner.';
comment on column public.user_wishlist.service_id is 'Foreign key to services.id - the service in wishlist.';

-- 5) Create function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

-- 6) Create trigger for user_cart updated_at
create trigger update_user_cart_updated_at
    before update on public.user_cart
    for each row
    execute function update_updated_at_column();

-- 7) Enable Row Level Security (RLS)
alter table public.user_cart enable row level security;
alter table public.user_wishlist enable row level security;

-- 8) Create RLS policies
-- Users can only see their own cart items
create policy "Users can view their own cart" on public.user_cart
    for select using (auth.uid() = user_id);

-- Users can only insert their own cart items
create policy "Users can insert their own cart items" on public.user_cart
    for insert with check (auth.uid() = user_id);

-- Users can only update their own cart items
create policy "Users can update their own cart items" on public.user_cart
    for update using (auth.uid() = user_id);

-- Users can only delete their own cart items
create policy "Users can delete their own cart items" on public.user_cart
    for delete using (auth.uid() = user_id);

-- Users can only see their own wishlist items
create policy "Users can view their own wishlist" on public.user_wishlist
    for select using (auth.uid() = user_id);

-- Users can only insert their own wishlist items
create policy "Users can insert their own wishlist items" on public.user_wishlist
    for insert with check (auth.uid() = user_id);

-- Users can only delete their own wishlist items
create policy "Users can delete their own wishlist items" on public.user_wishlist
    for delete using (auth.uid() = user_id);
