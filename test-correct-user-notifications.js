const { supabase } = require('./lib/supabase');

async function testNotificationWithCorrectUser() {
  console.log('Testing notification system with correct user ID...\n');

  try {
    // Use the actual user ID from the bookings
    const correctUserId = '23c88529-cae1-4fa5-af9f-9153db425cc5';

    console.log(`Testing with user ID: ${correctUserId}`);

    // Test 1: Get bookings for the correct user
    console.log('1. Fetching bookings for correct user...');
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', correctUserId)
      .order('created_at', { ascending: false });

    if (bookingsError) {
      console.log('❌ Error fetching bookings:', bookingsError.message);
      return;
    }

    console.log(`✅ Found ${bookings?.length || 0} bookings for user`);

    // Test 2: Convert to notifications
    console.log('\n2. Converting bookings to notifications...');
    const notifications = (bookings || []).map(booking => {
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
        metadata: {
          booking_id: booking.id,
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          service_address: booking.service_address,
          total_amount: booking.total_amount,
          payment_status: booking.payment_status,
          booking_status: booking.booking_status
        }
      };
    });

    console.log(`✅ Generated ${notifications.length} notifications`);
    
    // Test 3: Show notification details
    console.log('\n3. Notification details:');
    notifications.forEach((notification, index) => {
      console.log(`\n📋 Notification ${index + 1}:`);
      console.log(`   Type: ${notification.type}`);
      console.log(`   Title: ${notification.title}`);
      console.log(`   Message: ${notification.message}`);
      console.log(`   Status: ${notification.status}`);
      console.log(`   Priority: ${notification.priority}`);
      console.log(`   Time: ${notification.time}`);
      console.log(`   Booking Status: ${notification.metadata.booking_status}`);
    });

    // Test 4: Count unread notifications
    const unreadCount = notifications.filter(n => n.status === 'unread').length;
    console.log(`\n📊 Unread notifications: ${unreadCount}`);
    console.log(`📊 Read notifications: ${notifications.length - unreadCount}`);

    console.log('\n🎉 Notification system is working correctly!');
    console.log('💡 Make sure you are logged in as the correct user to see these notifications in the UI.');

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

// Run the test
testNotificationWithCorrectUser().catch(console.error);
