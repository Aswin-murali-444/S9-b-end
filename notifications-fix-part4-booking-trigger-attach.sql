DROP TRIGGER IF EXISTS trigger_notify_booking_update ON public.bookings;
CREATE TRIGGER trigger_notify_booking_update AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking_update();
