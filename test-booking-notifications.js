const { supabase } = require('./lib/supabase');

async function testBookingNotifications() {
  console.log('Testing booking-based notification system...\n');

  try {
    const testUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8';

    // Test 1: Check if bookings table exists and is accessible
    console.log('1. Testing bookings table access...');
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', testUserId)
      .limit(5);

    if (bookingsError) {
      console.log('❌ Bookings table error:', bookingsError.message);
      return;
    } else {
      console.log('✅ Bookings table accessible');
      console.log(`📊 Found ${bookings?.length || 0} bookings for test user`);
    }

    // Test 2: Test notification conversion
    console.log('\n2. Testing notification conversion...');
    if (bookings && bookings.length > 0) {
      bookings.forEach((booking, index) => {
        let notificationType, title, message;
        
        switch (booking.booking_status) {
          case 'pending':
            notificationType = 'booking_pending';
            title = 'Booking Request Sent';
            message = `Your service booking for ${booking.scheduled_date} at ${booking.scheduled_time} has been sent and is awaiting provider assignment.`;
            break;
          case 'assigned':
            notificationType = 'booking_assigned';
            title = 'Service Provider Assigned';
            message = `A service provider has been assigned to your booking scheduled for ${booking.scheduled_date} at ${booking.scheduled_time}.`;
            break;
          case 'confirmed':
            notificationType = 'booking_confirmed';
            title = 'Booking Confirmed';
            message = `Your booking scheduled for ${booking.scheduled_date} at ${booking.scheduled_time} has been confirmed by the service provider.`;
            break;
          case 'in_progress':
            notificationType = 'service_started';
            title = 'Service Started';
            message = `Your service has started. The provider is on their way to ${booking.service_address}.`;
            break;
          case 'completed':
            notificationType = 'service_completed';
            title = 'Service Completed';
            message = `Your service has been completed successfully. Please rate your experience.`;
            break;
          case 'cancelled':
            notificationType = 'booking_cancelled';
            title = 'Booking Cancelled';
            message = `Your booking scheduled for ${booking.scheduled_date} has been cancelled.`;
            break;
          default:
            notificationType = 'booking_update';
            title = 'Booking Update';
            message = `Your booking status has been updated to: ${booking.booking_status}`;
        }

        console.log(`📋 Booking ${index + 1}:`);
        console.log(`   Type: ${notificationType}`);
        console.log(`   Title: ${title}`);
        console.log(`   Message: ${message}`);
        console.log(`   Status: ${booking.booking_status}`);
        console.log(`   Date: ${booking.scheduled_date} at ${booking.scheduled_time}`);
        console.log('');
      });
    } else {
      console.log('ℹ️ No bookings found for test user');
    }

    // Test 3: Test unread count calculation
    console.log('3. Testing unread count calculation...');
    const { count, error: countError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', testUserId)
      .neq('booking_status', 'completed');

    if (countError) {
      console.log('❌ Unread count query error:', countError.message);
    } else {
      console.log(`✅ Unread count calculation successful: ${count || 0} unread notifications`);
    }

    // Test 4: Test API endpoint simulation
    console.log('\n4. Testing API endpoint simulation...');
    
    // Simulate the notification API response
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

    console.log(`✅ Generated ${notifications.length} notifications from bookings`);
    console.log(`📊 Unread notifications: ${notifications.filter(n => n.status === 'unread').length}`);
    console.log(`📊 Read notifications: ${notifications.filter(n => n.status === 'read').length}`);

    console.log('\n🎉 Booking-based notification system test completed successfully!');
    console.log('The notification system will now work with your existing bookings table.');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
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

// Run the test if this file is executed directly
if (require.main === module) {
  testBookingNotifications().catch(console.error);
}

module.exports = { testBookingNotifications };
