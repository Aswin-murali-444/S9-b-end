const { supabase } = require('./lib/supabase');

async function testNotificationEndpoints() {
  console.log('Testing notification endpoints...\n');

  // Test 1: Get user notifications
  console.log('1. Testing get user notifications...');
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', 'test-user-id')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.log('❌ Error:', error.message);
    } else {
      console.log('✅ Success:', data?.length || 0, 'notifications found');
    }
  } catch (err) {
    console.log('❌ Exception:', err.message);
  }

  // Test 2: Get unread count
  console.log('\n2. Testing get unread count...');
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', 'test-user-id')
      .eq('status', 'unread');

    if (error) {
      console.log('❌ Error:', error.message);
    } else {
      console.log('✅ Success:', count || 0, 'unread notifications');
    }
  } catch (err) {
    console.log('❌ Exception:', err.message);
  }

  // Test 3: Create a test notification
  console.log('\n3. Testing create notification...');
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        type: 'test_notification',
        title: 'Test Notification',
        message: 'This is a test notification',
        user_id: 'test-user-id',
        status: 'unread',
        priority: 'medium',
        metadata: {
          test: true,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      console.log('❌ Error:', error.message);
    } else {
      console.log('✅ Success: Notification created with ID:', data.id);
      
      // Clean up test notification
      await supabase
        .from('notifications')
        .delete()
        .eq('id', data.id);
      console.log('🧹 Test notification cleaned up');
    }
  } catch (err) {
    console.log('❌ Exception:', err.message);
  }

  console.log('\n✅ Notification endpoint testing completed!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testNotificationEndpoints().catch(console.error);
}

module.exports = { testNotificationEndpoints };
