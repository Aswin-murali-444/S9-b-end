# Provider Profile Status System

This document explains the new profile status system for tracking provider profile completion and verification states.

## Overview

The profile status system allows you to track the completion and verification status of provider profiles with the following states:

- **`incomplete`** - Profile is not yet completed
- **`pending`** - Profile completed, awaiting verification  
- **`verified`** - Profile verified and approved
- **`rejected`** - Profile rejected (needs revision)
- **`suspended`** - Profile temporarily suspended

## Database Schema

### 1. Enum Type
```sql
create type public.profile_status as enum (
  'incomplete',     -- Profile is not yet completed
  'pending',        -- Profile completed, awaiting verification
  'verified',        -- Profile verified and approved
  'rejected',        -- Profile rejected (needs revision)
  'suspended'        -- Profile temporarily suspended
);
```

### 2. Provider Profiles Table
The `provider_profiles` table now includes:
```sql
status public.profile_status default 'incomplete' not null,
```

### 3. Status Log Table
Tracks all status changes for audit trail:
```sql
create table public.profile_status_log (
  id uuid default gen_random_uuid() primary key,
  provider_id uuid references public.provider_profiles(provider_id) on delete cascade,
  old_status public.profile_status,
  new_status public.profile_status not null,
  reason text,
  created_at timestamp with time zone default now()
);
```

## Setup Instructions

### 1. For New Installations
Run the complete table creation script:
```bash
# Execute in Supabase SQL Editor
provider-profiles-table-with-status.sql
```

### 2. For Existing Installations
Run the migration script:
```bash
# Execute in Supabase SQL Editor
migrate-add-status-field.sql
```

Or use the JavaScript migration runner:
```bash
cd S9-b-end
node run-status-migration.js
```

## API Endpoints

### 1. Complete Profile (Sets status to 'pending')
```javascript
POST /users/profile/complete-provider
// Automatically sets status to 'pending' when profile is completed
```

### 2. Update Profile Status (Admin function)
```javascript
PUT /users/profile/:providerId/status
Body: {
  "status": "verified", // or "rejected", "suspended", etc.
  "reason": "Documents verified successfully" // optional
}
```

### 3. Get Profile Status
```javascript
GET /users/profile/:providerId/status
Response: {
  "success": true,
  "data": {
    "provider_id": "uuid",
    "status": "pending",
    "created_at": "timestamp",
    "updated_at": "timestamp",
    "status_history": [
      {
        "old_status": "incomplete",
        "new_status": "pending",
        "reason": null,
        "created_at": "timestamp"
      }
    ]
  }
}
```

## Frontend Usage

### 1. API Service Methods
```javascript
import { apiService } from '../services/api';

// Update profile status
await apiService.updateProviderProfileStatus(providerId, 'verified', 'Documents approved');

// Get profile status
const statusData = await apiService.getProviderProfileStatus(providerId);
```

### 2. Profile Status Manager Component
```javascript
import ProfileStatusManager from '../components/ProfileStatusManager';

<ProfileStatusManager 
  providerId={providerId}
  onStatusUpdate={(newStatus) => {
    console.log('Status updated to:', newStatus);
  }}
/>
```

## Status Workflow

### Typical Flow:
1. **`incomplete`** - User starts profile completion
2. **`pending`** - User completes profile (automatic)
3. **`verified`** - Admin approves profile
4. **`rejected`** - Admin rejects profile (user can resubmit)
5. **`suspended`** - Admin suspends profile temporarily

### Status Transitions:
- Any status → `verified` (admin approval)
- Any status → `rejected` (admin rejection)
- Any status → `suspended` (admin suspension)
- `rejected` → `pending` (user resubmits)
- `suspended` → `verified` (admin reactivates)

## Supabase Integration

### 1. Dropdown Configuration
In Supabase Dashboard:
1. Go to Table Editor → `provider_profiles`
2. Click on the `status` column
3. Set "Input Type" to "Dropdown"
4. The enum values will automatically populate

### 2. Row Level Security (Optional)
```sql
-- Enable RLS
alter table public.provider_profiles enable row level security;

-- Allow users to read their own profile
create policy "Allow owners read" on public.provider_profiles
  for select using (auth.uid() = provider_id);

-- Allow users to update their own profile (but not status)
create policy "Allow owners update" on public.provider_profiles
  for update using (auth.uid() = provider_id) 
  with check (auth.uid() = provider_id and status = 'incomplete');
```

## Admin Functions

### 1. Helper Function
```sql
-- Update profile status with logging
select public.update_profile_status(
  'provider-uuid-here'::uuid,
  'verified'::profile_status,
  'All documents verified successfully'
);
```

### 2. Status Queries
```sql
-- Get all pending profiles
select * from public.provider_profiles where status = 'pending';

-- Get status distribution
select status, count(*) from public.provider_profiles group by status;

-- Get recent status changes
select * from public.profile_status_log 
order by created_at desc limit 20;
```

## Benefits

1. **Clear Status Tracking** - Know exactly where each profile stands
2. **Audit Trail** - Complete history of status changes with reasons
3. **Admin Control** - Easy status management for administrators
4. **User Experience** - Clear feedback on profile status
5. **Workflow Management** - Structured process for profile verification
6. **Supabase Integration** - Native dropdown support in Supabase UI

## Files Created/Modified

### Backend:
- `provider-profiles-table-with-status.sql` - Complete table with status
- `migrate-add-status-field.sql` - Migration script
- `run-status-migration.js` - Migration runner
- `routes/users.js` - Added status endpoints

### Frontend:
- `src/services/api.js` - Added status API methods
- `src/components/ProfileStatusManager.jsx` - Status management component
- `src/components/ProfileStatusManager.css` - Component styles

## Testing

Test the status system:
```javascript
// Test status update
const result = await apiService.updateProviderProfileStatus(
  'test-provider-id', 
  'verified', 
  'Test approval'
);

// Test status retrieval
const status = await apiService.getProviderProfileStatus('test-provider-id');
console.log('Current status:', status.data.status);
```

The status system is now ready to use! 🎉
