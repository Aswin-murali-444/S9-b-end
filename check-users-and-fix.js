const { supabase } = require('./lib/supabase');

async function checkUsersAndFix() {
  console.log('🔍 Checking users and fixing notification issue...\n');

  try {
    // Check what users exist
    console.log('1️⃣ Checking existing users...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .limit(10);

    if (usersError) {
      console.log('❌ Error fetching users:', usersError.message);
      return;
    }

    console.log(`📊 Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.first_name} ${user.last_name} (${user.email})`);
      console.log(`      ID: ${user.id}`);
    });

    // Check bookings for each user
    console.log('\n2️⃣ Checking bookings for each user...');
    for (const user of users) {
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, booking_status, scheduled_date')
        .eq('user_id', user.id);

      if (!bookingsError) {
        console.log(`👤 ${user.first_name} ${user.last_name}: ${bookings.length} bookings`);
        if (bookings.length > 0) {
          bookings.forEach(booking => {
            console.log(`   - ${booking.booking_status} on ${booking.scheduled_date}`);
          });
        }
      }
    }

    // Find the user with most bookings
    console.log('\n3️⃣ Finding user with most bookings...');
    let maxBookings = 0;
    let userWithMostBookings = null;
    
    for (const user of users) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('user_id', user.id);
      
      if (bookings && bookings.length > maxBookings) {
        maxBookings = bookings.length;
        userWithMostBookings = user;
      }
    }

    if (userWithMostBookings) {
      console.log(`🎯 User with most bookings: ${userWithMostBookings.first_name} ${userWithMostBookings.last_name}`);
      console.log(`   Email: ${userWithMostBookings.email}`);
      console.log(`   ID: ${userWithMostBookings.id}`);
      console.log(`   Bookings: ${maxBookings}`);
      
      console.log('\n💡 SOLUTION:');
      console.log('   To see notifications, you need to log in as this user:');
      console.log(`   Email: ${userWithMostBookings.email}`);
      console.log(`   ID: ${userWithMostBookings.id}`);
    }

    // Check current logged-in user
    console.log('\n4️⃣ Current situation:');
    const currentUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8';
    const currentUser = users.find(u => u.id === currentUserId);
    
    if (currentUser) {
      console.log(`✅ Current user exists: ${currentUser.first_name} ${currentUser.last_name}`);
      console.log(`   Email: ${currentUser.email}`);
      
      // Check if this user has bookings
      const { data: currentUserBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('user_id', currentUserId);
      
      console.log(`   Bookings: ${currentUserBookings?.length || 0}`);
      
      if (currentUserBookings && currentUserBookings.length === 0) {
        console.log('❌ This user has no bookings, so no notifications will show.');
        console.log('💡 Either:');
        console.log('   1. Log in as the user with bookings, OR');
        console.log('   2. Create bookings for this user');
      }
    } else {
      console.log(`❌ Current user ID ${currentUserId} does not exist in users table`);
      console.log('💡 You need to log in as a valid user');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the check
checkUsersAndFix().catch(console.error);
