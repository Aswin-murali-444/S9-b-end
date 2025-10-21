# Profile Status Migration to "Active"

This document explains the changes made to set the provider profile status to "active" when completing the profile, instead of the previous "pending" status.

## Changes Made

### 1. Database Schema Updates

#### Updated Enum Definition
- **File**: `provider-profiles-table-with-status.sql`
- **Change**: Added `'active'` status to the `profile_status` enum
- **New enum values**: `incomplete`, `pending`, `active`, `verified`, `rejected`, `suspended`

#### Migration Scripts
- **File**: `add-active-status-enum.sql` - Adds 'active' to existing enum
- **File**: `migrate-to-active-status.sql` - Complete migration with helper functions
- **File**: `run-active-status-migration.js` - Node.js script to run the migration

### 2. Backend Code Updates

#### Profile Completion API
- **File**: `S9-b-end/routes/users.js` (line 278)
- **Change**: Updated status from `'pending'` to `'active'` when profile is completed
- **Impact**: New profiles will be set to "active" status immediately upon completion

### 3. Helper Functions

#### Database Function
- **Function**: `set_profile_active_on_completion(p_provider_id uuid)`
- **Purpose**: Sets profile status to 'active' and logs the change
- **Usage**: Can be called directly from database or application code

## Migration Steps

### Option 1: Run Migration Script (Recommended)
```bash
cd S9-b-end
node run-active-status-migration.js
```

### Option 2: Manual Database Migration
1. Connect to your Supabase database
2. Run the SQL from `migrate-to-active-status.sql`
3. Verify the changes

### Option 3: Use Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `migrate-to-active-status.sql`
4. Execute the script

## Testing

### Run Test Script
```bash
cd S9-b-end
node test-active-status.js
```

### Manual Testing
1. Complete a provider profile through your application
2. Check the database to verify status is set to "active"
3. Verify the profile appears as active in your application

## Status Flow

### Previous Flow
```
incomplete → pending → verified
```

### New Flow
```
incomplete → active → verified
```

### Status Meanings
- **incomplete**: Profile not yet completed
- **pending**: Profile completed, awaiting verification (legacy)
- **active**: Profile completed and ready to receive bookings ⭐ **NEW**
- **verified**: Profile verified and approved by admin
- **rejected**: Profile rejected (needs revision)
- **suspended**: Profile temporarily suspended

## Backward Compatibility

- Existing profiles with "pending" status will remain unchanged
- New profiles will use "active" status
- Optional migration script available to convert existing "pending" to "active"

## Files Modified

### Database Files
- `provider-profiles-table-with-status.sql` - Updated enum definition
- `add-active-status-enum.sql` - New migration script
- `migrate-to-active-status.sql` - Complete migration script
- `run-active-status-migration.js` - Migration runner script
- `test-active-status.js` - Test script

### Backend Files
- `S9-b-end/routes/users.js` - Updated profile completion logic

## Verification

After migration, verify the changes:

1. **Database**: Check that 'active' exists in the enum
2. **Backend**: Restart server and test profile completion
3. **Frontend**: Verify profiles show as active after completion

## Rollback (if needed)

To rollback the changes:

1. Update backend code to use 'pending' instead of 'active'
2. Remove 'active' from enum (requires recreating enum)
3. Update any profiles that were set to 'active'

## Support

If you encounter any issues:

1. Check the test script output
2. Verify database permissions
3. Ensure all migration scripts ran successfully
4. Check backend server logs for errors

---

✅ **Migration Complete**: Profile completion now sets status to "active" instead of "pending"
