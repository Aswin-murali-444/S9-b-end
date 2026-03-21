DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'admin_user_id') THEN
    ALTER TABLE public.notifications ADD COLUMN admin_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added admin_user_id to notifications';
  END IF;
END $$;
