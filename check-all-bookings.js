const { supabase } = require('./lib/supabase');

async function checkAllBookings() {
  console.log('Checking all bookings in the database...\n');

  try {
    // Check if bookings table exists and get all bookings
    const { data: allBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (bookingsError) {
      console.log('❌ Error accessing bookings table:', bookingsError.message);
      return;
    }

    console.log(`📊 Total bookings in database: ${allBookings?.length || 0}`);

    if (allBookings && allBookings.length > 0) {
      console.log('\n📋 All bookings:');
      allBookings.forEach((booking, index) => {
        console.log(`\n${index + 1}. Booking ID: ${booking.id}`);
        console.log(`   User ID: ${booking.user_id}`);
        console.log(`   Status: ${booking.booking_status}`);
        console.log(`   Date: ${booking.scheduled_date}`);
        console.log(`   Time: ${booking.scheduled_time}`);
        console.log(`   Address: ${booking.service_address}`);
        console.log(`   Amount: ${booking.total_amount}`);
        console.log(`   Created: ${booking.created_at}`);
      });

      // Group by user
      const bookingsByUser = allBookings.reduce((acc, booking) => {
        if (!acc[booking.user_id]) {
          acc[booking.user_id] = [];
        }
        acc[booking.user_id].push(booking);
        return acc;
      }, {});

      console.log('\n👥 Bookings by user:');
      Object.keys(bookingsByUser).forEach(userId => {
        console.log(`\nUser ${userId}: ${bookingsByUser[userId].length} bookings`);
        bookingsByUser[userId].forEach(booking => {
          console.log(`  - ${booking.booking_status} on ${booking.scheduled_date}`);
        });
      });

    } else {
      console.log('ℹ️ No bookings found in the database');
      console.log('💡 To see notifications, you need to create some bookings first');
    }

    // Check if there are any users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .limit(10);

    if (usersError) {
      console.log('❌ Error accessing users table:', usersError.message);
    } else {
      console.log(`\n👤 Total users in database: ${users?.length || 0}`);
      if (users && users.length > 0) {
        console.log('Recent users:');
        users.forEach((user, index) => {
          console.log(`  ${index + 1}. ${user.first_name} ${user.last_name} (${user.email}) - ID: ${user.id}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the check
checkAllBookings().catch(console.error);
