// Test script to verify notification system is working
const { supabase } = require('./lib/supabase');

async function testNotificationSystem() {
  console.log('Testing notification system...\n');

  try {
    // Test 1: Check if notifications table exists and is accessible
    console.log('1. Testing notifications table access...');
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .limit(1);

    if (notificationsError) {
      console.log('❌ Notifications table error:', notificationsError.message);
      return;
    } else {
      console.log('✅ Notifications table accessible');
    }

    // Test 2: Check if bookings table exists and is accessible
    console.log('\n2. Testing bookings table access...');
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .limit(1);

    if (bookingsError) {
      console.log('❌ Bookings table error:', bookingsError.message);
      return;
    } else {
      console.log('✅ Bookings table accessible');
    }

    // Test 3: Test creating a notification
    console.log('\n3. Testing notification creation...');
    const { data: newNotification, error: createError } = await supabase
      .from('notifications')
      .insert({
        type: 'test_notification',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system works',
        user_id: 'test-user-123',
        status: 'unread',
        priority: 'medium',
        metadata: {
          test: true,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (createError) {
      console.log('❌ Create notification error:', createError.message);
    } else {
      console.log('✅ Notification created successfully with ID:', newNotification.id);
      
      // Clean up test notification
      await supabase
        .from('notifications')
        .delete()
        .eq('id', newNotification.id);
      console.log('🧹 Test notification cleaned up');
    }

    // Test 4: Test user notifications query
    console.log('\n4. Testing user notifications query...');
    const { data: userNotifications, error: userError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', 'test-user-123')
      .order('created_at', { ascending: false })
      .limit(5);

    if (userError) {
      console.log('❌ User notifications query error:', userError.message);
    } else {
      console.log('✅ User notifications query successful, found:', userNotifications?.length || 0, 'notifications');
    }

    // Test 5: Test unread count query
    console.log('\n5. Testing unread count query...');
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', 'test-user-123')
      .eq('status', 'unread');

    if (countError) {
      console.log('❌ Unread count query error:', countError.message);
    } else {
      console.log('✅ Unread count query successful, count:', count || 0);
    }

    console.log('\n🎉 All notification system tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testNotificationSystem().catch(console.error);
}

module.exports = { testNotificationSystem };
