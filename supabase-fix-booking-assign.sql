-- =============================================================================
-- Fix Booking Assign (500 on PUT /bookings/:id/assign)
-- Ensures: users.auth_user_id, service_provider_details table, provider rows,
-- and optional booking_assign_audit test table.
--
-- Run in Supabase: Dashboard → SQL Editor → New query → paste this → Run.
-- (There is no Supabase MCP in this project; run this script manually.)
-- =============================================================================

-- 1) Ensure users table has auth_user_id (links Supabase Auth UID to app user)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'auth_user_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN auth_user_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
    RAISE NOTICE 'Added auth_user_id to users';
  ELSE
    RAISE NOTICE 'users.auth_user_id already exists';
  END IF;
END $$;

-- 2) Create service_provider_details if not exists (linked to users)
CREATE TABLE IF NOT EXISTS public.service_provider_details (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  specialization TEXT,
  service_category_id UUID,
  service_id UUID,
  status TEXT DEFAULT 'pending_verification',
  created_by_admin BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add optional FKs for category/service if tables exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_categories') THEN
    NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_sp_details_category' AND table_schema = 'public') THEN
    ALTER TABLE public.service_provider_details
      ADD CONSTRAINT fk_sp_details_category FOREIGN KEY (service_category_id)
      REFERENCES public.service_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') THEN
    NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_sp_details_service' AND table_schema = 'public') THEN
    ALTER TABLE public.service_provider_details
      ADD CONSTRAINT fk_sp_details_service FOREIGN KEY (service_id)
      REFERENCES public.services(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Status constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage c
    JOIN information_schema.table_constraints t ON t.constraint_name = c.constraint_name
    WHERE t.table_schema = 'public' AND t.table_name = 'service_provider_details' AND t.constraint_name LIKE '%status%') THEN
    ALTER TABLE public.service_provider_details
      DROP CONSTRAINT IF EXISTS sp_details_status_check;
    ALTER TABLE public.service_provider_details
      ADD CONSTRAINT sp_details_status_check CHECK (status IN ('active','suspended','pending_verification','inactive'));
  END IF;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.service_provider_details DROP CONSTRAINT IF EXISTS sp_details_status_check;
  ALTER TABLE public.service_provider_details ADD CONSTRAINT sp_details_status_check CHECK (status IN ('active','suspended','pending_verification','inactive'));
END $$;

CREATE INDEX IF NOT EXISTS idx_sp_details_status ON public.service_provider_details(status);
CREATE INDEX IF NOT EXISTS idx_sp_details_created_at ON public.service_provider_details(created_at);

-- 3) Insert missing service_provider_details for every user with role service_provider
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role') THEN
    INSERT INTO public.service_provider_details (id, status, created_by_admin, updated_at)
    SELECT u.id, 'active', false, NOW()
    FROM public.users u
    WHERE (u.role = 'service_provider' OR u.role = 'service provider')
      AND NOT EXISTS (SELECT 1 FROM public.service_provider_details spd WHERE spd.id = u.id)
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'Backfilled service_provider_details for provider users';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Backfill skipped or partial: %', SQLERRM;
END $$;

-- 4) Test table: booking_assign_audit (linked to bookings) – for debugging/audit
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    CREATE TABLE IF NOT EXISTS public.booking_assign_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
      assigned_provider_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_booking_assign_audit_booking_id ON public.booking_assign_audit(booking_id);
    CREATE INDEX IF NOT EXISTS idx_booking_assign_audit_provider_id ON public.booking_assign_audit(assigned_provider_id);
    RAISE NOTICE 'booking_assign_audit table ready';
  END IF;
END $$;

-- 5) Fix bookings trigger: use assigned_provider_id (bookings has no "provider_id" column)
CREATE OR REPLACE FUNCTION notify_booking_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.booking_status IS NOT NULL AND NEW.booking_status != OLD.booking_status THEN
    INSERT INTO notifications (
      type, title, message, recipient_id, sender_id,
      related_entity_type, related_entity_id, status, priority, metadata
    ) VALUES (
      'booking_update',
      'Booking Status Updated',
      'Your booking status has been updated to: ' || NEW.booking_status,
      NEW.user_id,
      NEW.assigned_provider_id,
      'booking',
      NEW.id,
      'unread',
      CASE WHEN NEW.booking_status = 'cancelled' THEN 'high' WHEN NEW.booking_status = 'completed' THEN 'medium' ELSE 'low' END,
      jsonb_build_object('booking_id', NEW.id, 'old_status', OLD.booking_status, 'new_status', NEW.booking_status, 'updated_at', NOW())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Done
SELECT 'Migration complete. Trigger notify_booking_update fixed (assigned_provider_id).' AS status;
