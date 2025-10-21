-- Add missing fields to service_provider_details table
-- This migration adds experience_years and hourly_rate columns

-- Add experience_years column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'service_provider_details' 
    AND column_name = 'experience_years'
  ) THEN
    ALTER TABLE public.service_provider_details 
    ADD COLUMN experience_years integer DEFAULT 0;
  END IF;
END $$;

-- Add hourly_rate column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'service_provider_details' 
    AND column_name = 'hourly_rate'
  ) THEN
    ALTER TABLE public.service_provider_details 
    ADD COLUMN hourly_rate decimal(10,2) DEFAULT 0.00;
  END IF;
END $$;

-- Add availability column for storing JSON availability data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
    AND table_name = 'service_provider_details' 
    AND column_name = 'availability'
  ) THEN
    ALTER TABLE public.service_provider_details 
    ADD COLUMN availability jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_sp_details_experience ON public.service_provider_details(experience_years);
CREATE INDEX IF NOT EXISTS idx_sp_details_hourly_rate ON public.service_provider_details(hourly_rate);

-- Add comments for documentation
COMMENT ON COLUMN public.service_provider_details.experience_years IS 'Years of experience in the service field';
COMMENT ON COLUMN public.service_provider_details.hourly_rate IS 'Hourly rate charged by the service provider';
COMMENT ON COLUMN public.service_provider_details.availability IS 'JSON object containing availability schedule';

