const http = require('http');

console.log('🧪 Testing Profile Status Update API...');

function testProfileStatusUpdate() {
  const testProviderId = '70a7a05b-0fd7-48a2-8649-f11e6d577c6d';
  const testStatus = 'pending';
  const testReason = 'Testing status update';

  console.log('Testing with:', {
    providerId: testProviderId,
    status: testStatus,
    reason: testReason
  });

  const postData = JSON.stringify({
    status: testStatus,
    reason: testReason
  });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: `/admin/profile/${testProviderId}/status`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log('Response status:', res.statusCode);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const responseData = JSON.parse(data);
        console.log('Response data:', responseData);
        
        if (res.statusCode === 200) {
          console.log('✅ Profile status update successful!');
        } else {
          console.log('❌ Profile status update failed:', responseData);
        }
      } catch (err) {
        console.log('Raw response:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('💥 Error testing API:', error.message);
  });

  req.write(postData);
  req.end();
}

// Wait a moment for server to start, then test
setTimeout(() => {
  testProfileStatusUpdate();
}, 3000);
