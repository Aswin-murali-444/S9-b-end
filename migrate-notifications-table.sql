-- Migration script to update notifications table structure
-- Run this AFTER creating the new table structure

-- First, backup existing notifications (if any)
CREATE TABLE IF NOT EXISTS notifications_backup AS 
SELECT * FROM notifications;

-- Drop the old table
DROP TABLE IF EXISTS notifications CASCADE;

-- Create the new notifications table
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender_id ON notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_entity ON notifications(related_entity_type, related_entity_id);

-- Migrate data from backup (if exists)
INSERT INTO notifications (
  id, type, title, message, recipient_id, sender_id, 
  related_entity_type, related_entity_id, status, priority, 
  metadata, created_at, read_at, dismissed_at
)
SELECT 
  id, type, title, message,
  COALESCE(user_id, provider_id) as recipient_id, -- Use whichever exists
  admin_user_id as sender_id,
  CASE 
    WHEN provider_id IS NOT NULL THEN 'provider_profile'
    ELSE 'general'
  END as related_entity_type,
  COALESCE(provider_id, user_id) as related_entity_id,
  status, priority, metadata, created_at, read_at, dismissed_at
FROM notifications_backup
WHERE EXISTS (SELECT 1 FROM notifications_backup);

-- Drop backup table
DROP TABLE IF EXISTS notifications_backup;

-- Recreate triggers and functions
CREATE OR REPLACE FUNCTION notify_admin_profile_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending_verification' AND (OLD.status IS NULL OR OLD.status != 'pending_verification') THEN
    INSERT INTO notifications (
      type, title, message, recipient_id, sender_id,
      related_entity_type, related_entity_id, status, priority, metadata
    )
    SELECT 
      'profile_completed',
      'New Provider Profile Completed',
      'A service provider has completed their profile and is awaiting verification.',
      admin_users.id,
      NEW.provider_id,
      'provider_profile',
      NEW.provider_id,
      'unread',
      'high',
      jsonb_build_object(
        'provider_id', NEW.provider_id,
        'status', NEW.status,
        'completed_at', NOW()
      )
    FROM users admin_users
    WHERE admin_users.role = 'admin' AND admin_users.status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION notify_provider_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
    INSERT INTO notifications (
      type, title, message, recipient_id, sender_id,
      related_entity_type, related_entity_id, status, priority, metadata
    ) VALUES (
      'verification_status_changed',
      'Verification Status Updated',
      'Your provider verification status has been updated to: ' || NEW.status,
      NEW.provider_id,
      NULL,
      'provider_profile',
      NEW.provider_id,
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
      NEW.provider_id,
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

-- Recreate triggers
DROP TRIGGER IF EXISTS trigger_notify_admin_profile_completed ON provider_profiles;
CREATE TRIGGER trigger_notify_admin_profile_completed
  AFTER INSERT OR UPDATE ON provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_admin_profile_completed();

DROP TRIGGER IF EXISTS trigger_notify_provider_status_change ON provider_profiles;
CREATE TRIGGER trigger_notify_provider_status_change
  AFTER UPDATE ON provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_provider_status_change();

DROP TRIGGER IF EXISTS trigger_notify_booking_update ON bookings;
CREATE TRIGGER trigger_notify_booking_update
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_update();
