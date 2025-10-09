# Bookings Table Setup Guide

This guide explains how to set up the bookings table that captures all data from the booking modal and connects to your existing users, services, and service categories tables.

## 📋 Overview

The bookings table stores comprehensive booking information including:
- **Scheduling**: Date, time, duration
- **Location**: Complete address with GPS coordinates
- **Contact**: Customer contact details and emergency contacts
- **Payment**: Payment method, status, transaction details
- **Status Tracking**: Booking workflow and provider assignment
- **Feedback**: Customer and provider ratings

## 🗄️ Database Schema

### Table Relationships

```
users (1) ──────────── (many) bookings (many) ──────────── (1) services
  │                                                           │
  │                                                           │
  └─────────────────── (many) ────────────────────────────────┘
                              service_categories
```

### Key Features

1. **Dropdown-Friendly Status Fields**: All status fields use ENUM types for easy dropdown selection in Supabase
2. **Automatic Pricing**: Triggers automatically calculate service fees and taxes
3. **Status Validation**: Ensures valid status transitions
4. **Row Level Security**: Secure access based on user roles
5. **Comprehensive Tracking**: Complete audit trail of booking lifecycle

## 🚀 Setup Instructions

### Step 1: Run the SQL Script

1. **Open Supabase Dashboard**
2. **Navigate to SQL Editor**
3. **Copy and paste the contents of `bookings-table-supabase.sql`**
4. **Click Run to execute the script**

### Step 2: Verify Table Creation

After running the script, you should see:

```sql
-- Check if table was created
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bookings' 
ORDER BY ordinal_position;
```

### Step 3: Test the Setup

```sql
-- Test the booking details view
SELECT * FROM booking_details_view LIMIT 5;

-- Check enum values for dropdowns
SELECT unnest(enum_range(NULL::booking_status_enum)) as booking_status;
SELECT unnest(enum_range(NULL::payment_status_enum)) as payment_status;
SELECT unnest(enum_range(NULL::payment_method_enum)) as payment_method;
```

## 📊 Dropdown Values in Supabase

### Booking Status (booking_status_enum)
- `pending` - Just created, waiting for confirmation
- `confirmed` - Confirmed by admin/system
- `assigned` - Service provider assigned
- `in_progress` - Service is being performed
- `completed` - Service completed successfully
- `cancelled` - Cancelled by customer or admin
- `rescheduled` - Rescheduled to different time
- `no_show` - Customer didn't show up
- `disputed` - There's a dispute about the service

### Payment Status (payment_status_enum)
- `pending` - Payment not yet initiated
- `processing` - Payment in progress
- `completed` - Payment successful
- `failed` - Payment failed
- `refunded` - Payment refunded
- `cancelled` - Payment cancelled

### Payment Method (payment_method_enum)
- `card` - Credit/Debit Card
- `upi` - UPI Payment
- `cod` - Cash on Delivery
- `wallet` - Digital Wallet
- `netbanking` - Net Banking

### Priority Level (priority_level_enum)
- `low` - Low priority
- `normal` - Normal priority
- `high` - High priority
- `urgent` - Urgent priority

## 🔗 Integration with BookingModal

### Frontend Integration

Update your BookingModal component to save data to the bookings table:

```javascript
const handleBooking = async () => {
  setIsLoading(true);
  
  try {
    const bookingData = {
      user_id: userProfile.id, // From user_profiles table
      service_id: service.id,
      category_id: service.category_id,
      scheduled_date: selectedDate,
      scheduled_time: selectedTime,
      service_address: address,
      service_city: userProfile?.user_profiles?.city,
      service_state: userProfile?.user_profiles?.state,
      service_country: userProfile?.user_profiles?.country,
      service_postal_code: userProfile?.user_profiles?.postal_code,
      service_location_latitude: userProfile?.user_profiles?.location_latitude,
      service_location_longitude: userProfile?.user_profiles?.location_longitude,
      contact_phone: phone,
      contact_email: userProfile?.email,
      special_instructions: notes,
      payment_method: paymentMethod,
      booking_status: 'pending',
      payment_status: 'pending'
    };
    
    const { data, error } = await supabase
      .from('bookings')
      .insert(bookingData);
      
    if (error) throw error;
    
    setBookingSuccess(true);
  } catch (error) {
    console.error('Booking failed:', error);
    toast.error('Failed to create booking');
  } finally {
    setIsLoading(false);
  }
};
```

## 📈 Useful Queries

### Get Bookings by User
```sql
SELECT * FROM booking_details_view 
WHERE customer_name = 'John Doe'
ORDER BY created_at DESC;
```

