CREATE OR REPLACE FUNCTION public.notify_provider_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (type, title, message, recipient_id, sender_id, related_entity_type, related_entity_id, status, priority, metadata)
    VALUES ('verification_status_changed', 'Verification Status Updated', 'Your provider verification status has been updated to: ' || NEW.status, NEW.id, NULL, 'provider_profile', NEW.id, 'unread', 'medium', jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'updated_at', NOW()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
