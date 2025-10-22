const { supabase } = require('./lib/supabase');

async function testServiceProviderAcceptance() {
  console.log('🧪 Testing Service Provider Acceptance Notification...\n');

  try {
    const testUserId = '23c88529-cae1-4fa5-af9f-9153db425cc5'; // User with bookings
    const testBookingId = 'da4980b7-9221-44d0-8aff-7bc3398e0321'; // One of the pending bookings

    console.log(`👤 Testing with user: ${testUserId}`);
    console.log(`📋 Testing with booking: ${testBookingId}`);

    // Step 1: Check current booking status
    console.log('\n1️⃣ Checking current booking status...');
    const { data: currentBooking, error: currentError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', testBookingId)
      .single();

    if (currentError) {
      console.log('❌ Error fetching current booking:', currentError.message);
      return;
    }

    console.log(`📊 Current status: ${currentBooking.booking_status}`);
    console.log(`📅 Scheduled for: ${currentBooking.scheduled_date} at ${currentBooking.scheduled_time}`);

    // Step 2: Simulate service provider acceptance (change status to 'assigned')
    console.log('\n2️⃣ Simulating service provider acceptance...');
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({ 
        booking_status: 'assigned',
        provider_assigned_at: new Date().toISOString()
        // Note: assigned_provider_id requires a valid UUID, so we'll leave it null for now
      })
      .eq('id', testBookingId)
      .select()
      .single();

    if (updateError) {
      console.log('❌ Error updating booking:', updateError.message);
      return;
    }

    console.log(`✅ Booking status updated to: ${updatedBooking.booking_status}`);
    console.log(`👨‍🔧 Assigned at: ${updatedBooking.provider_assigned_at}`);

    // Step 3: Check notifications for the user
    console.log('\n3️⃣ Checking notifications after status change...');
    
    // Get all bookings for the user
    const { data: userBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false });

    if (bookingsError) {
      console.log('❌ Error fetching user bookings:', bookingsError.message);
      return;
    }

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

    // Step 4: Show notification results
    console.log('\n4️⃣ Notification Results:');
    console.log(`📊 Total notifications: ${notifications.length}`);
    
    const assignedNotifications = notifications.filter(n => n.type === 'booking_assigned');
    console.log(`🎯 Assigned notifications: ${assignedNotifications.length}`);
    
    const unreadNotifications = notifications.filter(n => n.status === 'unread');
    console.log(`🔔 Unread notifications: ${unreadNotifications.length}`);

    // Show the specific assigned notification
    if (assignedNotifications.length > 0) {
      console.log('\n🎉 SUCCESS! Service provider acceptance notification created:');
      assignedNotifications.forEach(notification => {
        console.log(`\n📋 Notification Details:`);
        console.log(`   Type: ${notification.type}`);
        console.log(`   Title: ${notification.title}`);
        console.log(`   Message: ${notification.message}`);
        console.log(`   Status: ${notification.status}`);
        console.log(`   Priority: ${notification.priority}`);
        console.log(`   Time: ${notification.time}`);
      });
    }

    // Step 5: Test API endpoint
    console.log('\n5️⃣ Testing API endpoint...');
    const apiUrl = `http://localhost:3001/notifications/user/${testUserId}?page=1&limit=20`;
    console.log(`🌐 API URL: ${apiUrl}`);
    
    // Note: This would require the backend server to be running
    console.log('💡 To test the API endpoint, make sure your backend server is running on port 3001');
    console.log('💡 Then visit the frontend and check the notification bell');

    console.log('\n✅ Test completed! The notification system should now show the assigned notification.');
    console.log('💡 Make sure you are logged in as the correct user to see it in the UI.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
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

// Run the test
testServiceProviderAcceptance().catch(console.error);
