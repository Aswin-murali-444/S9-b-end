const { supabase } = require('./lib/supabase');

async function createTestBookingForCurrentUser() {
  console.log('🧪 Creating test booking for current user...\n');

  try {
    const currentUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8'; // The user you're logged in as
    
    console.log(`👤 Creating booking for user: ${currentUserId}`);

    // Create a test booking
    const testBooking = {
      user_id: currentUserId,
      service_id: '02d6ced5-e4dc-4245-a4f5-919b9ace94ce', // Use existing service ID
      category_id: 'ee71a5f7-1e00-4111-9c3b-d0b157b70ba3', // Use existing category ID
      scheduled_date: '2025-10-23',
      scheduled_time: '10:00:00',
      duration_minutes: 60,
      service_address: 'Test Address, Test City, Test State, Test Country, 123456',
      service_city: 'Test City',
      service_state: 'Test State',
      service_country: 'Test Country',
      service_postal_code: '123456',
      service_location_latitude: 9.52805722,
      service_location_longitude: 76.82231048,
      contact_phone: '+919496035164',
      contact_email: 'test@example.com',
      special_instructions: 'Test booking for notification testing',
      base_price: 500,
      service_fee: 50,
      tax_amount: 99,
      total_amount: 649,
      payment_method: 'upi',
      payment_status: 'completed',
      payment_transaction_id: 'test_payment_123',
      booking_status: 'pending',
      internal_status: 'active',
      priority_level: 'normal',
      booking_source: 'web',
      workers_count: 1
    };

    console.log('📋 Creating test booking...');
    const { data: newBooking, error: createError } = await supabase
      .from('bookings')
      .insert([testBooking])
      .select()
      .single();

    if (createError) {
      console.log('❌ Error creating booking:', createError.message);
      return;
    }

    console.log('✅ Test booking created successfully!');
    console.log(`📋 Booking ID: ${newBooking.id}`);
    console.log(`📅 Scheduled for: ${newBooking.scheduled_date} at ${newBooking.scheduled_time}`);
    console.log(`💰 Amount: ₹${newBooking.total_amount}`);

    // Now test the notification
    console.log('\n🔔 Testing notification...');
    const { data: userBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false });

    if (bookingsError) {
      console.log('❌ Error fetching bookings:', bookingsError.message);
      return;
    }

    console.log(`📊 Total bookings for user: ${userBookings.length}`);

    // Convert to notifications
    const notifications = userBookings.map(booking => {
      let notificationType, title, message, priority = 'medium';
      
      switch (booking.booking_status) {
        case 'pending':
          notificationType = 'booking_pending';
          title = 'Booking Request Sent';
          message = `Your service booking for ${booking.scheduled_date} at ${booking.scheduled_time} has been sent and is awaiting provider assignment.`;
          priority = 'medium';
          break;
        case 'assigned':
          notificationType = 'booking_assigned';
          title = 'Service Provider Assigned';
          message = `A service provider has been assigned to your booking scheduled for ${booking.scheduled_date} at ${booking.scheduled_time}.`;
          priority = 'high';
          break;
        case 'confirmed':
          notificationType = 'booking_confirmed';
          title = 'Booking Confirmed';
          message = `Your booking scheduled for ${booking.scheduled_date} at ${booking.scheduled_time} has been confirmed by the service provider.`;
          priority = 'medium';
          break;
        case 'in_progress':
          notificationType = 'service_started';
          title = 'Service Started';
          message = `Your service has started. The provider is on their way to ${booking.service_address}.`;
          priority = 'medium';
          break;
        case 'completed':
          notificationType = 'service_completed';
          title = 'Service Completed';
          message = `Your service has been completed successfully. Please rate your experience.`;
          priority = 'medium';
          break;
        case 'cancelled':
          notificationType = 'booking_cancelled';
          title = 'Booking Cancelled';
          message = `Your booking scheduled for ${booking.scheduled_date} has been cancelled.`;
          priority = 'high';
          break;
        default:
          notificationType = 'booking_update';
          title = 'Booking Update';
          message = `Your booking status has been updated to: ${booking.booking_status}`;
          priority = 'medium';
      }

      return {
        id: booking.id,
        type: notificationType,
        title: title,
        message: message,
        status: booking.booking_status === 'completed' ? 'read' : 'unread',
        priority: priority,
        time: formatTimeAgo(booking.created_at),
        createdAt: booking.created_at,
        booking_status: booking.booking_status
      };
    });

    console.log(`🔔 Generated ${notifications.length} notifications`);
    console.log(`📊 Unread notifications: ${notifications.filter(n => n.status === 'unread').length}`);

    // Show the new notification
    const newNotification = notifications[0]; // Most recent
    console.log('\n🎉 NEW NOTIFICATION CREATED:');
    console.log(`   Type: ${newNotification.type}`);
    console.log(`   Title: ${newNotification.title}`);
    console.log(`   Message: ${newNotification.message}`);
    console.log(`   Status: ${newNotification.status}`);
    console.log(`   Priority: ${newNotification.priority}`);

    console.log('\n✅ SUCCESS! Now refresh your frontend to see the notification.');
    console.log('💡 The notification bell should show 1 unread notification.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Helper function to format time ago
function formatTimeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Run the script
createTestBookingForCurrentUser().catch(console.error);
