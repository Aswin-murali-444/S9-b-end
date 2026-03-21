DO $$
DECLARE
  v_user_id    UUID;
  v_auth_uid   TEXT;
  v_email      TEXT := 'navinvvaughese2025@mt.ajce.in';
BEGIN
  SELECT id, auth_user_id INTO v_user_id, v_auth_uid
  FROM public.users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No user found with email: %', v_email;
    RETURN;
  END IF;

  RAISE NOTICE 'Deleting all data for user id % (auth: %)', v_user_id, v_auth_uid;

  DELETE FROM public.booking_assign_audit
  WHERE assigned_provider_id = v_user_id
     OR booking_id IN (SELECT id FROM public.bookings WHERE user_id = v_user_id);

  DELETE FROM public.team_assignments
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE user_id = v_user_id);
  DELETE FROM public.team_assignments
  WHERE team_id IN (SELECT id FROM public.teams WHERE team_leader_id = v_user_id);

  DELETE FROM public.team_members
  WHERE team_id IN (SELECT id FROM public.teams WHERE team_leader_id = v_user_id);
  DELETE FROM public.team_members WHERE user_id = v_user_id;

  DELETE FROM public.teams WHERE team_leader_id = v_user_id;

  DELETE FROM public.notifications
  WHERE recipient_id = v_user_id OR sender_id = v_user_id OR admin_user_id = v_user_id;

  DELETE FROM public.bookings WHERE user_id = v_user_id;

  IF v_auth_uid IS NOT NULL THEN
    DELETE FROM public.user_cart    WHERE user_id = v_auth_uid::uuid;
    DELETE FROM public.user_wishlist WHERE user_id = v_auth_uid::uuid;
  END IF;

  DELETE FROM public.profile_status_log
  WHERE provider_id IN (SELECT provider_id FROM public.provider_profiles WHERE provider_id = v_user_id);

  DELETE FROM public.provider_profiles WHERE provider_id = v_user_id;
  DELETE FROM public.service_provider_details WHERE id = v_user_id;
  DELETE FROM public.customer_details WHERE id = v_user_id;
  DELETE FROM public.user_profiles WHERE id = v_user_id;
  DELETE FROM public.users WHERE id = v_user_id;

  RAISE NOTICE 'All public data for % deleted.', v_email;
END $$;
