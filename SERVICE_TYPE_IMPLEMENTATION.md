# Service Type Field Implementation

## Overview
Added a `service_type` field to the services table to distinguish between individual and group services.

## Database Changes

### SQL Migration
Run the following SQL in your Supabase SQL Editor:

```sql
-- Create ENUM type for service types (this creates the dropdown in Supabase)
CREATE TYPE service_type_enum AS ENUM ('individual', 'group');

-- Add service_type field to services table
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS service_type service_type_enum DEFAULT 'individual';

-- Add comment to explain the field
COMMENT ON COLUMN services.service_type IS 'Defines whether the service is for individual customers or group bookings';

-- Create index for better performance when filtering by service type
CREATE INDEX IF NOT EXISTS idx_services_service_type ON services(service_type);

-- Update existing services to have 'individual' as default
UPDATE services SET service_type = 'individual' WHERE service_type IS NULL;

-- Make the column NOT NULL after setting defaults
ALTER TABLE services ALTER COLUMN service_type SET NOT NULL;
```

## Backend Changes

### 1. Services Route (`S9-b-end/routes/services.js`)
- Added `service_type` field to all SELECT queries
- Updated CREATE service endpoint to accept `serviceType` parameter
- Updated UPDATE service endpoint to handle `serviceType` parameter
- Added validation to ensure service_type is either 'individual' or 'group'

### 2. API Service (`S9-f-end/src/services/api.js`)
- Updated `createService` method to include `serviceType` parameter
- Default value is 'individual' for backward compatibility

## Frontend Changes

### 1. Add Service Page (`S9-f-end/src/pages/admin/AddServicePage.jsx`)
- Added `serviceType` field to form state (defaults to 'individual')
- Added service type dropdown with options:
  - Individual Service
  - Group Service
- Added validation for service type field
- Updated form submission to include service type

### 2. Manage Services Page (`S9-f-end/src/pages/admin/ServicesPage.jsx`)
- Added "Type" column to services table
- Displays service type with colored badges:
  - Individual: Green badge
  - Group: Blue badge
- Updated table layout to accommodate new column

## Field Specifications

### Database Field
- **Name**: `service_type`
- **Type**: `service_type_enum` (PostgreSQL ENUM)
- **Values**: `'individual'`, `'group'`
- **Default**: `'individual'`
- **Nullable**: `NOT NULL`
- **Indexed**: Yes (for performance)
- **UI**: Dropdown in Supabase interface

### API Parameters
- **Create Service**: `serviceType` (optional, defaults to 'individual')
- **Update Service**: `serviceType` (optional)
- **Valid Values**: 'individual', 'group'

## Usage Examples

### Creating a Group Service
```javascript
const serviceData = {
  categoryId: 'category-uuid',
  name: 'Team Building Workshop',
  description: 'Interactive team building activities',
  duration: '4 hours',
  price: 500,
  serviceType: 'group', // This makes it a group service
  active: true
};

await apiService.createService(serviceData);
```

### Filtering Services by Type
```sql
-- Get all group services
SELECT * FROM services WHERE service_type = 'group';

-- Get all individual services
SELECT * FROM services WHERE service_type = 'individual';
```

## Migration Notes

1. **Existing Services**: All existing services will be automatically set to 'individual' type
2. **Backward Compatibility**: The field defaults to 'individual', so existing code continues to work
3. **Validation**: Both frontend and backend validate that service_type is either 'individual' or 'group'
4. **Performance**: Added database index for efficient filtering by service type

## Testing

Run the test script to verify the implementation:
```bash
cd S9-b-end
node test-service-type-field.js
```

This will test:
- Fetching services with service_type field
- Creating services with different types
- Filtering services by type

## Files Modified

### Backend
- `S9-b-end/routes/services.js` - Updated API endpoints
- `S9-b-end/add-service-type-field.sql` - SQL migration script
- `S9-b-end/add-service-type-field-direct.sql` - Direct SQL for Supabase
- `S9-b-end/test-service-type-field.js` - Test script

### Frontend
- `S9-f-end/src/services/api.js` - Updated API service
- `S9-f-end/src/pages/admin/AddServicePage.jsx` - Added service type field
- `S9-f-end/src/pages/admin/ServicesPage.jsx` - Display service type in table

## Next Steps

1. Run the SQL migration in Supabase
2. Test the frontend forms
3. Verify service creation and management
4. Consider adding service type filtering to customer-facing pages
5. Update any booking logic to handle group vs individual services differently
