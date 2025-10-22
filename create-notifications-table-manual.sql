-- Create notifications table for admin notifications
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL, -- 'profile_completed', 'verification_requested', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE, -- For provider-related notifications
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Admin who handled the notification
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  metadata JSONB, -- Additional data like old_status, new_status, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_provider_id ON notifications(provider_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- Create a function to notify admins when provider profile is completed
CREATE OR REPLACE FUNCTION notify_admin_profile_completed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger notification when status changes to 'pending_verification'
  IF NEW.status = 'pending_verification' AND (OLD.status IS NULL OR OLD.status != 'pending_verification') THEN
    INSERT INTO notifications (
      type,
      title,
      message,
      provider_id,
      status,
      priority,
      metadata
    ) VALUES (
      'profile_completed',
      'New Provider Profile Completed',
      'A service provider has completed their profile and is awaiting verification.',
      NEW.provider_id,
      'unread',
      'high',
      jsonb_build_object(
        'provider_id', NEW.provider_id,
        'status', NEW.status,
        'completed_at', NOW()
      )
    );
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
      provider_id,
      status,
      priority,
      metadata
    ) VALUES (
      'verification_status_changed',
      'Verification Status Updated',
      'Your provider verification status has been updated to: ' || NEW.status,
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
