const { supabase } = require('./lib/supabase');

async function checkUsersTableStructure() {
  console.log('🔍 Checking users table structure...\n');

  try {
    // Get a sample user to see the actual columns
    const { data: sampleUser, error } = await supabase
      .from('users')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.log('❌ Error fetching sample user:', error.message);
      return;
    }

    console.log('📋 Users table columns:');
    Object.keys(sampleUser).forEach(column => {
      console.log(`   - ${column}: ${typeof sampleUser[column]}`);
    });

    console.log('\n📊 Sample user data:');
    console.log(JSON.stringify(sampleUser, null, 2));

    // Now get all users with correct columns
    console.log('\n👥 All users:');
    const { data: allUsers, error: allUsersError } = await supabase
      .from('users')
      .select('*')
      .limit(10);

    if (allUsersError) {
      console.log('❌ Error fetching all users:', allUsersError.message);
      return;
    }

    console.log(`📊 Found ${allUsers.length} users:`);
    allUsers.forEach((user, index) => {
      console.log(`\n${index + 1}. User:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email}`);
      if (user.name) console.log(`   Name: ${user.name}`);
      if (user.full_name) console.log(`   Full Name: ${user.full_name}`);
    });

    // Check bookings for each user
    console.log('\n📋 Checking bookings for each user...');
    for (const user of allUsers) {
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, booking_status, scheduled_date')
        .eq('user_id', user.id);

      if (!bookingsError) {
        console.log(`\n👤 ${user.email}: ${bookings.length} bookings`);
        if (bookings.length > 0) {
          bookings.forEach(booking => {
            console.log(`   - ${booking.booking_status} on ${booking.scheduled_date}`);
          });
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the check
checkUsersTableStructure().catch(console.error);
