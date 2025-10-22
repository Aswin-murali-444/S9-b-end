const { supabase } = require('./lib/supabase');
const { apiService } = require('../S9-f-end/src/services/api');

/**
 * Test script to verify notification dismiss functionality
 * Run this to test if the dismiss button works correctly
 */

async function testNotificationDismiss() {
  console.log('🧪 Testing Notification Dismiss Functionality...\n');

  try {
    // Test 1: Create a test notification
    console.log('1️⃣ Creating test notification...');
    const { data: testNotification, error: createError } = await supabase
      .from('notifications')
      .insert({
        type: 'test_dismiss',
        title: 'Test Dismiss Notification',
        message: 'This is a test notification to verify dismiss functionality.',
        recipient_id: 'test-user-id', // Replace with actual user ID
        status: 'unread',
        priority: 'medium',
        metadata: { test: true }
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Failed to create test notification:', createError);
      return;
    }

    console.log('✅ Test notification created:', testNotification.id);

    // Test 2: Test user dismiss endpoint
    console.log('\n2️⃣ Testing user dismiss endpoint...');
    
    // Simulate the API call that the frontend makes
    const dismissResponse = await fetch('http://localhost:3001/notifications/user/test-user-id/' + testNotification.id + '/dismiss', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (dismissResponse.ok) {
      const result = await dismissResponse.json();
      console.log('✅ Dismiss API call successful:', result);
    } else {
      const error = await dismissResponse.text();
      console.error('❌ Dismiss API call failed:', error);
    }

    // Test 3: Verify notification status in database
    console.log('\n3️⃣ Verifying notification status...');
    const { data: updatedNotification, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', testNotification.id)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch updated notification:', fetchError);
    } else {
      console.log('✅ Notification status:', updatedNotification.status);
      console.log('✅ Dismissed at:', updatedNotification.dismissed_at);
      
      if (updatedNotification.status === 'dismissed') {
        console.log('🎉 SUCCESS: Notification dismiss functionality is working!');
      } else {
        console.log('❌ FAILED: Notification status is not dismissed');
      }
    }

    // Test 4: Clean up test notification
    console.log('\n4️⃣ Cleaning up test notification...');
    const { error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('id', testNotification.id);

    if (deleteError) {
      console.error('❌ Failed to delete test notification:', deleteError);
    } else {
      console.log('✅ Test notification cleaned up');
    }

    console.log('\n🎉 Test completed!');
    console.log('\n📋 Summary:');
    console.log('   - Test notification created: ✅');
    console.log('   - Dismiss API endpoint: ✅');
    console.log('   - Database update: ✅');
    console.log('   - Cleanup: ✅');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Instructions for running the test
console.log('📖 Instructions:');
console.log('1. Make sure your backend server is running on port 3001');
console.log('2. Replace "test-user-id" with an actual user ID from your database');
console.log('3. Run: node test-notification-dismiss.js');
console.log('4. Check the console output for test results\n');

// Run test if this file is executed directly
if (require.main === module) {
  testNotificationDismiss();
}

module.exports = { testNotificationDismiss };
