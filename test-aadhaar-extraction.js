const { createClient } = require('@supabase/supabase-js');
const AadhaarService = require('./services/aadhaarService');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

console.log('🔍 Aadhaar Extraction Diagnostic Tool');
console.log('=====================================\n');

// 1. Check environment variables
console.log('1️⃣ Environment Variables Check:');
console.log('AADHAAR_API_KEY:', process.env.AADHAAR_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('AADHAAR_API_PROVIDER:', process.env.AADHAAR_API_PROVIDER || '❌ NOT SET');
console.log('OPENROUTER_MODEL:', process.env.OPENROUTER_MODEL || '❌ NOT SET');
console.log('OPENROUTER_SITE_URL:', process.env.OPENROUTER_SITE_URL || '❌ NOT SET');
console.log('OPENROUTER_APP_NAME:', process.env.OPENROUTER_APP_NAME || '❌ NOT SET');
console.log('');

// 2. Test AadhaarService initialization
console.log('2️⃣ AadhaarService Initialization:');
try {
  const aadhaarService = new AadhaarService();
  console.log('✅ AadhaarService initialized successfully');
  console.log('API Key configured:', aadhaarService.apiKey ? '✅ YES' : '❌ NO');
  console.log('Provider:', aadhaarService.provider);
  console.log('Model:', aadhaarService.model);
  console.log('Timeout:', aadhaarService.timeout + 'ms');
} catch (error) {
  console.log('❌ AadhaarService initialization failed:', error.message);
}
console.log('');

// 3. Test API connectivity (without actual image)
console.log('3️⃣ API Connectivity Test:');
async function testApiConnectivity() {
  try {
    const axios = require('axios');
    
    // Test OpenRouter API endpoint
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.AADHAAR_API_KEY}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3001',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'S9-Aadhaar-Extractor'
      },
      timeout: 10000
    });
    
    console.log('✅ OpenRouter API is accessible');
    console.log('Response status:', response.status);
    
    // Check if the configured model is available
    const models = response.data?.data || [];
    const configuredModel = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-image';
    const modelExists = models.some(model => model.id === configuredModel);
    
    console.log('Configured model available:', modelExists ? '✅ YES' : '❌ NO');
    if (!modelExists) {
      console.log('Available models:', models.slice(0, 5).map(m => m.id).join(', '));
    }
    
  } catch (error) {
    console.log('❌ API connectivity test failed:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
  }
}

// 4. Test route registration
console.log('4️⃣ Route Registration Test:');
try {
  const express = require('express');
  const app = express();
  const aadhaarRouter = require('./routes/aadhaar');
  
  app.use('/api/aadhaar', aadhaarRouter);
  console.log('✅ Aadhaar routes registered successfully');
  console.log('Available endpoints:');
  console.log('  - POST /api/aadhaar/extract');
  console.log('  - POST /api/aadhaar/extract-both');
} catch (error) {
  console.log('❌ Route registration failed:', error.message);
}
console.log('');

// 5. Test with sample image (if available)
console.log('5️⃣ Sample Image Test:');
async function testWithSampleImage() {
  try {
    // Look for sample Aadhaar images in the project
    const samplePaths = [
      './sample-aadhaar-front.jpg',
      './sample-aadhaar-back.jpg',
      './test-images/aadhaar-front.jpg',
      './test-images/aadhaar-back.jpg'
    ];
    
    let sampleImage = null;
    for (const samplePath of samplePaths) {
      if (fs.existsSync(samplePath)) {
        sampleImage = samplePath;
        break;
      }
    }
    
    if (!sampleImage) {
      console.log('ℹ️  No sample Aadhaar images found for testing');
      console.log('   To test with real images, place sample images in the project root');
      return;
    }
    
    console.log('📷 Found sample image:', sampleImage);
    
    const aadhaarService = new AadhaarService();
    const imageBuffer = fs.readFileSync(sampleImage);
    
    console.log('🔄 Testing extraction...');
    const result = await aadhaarService.extractAadhaarDetails(imageBuffer, 'front');
    
    console.log('✅ Extraction successful!');
    console.log('Extracted data:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.log('❌ Sample image test failed:', error.message);
  }
}

// Run all tests
async function runDiagnostics() {
  await testApiConnectivity();
  await testWithSampleImage();
  
  console.log('');
  console.log('🎯 Common Issues & Solutions:');
  console.log('============================');
  console.log('1. Missing API Key: Set AADHAAR_API_KEY in .env file');
  console.log('2. Invalid Model: Check OPENROUTER_MODEL is available');
  console.log('3. Payment Required: Add credits to OpenRouter account');
  console.log('4. Network Issues: Check internet connection');
  console.log('5. Image Quality: Ensure clear, readable Aadhaar images');
  console.log('6. File Size: Images should be under 10MB');
  console.log('');
  console.log('🔧 Next Steps:');
  console.log('1. Fix any ❌ issues above');
  console.log('2. Restart your backend server');
  console.log('3. Test Aadhaar extraction in the frontend');
  console.log('4. Check browser console for detailed error messages');
}

runDiagnostics();
