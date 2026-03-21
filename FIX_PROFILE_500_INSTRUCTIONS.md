# Fix Profile Completion 500 Error

**Error:** `invalid input value for enum profile_status: "pending_verification"`

## One-time fix (required)

Run this SQL in **Supabase Dashboard → SQL Editor**:

```sql
-- Add 'pending_verification' to profile_status enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'pending_verification'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'profile_status')
  ) THEN
    ALTER TYPE public.profile_status ADD VALUE 'pending_verification';
  END IF;
END $$;

-- Ensure default is valid
ALTER TABLE public.provider_profiles 
  ALTER COLUMN status SET DEFAULT 'incomplete';
```

Or run the file: `fix-profile-status-enum-add-pending-verification.sql`

After running, profile completion will work.
