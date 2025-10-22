-- Create notifications table for admin notifications
-- Run this SQL in your Supabase SQL Editor
-- Updated to work with single users table structure

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- 'profile_completed', 'verification_requested', 'booking_update', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE, -- The user who receives the notification
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL, -- The user who triggered the notification (optional)
  related_entity_type VARCHAR(50), -- 'booking', 'profile', 'service', etc.
  related_entity_id UUID, -- ID of the related entity (booking_id, profile_id, etc.)
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  metadata JSONB, -- Additional data like old_status, new_status, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender_id ON notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_entity ON notifications(related_entity_type, related_entity_id);

-- Create a function to notify admins when provider profile is completed
CREATE OR REPLACE FUNCTION notify_admin_profile_completed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger notification when status changes to 'pending_verification'
  IF NEW.status = 'pending_verification' AND (OLD.status IS NULL OR OLD.status != 'pending_verification') THEN
    -- Find admin users to notify
    INSERT INTO notifications (
      type,
      title,
      message,
      recipient_id,
      sender_id,
      related_entity_type,
      related_entity_id,
      status,
      priority,
      metadata
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

-- Create trigger for provider_profiles table
DROP TRIGGER IF EXISTS trigger_notify_admin_profile_completed ON provider_profiles;
CREATE TRIGGER trigger_notify_admin_profile_completed
  AFTER INSERT OR UPDATE ON provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_admin_profile_completed();

-- Create a function to notify provider when verification status changes
CREATE OR REPLACE FUNCTION notify_provider_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger notification when status actually changes
  IF OLD.status IS NOT NULL AND NEW.status != OLD.status THEN
    INSERT INTO notifications (
      type,
      title,
      message,
      recipient_id,
      sender_id,
      related_entity_type,
      related_entity_id,
      status,
      priority,
      metadata
    ) VALUES (
      'verification_status_changed',
      'Verification Status Updated',
      'Your provider verification status has been updated to: ' || NEW.status,
      NEW.provider_id,
      NULL, -- Admin who made the change (could be added later)
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

-- Create trigger for provider_profiles table status changes
DROP TRIGGER IF EXISTS trigger_notify_provider_status_change ON provider_profiles;
CREATE TRIGGER trigger_notify_provider_status_change
  AFTER UPDATE ON provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_provider_status_change();

-- Create a function to notify users about booking updates
CREATE OR REPLACE FUNCTION notify_booking_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify customer about booking status changes
  IF OLD.booking_status IS NOT NULL AND NEW.booking_status != OLD.booking_status THEN
    INSERT INTO notifications (
      type,
      title,
      message,
      recipient_id,
      sender_id,
      related_entity_type,
      related_entity_id,
      status,
      priority,
      metadata
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

-- Create trigger for bookings table status changes
DROP TRIGGER IF EXISTS trigger_notify_booking_update ON bookings;
CREATE TRIGGER trigger_notify_booking_update
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_update();
