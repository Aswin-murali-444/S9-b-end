DROP TRIGGER IF EXISTS trigger_notify_provider_status_change ON public.service_provider_details;
CREATE TRIGGER trigger_notify_provider_status_change AFTER UPDATE ON public.service_provider_details FOR EACH ROW EXECUTE FUNCTION public.notify_provider_status_change();