### Get Bookings by Status
```sql
SELECT * FROM booking_details_view 
WHERE booking_status = 'pending'
ORDER BY scheduled_date ASC;
```

### Get Bookings by Service Provider
```sql
SELECT * FROM booking_details_view 
WHERE provider_name = 'Jane Smith'
AND booking_status IN ('assigned', 'in_progress');
```

### Get Revenue Statistics
```sql
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_bookings,
    SUM(total_amount) as total_revenue,
    AVG(customer_rating) as avg_rating
FROM bookings 
WHERE payment_status = 'completed'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## 🔐 Security Features

### Row Level Security (RLS)
- Users can only see their own bookings
- Service providers can see bookings assigned to them
- Admins can see all bookings

### Data Validation
- Status transition validation
- Rating constraints (1-5 stars)
- Required field validation
- Foreign key constraints

## 📱 Supabase Dashboard Features

### Table View
- All booking data visible in a clean table format
- Dropdown filters for status fields
- Search functionality across all fields
- Sorting by any column

### Relationships
- Click to view related user, service, or category details
- Automatic foreign key relationship displays
- Easy navigation between related records

### Real-time Updates
- Live updates when booking status changes
- Real-time notifications for new bookings
- Instant provider assignment updates

## 🛠️ Customization Options

### Adding New Status Values
```sql
-- Add new booking status
ALTER TYPE booking_status_enum ADD VALUE 'on_hold';

-- Add new payment method
ALTER TYPE payment_method_enum ADD VALUE 'crypto';
```

### Custom Fields
```sql
-- Add custom fields
ALTER TABLE bookings ADD COLUMN custom_field VARCHAR(255);
ALTER TABLE bookings ADD COLUMN special_requirements JSONB;
```

### Additional Indexes
```sql
-- Add custom indexes for specific queries
CREATE INDEX idx_bookings_custom_field ON bookings(custom_field);
CREATE INDEX idx_bookings_revenue ON bookings(total_amount) WHERE payment_status = 'completed';
```

## 🔄 Status Workflow

### Typical Booking Flow
1. **pending** → Customer creates booking
2. **confirmed** → Admin/system confirms booking
3. **assigned** → Service provider assigned
4. **in_progress** → Service started
5. **completed** → Service finished successfully

### Alternative Flows
- **cancelled** → Can happen at any stage
- **rescheduled** → Can happen before service starts
- **no_show** → Customer doesn't show up
- **disputed** → Issues with service delivery

## 📊 Analytics and Reporting

### Key Metrics to Track
- Booking conversion rate
- Average booking value
- Customer satisfaction scores
- Service provider performance
- Revenue trends
- Cancellation rates

### Sample Reports
```sql
-- Daily booking summary
SELECT 
    DATE(created_at) as date,
    COUNT(*) as bookings,
    SUM(total_amount) as revenue,
    AVG(customer_rating) as avg_rating
FROM bookings 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Service provider performance
SELECT 
    provider_name,
    COUNT(*) as total_bookings,
    AVG(customer_rating) as avg_rating,
    SUM(total_amount) as total_revenue
FROM booking_details_view 
WHERE booking_status = 'completed'
GROUP BY provider_name
ORDER BY avg_rating DESC;
```

## 🚨 Troubleshooting

### Common Issues

1. **Foreign Key Errors**
   - Ensure users, services, and categories exist before creating bookings
   - Check that referenced IDs are valid UUIDs

2. **Status Transition Errors**
   - Follow the defined status workflow
   - Use admin override for special cases

3. **Permission Errors**
   - Check RLS policies are properly set up
   - Verify user roles and permissions

4. **Pricing Calculation Issues**
   - Ensure services table has valid price data
   - Check trigger functions are properly installed

### Debug Queries
```sql
-- Check table structure
\d bookings

-- Check constraints
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'bookings'::regclass;

-- Check triggers
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'bookings';
```

## 📞 Support

If you encounter any issues:
1. Check the error messages in Supabase logs
2. Verify your table structure matches the schema
3. Test with simple queries first
4. Check foreign key relationships
5. Verify RLS policies are correctly configured

## 🎯 Next Steps

After setting up the bookings table:

1. **Update Frontend**: Integrate BookingModal with the new table
2. **Create Admin Views**: Build admin dashboards for booking management
3. **Add Notifications**: Set up real-time notifications for status changes
4. **Implement Analytics**: Create reporting dashboards
5. **Add Mobile Support**: Extend for mobile app integration
6. **Testing**: Comprehensive testing of all booking workflows

This bookings table provides a solid foundation for managing your service booking system with full integration to your existing user and service data.
