const fetch = require('node-fetch');

console.log('🧪 Testing Profile Status Update API...');

async function testProfileStatusUpdate() {
  try {
    // Test data
    const testProviderId = '70a7a05b-0fd7-48a2-8649-f11e6d577c6d'; // From our test data
    const testStatus = 'pending';
    const testReason = 'Testing status update';

    console.log('Testing with:', {
      providerId: testProviderId,
      status: testStatus,
      reason: testReason
    });

    // Make API call
    const response = await fetch(`http://localhost:3001/users/profile/${testProviderId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: testStatus,
        reason: testReason
      })
    });

    console.log('Response status:', response.status);
    
    const responseData = await response.json();
    console.log('Response data:', responseData);

    if (response.ok) {
      console.log('✅ Profile status update successful!');
    } else {
      console.log('❌ Profile status update failed:', responseData);
    }

  } catch (error) {
    console.error('💥 Error testing API:', error.message);
  }
}

// Wait a moment for server to start, then test
setTimeout(() => {
  testProfileStatusUpdate();
}, 3000);
