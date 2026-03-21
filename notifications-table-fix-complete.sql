-- =============================================================================
-- Notifications table and triggers – complete fix
--
-- Option A: Run this ENTIRE file once in Supabase Dashboard → SQL Editor.
--
-- Option B: Run via backend (one statement per file; run in order):
--   node scripts/run-sql.js notifications-table-fix-complete.sql   (creates table)
--   node scripts/run-sql.js notifications-fix-part2-add-column.sql
--   node scripts/run-sql.js notifications-fix-part3-booking-trigger.sql
--   node scripts/run-sql.js notifications-fix-part4-booking-trigger-attach.sql
--   node scripts/run-sql.js notifications-fix-part5-spd-triggers.sql
--   node scripts/run-sql.js notifications-fix-part6-spd-status-function.sql
--   node scripts/run-sql.js notifications-fix-part7-spd-triggers-attach.sql
--   node scripts/run-sql.js notifications-fix-part8-spd-status-trigger.sql
-- =============================================================================

-- 1) Create notifications table with all columns the API expects (recipient_id, sender_id, admin_user_id, etc.)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  recipient_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  admin_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ
);

-- Add admin_user_id if table already existed without it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'admin_user_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN admin_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added admin_user_id to notifications';
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender_id ON public.notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_entity ON public.notifications(related_entity_type, related_entity_id);

-- 2) Booking update: use assigned_provider_id and user_id, booking_status (bookings table)
CREATE OR REPLACE FUNCTION public.notify_booking_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.booking_status IS NOT NULL AND NEW.booking_status != OLD.booking_status THEN
    -- Notify customer
    INSERT INTO public.notifications (
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
      CASE
        WHEN NEW.booking_status = 'cancelled' THEN 'high'
        WHEN NEW.booking_status = 'completed' THEN 'medium'
        ELSE 'low'
      END,
      jsonb_build_object(
        'booking_id', NEW.id,
        'old_status', OLD.booking_status,
        'new_status', NEW.booking_status,
        'updated_at', NOW()
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_booking_update ON public.bookings;
CREATE TRIGGER trigger_notify_booking_update
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_booking_update();

-- 3) Provider status (service_provider_details): notify admins when pending_verification; notify provider when status changes
CREATE OR REPLACE FUNCTION public.notify_admin_profile_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending_verification' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'pending_verification') THEN
    INSERT INTO public.notifications (
      type, title, message, recipient_id, sender_id,
      related_entity_type, related_entity_id, status, priority, metadata
    )
    SELECT
      'profile_completed',
      'New Provider Profile Completed',
      'A service provider has completed their profile and is awaiting verification.',
      u.id,
      NEW.id,
      'provider_profile',
      NEW.id,
      'unread',
      'high',
      jsonb_build_object(
        'provider_id', NEW.id,
        'status', NEW.status,
        'completed_at', NOW()
      )
    FROM public.users u
    WHERE u.role = 'admin' AND u.status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.notify_provider_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (
      type, title, message, recipient_id, sender_id,
      related_entity_type, related_entity_id, status, priority, metadata
    ) VALUES (
      'verification_status_changed',
      'Verification Status Updated',
      'Your provider verification status has been updated to: ' || NEW.status,
      NEW.id,
      NULL,
      'provider_profile',
      NEW.id,
      'unread',
      'medium',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'updated_at', NOW()
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_admin_profile_completed ON public.service_provider_details;
CREATE TRIGGER trigger_notify_admin_profile_completed
  AFTER INSERT OR UPDATE ON public.service_provider_details
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_profile_completed();

DROP TRIGGER IF EXISTS trigger_notify_provider_status_change ON public.service_provider_details;
CREATE TRIGGER trigger_notify_provider_status_change
  AFTER UPDATE ON public.service_provider_details
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_provider_status_change();

-- 4) Optional: same logic for provider_profiles table (uses provider_id, not id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'provider_profiles')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'provider_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'provider_profiles' AND column_name = 'status')
  THEN
    CREATE OR REPLACE FUNCTION public.notify_admin_profile_completed_pp()
    RETURNS TRIGGER AS $f$
    BEGIN
      IF NEW.status = 'pending_verification' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'pending_verification') THEN
        INSERT INTO public.notifications (type, title, message, recipient_id, sender_id, related_entity_type, related_entity_id, status, priority, metadata)
        SELECT 'profile_completed', 'New Provider Profile Completed', 'A service provider has completed their profile and is awaiting verification.',
          u.id, NEW.provider_id, 'provider_profile', NEW.provider_id, 'unread', 'high',
          jsonb_build_object('provider_id', NEW.provider_id, 'status', NEW.status, 'completed_at', NOW())
        FROM public.users u WHERE u.role = 'admin' AND u.status = 'active';
      END IF;
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION public.notify_provider_status_change_pp()
    RETURNS TRIGGER AS $f$
    BEGIN
      IF OLD.status IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.notifications (type, title, message, recipient_id, sender_id, related_entity_type, related_entity_id, status, priority, metadata)
        VALUES ('verification_status_changed', 'Verification Status Updated', 'Your provider verification status has been updated to: ' || NEW.status,
          NEW.provider_id, NULL, 'provider_profile', NEW.provider_id, 'unread', 'medium',
          jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'updated_at', NOW()));
      END IF;
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_notify_admin_profile_completed_pp ON public.provider_profiles;
    CREATE TRIGGER trigger_notify_admin_profile_completed_pp
      AFTER INSERT OR UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION public.notify_admin_profile_completed_pp();
    DROP TRIGGER IF EXISTS trigger_notify_provider_status_change_pp ON public.provider_profiles;
    CREATE TRIGGER trigger_notify_provider_status_change_pp
      AFTER UPDATE ON public.provider_profiles FOR EACH ROW EXECUTE FUNCTION public.notify_provider_status_change_pp();
    RAISE NOTICE 'Provider_profiles notification triggers attached';
  END IF;
END $$;

SELECT 'Notifications table and triggers updated successfully.' AS status;
