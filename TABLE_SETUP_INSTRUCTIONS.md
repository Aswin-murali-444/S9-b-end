# Provider Profiles Table Setup

## Issue
The profile completion is failing because the `provider_profiles` table doesn't exist in the database.

## Solution
You need to create the `provider_profiles` table in your Supabase database.

## Steps to Fix:

### 1. Open Supabase Dashboard
- Go to your Supabase project dashboard
- Navigate to the SQL Editor

### 2. Run the SQL Script
- Copy the contents of `provider-profiles-table.sql`
- Paste it into the SQL Editor
- Click "Run" to execute the script

### 3. Verify Table Creation
- Go to the Table Editor
- You should see a new table called `provider_profiles`
- The table should have all the required columns

## Alternative: Manual Table Creation
If the SQL script doesn't work, you can create the table manually:

1. Go to Table Editor in Supabase
2. Click "Create a new table"
3. Name it `provider_profiles`
4. Add the following columns:
   - `provider_id` (uuid, primary key)
   - `first_name` (text)
   - `last_name` (text)
   - `phone` (varchar)
   - `pincode` (varchar)
   - `city` (varchar)
   - `state` (varchar)
   - `address` (text)
   - `location_latitude` (decimal)
   - `location_longitude` (decimal)
   - `bio` (text)
   - `qualifications` (text array)
   - `certifications` (text array)
   - `languages` (text array)
   - `profile_photo_url` (text)
   - `aadhaar_number` (varchar)
   - `aadhaar_name` (text)
   - `aadhaar_dob` (date)
   - `aadhaar_gender` (text)
   - `aadhaar_address` (text)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

## After Creating the Table
Once the table is created, the profile completion should work properly.
