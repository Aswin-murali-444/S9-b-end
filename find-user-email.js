const { supabase } = require('./lib/supabase');

async function findUserEmail() {
  console.log('🔍 Finding email for user ID: ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8\n');

  try {
    const userId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8';

    // Check users table
    console.log('1️⃣ Checking users table...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) {
      console.log('❌ User not found in users table:', userError.message);
    } else {
      console.log('✅ User found in users table:');
      console.log('   Email:', user.email);
      console.log('   Full Name:', user.full_name);
      console.log('   Role:', user.role);
      console.log('   Status:', user.status);
      return;
    }

    // Check auth.users table (Supabase auth)
    console.log('\n2️⃣ Checking auth.users table...');
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

    if (authError) {
      console.log('❌ User not found in auth.users:', authError.message);
    } else {
      console.log('✅ User found in auth.users:');
      console.log('   Email:', authUser.user.email);
      console.log('   Created:', authUser.user.created_at);
      console.log('   Last Sign In:', authUser.user.last_sign_in_at);
      return;
    }

    // Check if this might be a different user ID format
    console.log('\n3️⃣ Checking all users for similar IDs...');
    const { data: allUsers, error: allUsersError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .limit(50);

    if (!allUsersError) {
      console.log('📊 All users in database:');
      allUsers.forEach((u, index) => {
        console.log(`   ${index + 1}. ${u.email} - ID: ${u.id}`);
        if (u.full_name) console.log(`      Name: ${u.full_name}`);
      });
    }

    // Check if this ID exists in any other tables
    console.log('\n4️⃣ Checking if ID exists in other tables...');
    
    // Check bookings table
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('user_id', userId)
      .limit(1);

    if (!bookingsError && bookings.length > 0) {
      console.log('✅ User ID found in bookings table');
    } else {
      console.log('❌ User ID not found in bookings table');
    }

    // Check if this might be a session/token issue
    console.log('\n5️⃣ Possible explanations:');
    console.log('   - This might be a temporary session ID');
    console.log('   - User might have been deleted from users table');
    console.log('   - This could be a cached/stale user ID');
    console.log('   - Authentication token might be invalid');

    console.log('\n💡 RECOMMENDATION:');
    console.log('   Log out and log back in to get a valid user session');
    console.log('   Or log in as: aswinkavumkal2002@gmail.com');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the search
findUserEmail().catch(console.error);
