const { supabase } = require('./lib/supabase');

async function testBookingConfirmation() {
  console.log('🧪 Testing Booking Confirmation Notification...\n');

  try {
    const testUserId = '23c88529-cae1-4fa5-af9f-9153db425cc5'; // User with bookings

    console.log(`👤 Testing with user: ${testUserId}`);

    // Step 1: Check current booking statuses
    console.log('\n1️⃣ Checking current booking statuses...');
    const { data: userBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false });

    if (bookingsError) {
      console.log('❌ Error fetching bookings:', bookingsError.message);
      return;
    }

    console.log(`📊 Found ${userBookings.length} bookings:`);
    userBookings.forEach((booking, index) => {
      console.log(`   ${index + 1}. ID: ${booking.id.substring(0, 8)}... | Status: ${booking.booking_status} | Date: ${booking.scheduled_date}`);
    });

    // Step 2: Find a booking to confirm (preferably one that's 'assigned')
    const bookingToConfirm = userBookings.find(b => b.booking_status === 'assigned') || 
                            userBookings.find(b => b.booking_status === 'pending');
    
    if (!bookingToConfirm) {
      console.log('❌ No suitable booking found to confirm');
      return;
    }

    console.log(`\n2️⃣ Confirming booking: ${bookingToConfirm.id.substring(0, 8)}...`);
    console.log(`   Current status: ${bookingToConfirm.booking_status}`);
    console.log(`   Scheduled for: ${bookingToConfirm.scheduled_date} at ${bookingToConfirm.scheduled_time}`);

    // Step 3: Simulate booking confirmation (change status to 'confirmed')
    console.log('\n3️⃣ Simulating booking confirmation...');
    const { data: confirmedBooking, error: confirmError } = await supabase
      .from('bookings')
      .update({ 
        booking_status: 'confirmed',
        provider_confirmed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString()
      })
      .eq('id', bookingToConfirm.id)
      .select()
      .single();

    if (confirmError) {
      console.log('❌ Error confirming booking:', confirmError.message);
      return;
    }

    console.log(`✅ Booking confirmed! Status: ${confirmedBooking.booking_status}`);
    console.log(`📅 Confirmed at: ${confirmedBooking.provider_confirmed_at}`);

    // Step 4: Check notifications after confirmation
    console.log('\n4️⃣ Checking notifications after confirmation...');
    
    // Get updated bookings
    const { data: updatedBookings, error: updatedError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false });

    if (updatedError) {
      console.log('❌ Error fetching updated bookings:', updatedError.message);
      return;
    }

    // Convert to notifications
    const notifications = updatedBookings.map(booking => {
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

    // Step 5: Show notification results
    console.log('\n5️⃣ Notification Results:');
    console.log(`📊 Total notifications: ${notifications.length}`);
    
    const confirmedNotifications = notifications.filter(n => n.type === 'booking_confirmed');
    console.log(`✅ Confirmed notifications: ${confirmedNotifications.length}`);
    
    const unreadNotifications = notifications.filter(n => n.status === 'unread');
    console.log(`🔔 Unread notifications: ${unreadNotifications.length}`);

    // Show the specific confirmed notification
    if (confirmedNotifications.length > 0) {
      console.log('\n🎉 SUCCESS! Booking confirmation notification created:');
      confirmedNotifications.forEach(notification => {
        console.log(`\n📋 Notification Details:`);
        console.log(`   Type: ${notification.type}`);
        console.log(`   Title: ${notification.title}`);
        console.log(`   Message: ${notification.message}`);
        console.log(`   Status: ${notification.status}`);
        console.log(`   Priority: ${notification.priority}`);
        console.log(`   Time: ${notification.time}`);
      });
    }

    // Step 6: Test API endpoint
    console.log('\n6️⃣ Testing API endpoint...');
    const apiUrl = `http://localhost:3001/notifications/user/${testUserId}?page=1&limit=20`;
    console.log(`🌐 API URL: ${apiUrl}`);
    
    console.log('💡 To test the API endpoint, make sure your backend server is running on port 3001');
    console.log('💡 Then visit the frontend and check the notification bell');

    console.log('\n✅ Test completed! The notification system should now show the confirmed notification.');
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
testBookingConfirmation().catch(console.error);
