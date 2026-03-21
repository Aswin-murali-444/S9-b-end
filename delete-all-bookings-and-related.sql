-- Delete ALL bookings and all related data in other tables
-- Use this to reset booking data before pushing original/clean data.
--
-- Run in Supabase SQL Editor (or via your migration runner).
-- To be able to rollback: run "BEGIN;" then paste this script, then "ROLLBACK;" or "COMMIT;" as needed.
--
-- Order: child tables first, then bookings (to avoid FK violations).
-- Uses DO block so missing tables are skipped without error.
--
-- Tables affected:
--   team_assignment_acceptances, team_assignments, booking_assign_audit,
--   notifications (booking-related only), bookings

DO $$
BEGIN
  -- 1) Team assignment acceptances (child of team_assignments)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_assignment_acceptances') THEN
    DELETE FROM public.team_assignment_acceptances
    WHERE team_assignment_id IN (SELECT id FROM public.team_assignments);
    RAISE NOTICE 'Deleted team_assignment_acceptances';
  END IF;

  -- 2) Team assignments (reference booking_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'team_assignments') THEN
    DELETE FROM public.team_assignments;
    RAISE NOTICE 'Deleted team_assignments';
  END IF;

  -- 3) Booking assign audit (reference booking_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_assign_audit') THEN
    DELETE FROM public.booking_assign_audit;
    RAISE NOTICE 'Deleted booking_assign_audit';
  END IF;

  -- 4) Notifications that reference a booking or are booking-related
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    DELETE FROM public.notifications
    WHERE (metadata IS NOT NULL AND metadata->>'booking_id' IS NOT NULL)
       OR type IN (
         'booking_assigned', 'booking_confirmed', 'service_started', 'service_completed', 'booking_cancelled',
         'team_job_assigned', 'team_assigned_to_booking', 'team_all_accepted', 'team_all_accepted_customer',
         'worker_declined_team', 'worker_declined_customer'
       );
    RAISE NOTICE 'Deleted booking-related notifications';
  END IF;

  -- 5) Bookings (main table)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    DELETE FROM public.bookings;
    RAISE NOTICE 'Deleted all bookings';
  END IF;

  RAISE NOTICE 'All bookings and related data have been deleted.';
END $$;

-- Optional: run to verify counts are zero
-- SELECT 'bookings' AS tbl, COUNT(*) FROM public.bookings
-- UNION ALL SELECT 'team_assignments', COUNT(*) FROM public.team_assignments
-- UNION ALL SELECT 'team_assignment_acceptances', COUNT(*) FROM public.team_assignment_acceptances
-- UNION ALL SELECT 'booking_assign_audit', COUNT(*) FROM public.booking_assign_audit;
