const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// Test the Aadhaar extraction endpoint
async function testAadhaarEndpoint() {
  try {
    console.log('🧪 Testing Aadhaar Extraction Endpoint');
    console.log('=====================================\n');
    
    // Test 1: Check if endpoint is accessible
    console.log('1️⃣ Testing endpoint accessibility...');
    try {
      const response = await axios.get('http://localhost:3001/api/aadhaar/extract', {
        timeout: 5000
      });
    } catch (error) {
      if (error.response && error.response.status === 405) {
        console.log('✅ Endpoint is accessible (Method Not Allowed is expected for GET)');
      } else {
        console.log('❌ Endpoint not accessible:', error.message);
        return;
      }
    }
    
    // Test 2: Test with a dummy image (create a simple test image)
    console.log('\n2️⃣ Testing with dummy image...');
    
    // Create a simple test image buffer (1x1 pixel PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    const formData = new FormData();
    formData.append('image', testImageBuffer, {
      filename: 'test.png',
      contentType: 'image/png'
    });
    formData.append('side', 'front');
    
    try {
      const response = await axios.post('http://localhost:3001/api/aadhaar/extract', formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000
      });
      
      console.log('✅ Request sent successfully');
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      
    } catch (error) {
      console.log('Response received (this is expected for dummy image):');
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Error:', error.response.data);
        
        // Check if it's an API-related error
        if (error.response.data && error.response.data.error) {
          const errorMsg = error.response.data.error;
          if (errorMsg.includes('Payment required') || errorMsg.includes('Payment Required')) {
            console.log('\n💰 ISSUE FOUND: Payment Required');
            console.log('Solution: Add credits to your OpenRouter account');
          } else if (errorMsg.includes('not configured') || errorMsg.includes('API key')) {
            console.log('\n🔑 ISSUE FOUND: API Configuration');
            console.log('Solution: Check your AADHAAR_API_KEY in .env file');
          } else {
            console.log('\n🤖 API Error (expected for dummy image):', errorMsg);
          }
        }
      } else {
        console.log('Network error:', error.message);
      }
    }
    
    // Test 3: Check server logs
    console.log('\n3️⃣ Server Status Check:');
    try {
      const healthResponse = await axios.get('http://localhost:3001/', {
        timeout: 5000
      });
      console.log('✅ Server is responding');
    } catch (error) {
      console.log('❌ Server not responding:', error.message);
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

// Run the test
testAadhaarEndpoint();
