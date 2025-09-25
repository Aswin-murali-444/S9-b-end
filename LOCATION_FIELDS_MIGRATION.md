# Location Fields Migration Guide

This guide explains the migration to add location fields to the `user_profiles` table and the updates made to the AdminUserProfile page.

## Overview

The system now supports storing GPS location data for users, including:
- **location_latitude**: GPS latitude coordinate (decimal degrees, precision 10,8)
- **location_longitude**: GPS longitude coordinate (decimal degrees, precision 11,8)  
- **location_accuracy_m**: GPS accuracy in meters (integer)

## Database Changes

### 1. Schema Updates

The `user_profiles` table has been updated to include location fields:

```sql
-- New columns added to user_profiles table
location_latitude DECIMAL(10, 8),
location_longitude DECIMAL(11, 8),
location_accuracy_m INTEGER,
```

### 2. Migration Script

Run the migration script to add location fields to existing databases:

```bash
# Connect to your Supabase database and run:
psql -h your-supabase-host -U postgres -d postgres -f add-location-fields-migration.sql
```

Or copy and paste the SQL commands directly into your Supabase SQL editor.

### 3. Indexes

Performance indexes have been added for location queries:

```sql
CREATE INDEX IF NOT EXISTS idx_user_profiles_location_lat ON user_profiles(location_latitude) WHERE location_latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_location_lon ON user_profiles(location_longitude) WHERE location_longitude IS NOT NULL;
```

## Frontend Changes

### 1. AdminUserProfile Page

The AdminUserProfile page (`/admin/users/:userId`) has been completely rewritten to:

- **Use AdminLayout**: Now follows the same template as other admin pages
- **Display Location Data**: Shows GPS coordinates, accuracy, and provides "View on Map" links
- **Improved UI**: Better organization of user information with proper sections
- **Real-time Data**: Fetches location data from the database via the API

### 2. Location Data Display

The page now displays:

- **Primary Location**: Shows the main location from user_profiles table
- **GPS Coordinates**: Latitude, longitude with 6 decimal precision
- **Accuracy**: GPS accuracy in meters
- **Map Links**: Direct links to Google Maps for location visualization
- **Address Information**: Full address breakdown (postal code, city, state, country)

### 3. Data Fetching

The page fetches data using the existing API endpoint:
- `GET /profile/:userId` - Returns user data including location fields
- Location data is automatically included in the response from the backend

## API Endpoints

No new API endpoints were required. The existing profile endpoint already supports location fields:

```
GET /profile/:userId
```

Returns:
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "customer",
  "status": "active",
  "profile": {
    "first_name": "John",
    "last_name": "Doe",
    "location_latitude": 40.7128,
    "location_longitude": -74.0060,
    "location_accuracy_m": 10,
    // ... other profile fields
  }
}
```

## Usage Examples

### 1. Viewing User Location

Navigate to: `http://localhost:5173/admin/users/23c88529-cae1-4fa5-af9f-9153db425cc5`

The page will display:
- User's primary location with GPS coordinates
- Accuracy information
- "View on Map" button that opens Google Maps
- All address information

### 2. Location Data Structure

Location data is stored as:
- **Latitude**: Decimal degrees (e.g., 40.712800)
- **Longitude**: Decimal degrees (e.g., -74.006000)
- **Accuracy**: Meters (e.g., 10)

### 3. Map Integration

The page provides direct links to Google Maps:
- **With Coordinates**: `https://www.google.com/maps?q=40.712800,-74.006000`
- **With Address**: `https://www.google.com/maps/search/?api=1&query=encoded_address`

## Troubleshooting

### 1. Migration Issues

If you encounter issues with the migration:

```sql
-- Check if columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
  AND column_name IN ('location_latitude', 'location_longitude', 'location_accuracy_m');
```

### 2. No Location Data

If no location data is displayed:
- Check if the user has completed their profile with location information
- Verify the location fields are populated in the database
- Ensure the API is returning the location data correctly

### 3. Map Links Not Working

If map links don't work:
- Verify the coordinates are valid (latitude: -90 to 90, longitude: -180 to 180)
- Check if the address is properly formatted
- Ensure Google Maps is accessible

## Future Enhancements

Potential future improvements:
- Multiple saved locations per user
- Location history tracking
- Geofencing capabilities
- Location-based service matching
- Distance calculations between users and services
