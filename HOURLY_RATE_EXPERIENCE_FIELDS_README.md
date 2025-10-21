# Hourly Rate and Years of Experience Fields Added

## Overview
Added `hourly_rate` and `years_of_experience` fields to the `provider_profiles` table to store provider-specific rate and experience information.

## Database Schema Changes

### 1. New Fields Added
```sql
-- Professional Information
hourly_rate decimal(10,2), -- hourly rate in local currency
years_of_experience integer, -- years of experience in the field
```

### 2. Field Details
- **`hourly_rate`**: `decimal(10,2)` - Stores hourly rate with 2 decimal places (e.g., 500.00)
- **`years_of_experience`**: `integer` - Stores years of experience as whole number (e.g., 5)

### 3. Indexes Added
```sql
create index if not exists idx_provider_profiles_hourly_rate on public.provider_profiles(hourly_rate);
create index if not exists idx_provider_profiles_years_experience on public.provider_profiles(years_of_experience);
```

### 4. Comments Added
```sql
comment on column public.provider_profiles.hourly_rate is 'Hourly rate charged by the provider in local currency (decimal with 2 decimal places).';
comment on column public.provider_profiles.years_of_experience is 'Number of years of experience the provider has in their field (integer).';
```

## Updated Files

### Backend Files:
1. **`provider-profiles-table-with-status.sql`** - Complete table schema with new fields
2. **`migrate-add-status-field.sql`** - Migration script with new fields
3. **`routes/users.js`** - Updated profile completion endpoint to handle new fields

### Frontend Files:
1. **`ProfileCompletionModal.jsx`** - Added fields to form data and submission

## Database View Updates

The `provider_profile_view` now includes both fields:
```sql
pp.hourly_rate, -- from provider_profiles (preferred)
pp.years_of_experience, -- from provider_profiles (preferred)
```

**Note**: The view also includes the same fields from `service_provider_details` table with different names:
- `spd_experience_years` - from service_provider_details
- `spd_hourly_rate` - from service_provider_details

This allows for data migration and comparison between the two tables.

## Backend API Changes

### Profile Completion Endpoint
The `/users/profile/complete-provider` endpoint now accepts and stores:
```javascript
{
  // ... other fields
  "hourly_rate": "500.00",
  "years_of_experience": "5"
}
```

### Data Processing
- **`hourly_rate`**: Converted using `parseFloat()` to ensure decimal format
- **`years_of_experience`**: Converted using `parseInt()` to ensure integer format

## Frontend Integration

### Form Data Structure
```javascript
const [formData, setFormData] = useState({
  // ... other fields
  hourly_rate: '500',
  years_of_experience: '',
  // ... other fields
});
```

### Data Loading
The form now loads these fields from existing profile data:
```javascript
hourly_rate: profileData.roleDetails?.basic_pay?.toString() || '',
years_of_experience: profileData.profile?.years_of_experience?.toString() || 
                    profileData.roleDetails?.experience_years?.toString() || '',
```

### Data Submission
These fields are included in the profile completion submission:
```javascript
const submitData = {
  // ... other fields
  hourly_rate: formData.hourly_rate || null,
  years_of_experience: formData.years_of_experience || null
};
```

## Migration Instructions

### For New Installations:
Run the complete table creation script:
```sql
-- Execute in Supabase SQL Editor
provider-profiles-table-with-status.sql
```

### For Existing Installations:
Run the migration script:
```sql
-- Execute in Supabase SQL Editor
migrate-add-status-field.sql
```

Or use the JavaScript migration runner:
```bash
cd S9-b-end
node run-status-migration.js
```

## Data Migration Notes

1. **Existing Data**: The migration script safely adds the new columns without affecting existing data
2. **Default Values**: Both fields are nullable, so existing records won't be affected
3. **Data Sources**: The system can pull data from both `service_provider_details` and `provider_profiles` tables
4. **Precedence**: `provider_profiles` fields take precedence in the view for consistency

## Usage Examples

### Query Examples:
```sql
-- Get providers with hourly rate > 400
SELECT * FROM provider_profiles WHERE hourly_rate > 400;

-- Get providers with 5+ years experience
SELECT * FROM provider_profiles WHERE years_of_experience >= 5;

-- Get providers by rate range and experience
SELECT * FROM provider_profiles 
WHERE hourly_rate BETWEEN 300 AND 600 
  AND years_of_experience >= 3;
```

### API Usage:
```javascript
// Complete profile with rate and experience
await apiService.completeServiceProviderProfile({
  // ... other fields
  hourly_rate: "450.00",
  years_of_experience: "7"
});
```

## Benefits

1. **Provider-Specific Rates**: Each provider can set their own hourly rate
2. **Experience Tracking**: Track years of experience for better matching
3. **Search & Filter**: Enable filtering by rate and experience ranges
4. **Data Consistency**: Centralized storage in provider_profiles table
5. **Migration Support**: Smooth transition from service_provider_details table

## Files Modified Summary

- ✅ `provider-profiles-table-with-status.sql` - Added fields to schema
- ✅ `migrate-add-status-field.sql` - Added fields to migration
- ✅ `routes/users.js` - Updated API to handle new fields
- ✅ `ProfileCompletionModal.jsx` - Added fields to form and submission

The hourly rate and years of experience fields are now fully integrated into the provider profiles system! 🎉
