CREATE OR REPLACE FUNCTION public.notify_admin_profile_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending_verification' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'pending_verification') THEN
    INSERT INTO public.notifications (type, title, message, recipient_id, sender_id, related_entity_type, related_entity_id, status, priority, metadata)
    SELECT 'profile_completed', 'New Provider Profile Completed', 'A service provider has completed their profile and is awaiting verification.', u.id, NEW.id, 'provider_profile', NEW.id, 'unread', 'high', jsonb_build_object('provider_id', NEW.id, 'status', NEW.status, 'completed_at', NOW())
    FROM public.users u WHERE u.role = 'admin' AND u.status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
