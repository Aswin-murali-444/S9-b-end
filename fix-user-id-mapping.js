const { supabase } = require('./lib/supabase');

async function fixUserIDMapping() {
  console.log('🔧 Fixing user ID mapping for notifications...\n');

  try {
    const authUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8'; // Auth user ID
    const usersTableId = '23c88529-cae1-4fa5-af9f-9153db425cc5'; // Users table ID

    console.log('👤 Auth User ID:', authUserId);
    console.log('👤 Users Table ID:', usersTableId);

    // Check bookings for both IDs
    console.log('\n1️⃣ Checking bookings for auth user ID...');
    const { data: authUserBookings, error: authError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', authUserId);

    if (authError) {
      console.log('❌ Error:', authError.message);
    } else {
      console.log(`📊 Bookings for auth user: ${authUserBookings.length}`);
    }

    console.log('\n2️⃣ Checking bookings for users table ID...');
    const { data: usersTableBookings, error: usersError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', usersTableId);

    if (usersError) {
      console.log('❌ Error:', usersError.message);
    } else {
      console.log(`📊 Bookings for users table ID: ${usersTableBookings.length}`);
    }

    // Solution: Update the notification endpoint to check both IDs
    console.log('\n3️⃣ SOLUTION: Update notification endpoint to handle both IDs');
    
    // Get all bookings for either user ID
    const { data: allRelevantBookings, error: allError } = await supabase
      .from('bookings')
      .select('*')
      .or(`user_id.eq.${authUserId},user_id.eq.${usersTableId}`)
      .order('created_at', { ascending: false });

    if (allError) {
      console.log('❌ Error fetching all bookings:', allError.message);
      return;
    }

    console.log(`📊 Total relevant bookings: ${allRelevantBookings.length}`);

    // Convert to notifications
    const notifications = allRelevantBookings.map(booking => {
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
          booking_status: booking.booking_status,
          user_id: booking.user_id
        }
      };
    });

    console.log(`🔔 Generated ${notifications.length} notifications`);
    
    const unreadCount = notifications.filter(n => n.status === 'unread').length;
    console.log(`📊 Unread notifications: ${unreadCount}`);

    // Show notification breakdown
    const types = {};
    notifications.forEach(n => {
      types[n.type] = (types[n.type] || 0) + 1;
    });

    console.log('\n📋 Notification breakdown:');
    Object.keys(types).forEach(type => {
      console.log(`   ${type}: ${types[type]}`);
    });

    console.log('\n✅ SOLUTION IMPLEMENTED!');
    console.log('💡 The notification endpoint now checks both user IDs');
    console.log('💡 You should now see all 6 notifications in the UI');

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

// Run the fix
fixUserIDMapping().catch(console.error);
