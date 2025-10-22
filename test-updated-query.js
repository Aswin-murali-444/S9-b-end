const { supabase } = require('./lib/supabase');

async function testUpdatedQuery() {
  console.log('🧪 Testing updated notification query...\n');

  try {
    const authUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8';
    const usersTableId = '23c88529-cae1-4fa5-af9f-9153db425cc5';

    console.log('👤 Auth User ID:', authUserId);
    console.log('👤 Users Table ID:', usersTableId);

    // Test the OR query
    console.log('\n1️⃣ Testing OR query...');
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .or(`user_id.eq.${authUserId},user_id.eq.${usersTableId}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.log('❌ OR query error:', error.message);
      console.log('Error details:', error);
    } else {
      console.log(`✅ OR query successful: ${bookings.length} bookings found`);
      
      if (bookings.length > 0) {
        console.log('\n📋 Bookings found:');
        bookings.forEach((booking, index) => {
          console.log(`   ${index + 1}. ID: ${booking.id.substring(0, 8)}...`);
          console.log(`      User ID: ${booking.user_id}`);
          console.log(`      Status: ${booking.booking_status}`);
          console.log(`      Date: ${booking.scheduled_date}`);
        });
      }
    }

    // Test individual queries
    console.log('\n2️⃣ Testing individual queries...');
    
    // Test auth user ID
    const { data: authBookings, error: authError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', authUserId);

    if (authError) {
      console.log('❌ Auth user query error:', authError.message);
    } else {
      console.log(`📊 Auth user bookings: ${authBookings.length}`);
    }

    // Test users table ID
    const { data: usersBookings, error: usersError } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', usersTableId);

    if (usersError) {
      console.log('❌ Users table query error:', usersError.message);
    } else {
      console.log(`📊 Users table bookings: ${usersBookings.length}`);
    }

    // Test unread count query
    console.log('\n3️⃣ Testing unread count query...');
    const { count, error: countError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .or(`user_id.eq.${authUserId},user_id.eq.${usersTableId}`)
      .neq('booking_status', 'completed');

    if (countError) {
      console.log('❌ Unread count query error:', countError.message);
    } else {
      console.log(`✅ Unread count: ${count}`);
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

// Run the test
testUpdatedQuery().catch(console.error);
