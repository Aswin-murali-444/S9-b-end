CREATE OR REPLACE FUNCTION public.notify_booking_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.booking_status IS NOT NULL AND NEW.booking_status != OLD.booking_status THEN
    INSERT INTO public.notifications (type, title, message, recipient_id, sender_id, related_entity_type, related_entity_id, status, priority, metadata)
    VALUES ('booking_update', 'Booking Status Updated', 'Your booking status has been updated to: ' || NEW.booking_status, NEW.user_id, NEW.assigned_provider_id, 'booking', NEW.id, 'unread', CASE WHEN NEW.booking_status = 'cancelled' THEN 'high' WHEN NEW.booking_status = 'completed' THEN 'medium' ELSE 'low' END, jsonb_build_object('booking_id', NEW.id, 'old_status', OLD.booking_status, 'new_status', NEW.booking_status, 'updated_at', NOW()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
