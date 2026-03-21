DROP TRIGGER IF EXISTS trigger_notify_admin_profile_completed ON public.service_provider_details;
CREATE TRIGGER trigger_notify_admin_profile_completed AFTER INSERT OR UPDATE ON public.service_provider_details FOR EACH ROW EXECUTE FUNCTION public.notify_admin_profile_completed();
