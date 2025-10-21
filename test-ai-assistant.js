const axios = require('axios');

async function testAIAssistant() {
  const baseUrl = 'http://localhost:3001/api/ai-assistant';
  
  try {
    console.log('Testing AI Assistant API...\n');
    
    // Test status endpoint
    console.log('1. Testing status endpoint...');
    const statusResponse = await axios.get(`${baseUrl}/status`);
    console.log('✅ Status:', statusResponse.data);
    
    // Test suggestions endpoint
    console.log('\n2. Testing suggestions endpoint...');
    const suggestionsResponse = await axios.get(`${baseUrl}/suggestions`);
    console.log('✅ Suggestions:', suggestionsResponse.data.suggestions);
    
    // Test chat endpoint
    console.log('\n3. Testing chat endpoint...');
    const chatResponse = await axios.post(`${baseUrl}/chat`, {
      message: 'Hello, how can you help me?',
      conversationHistory: []
    });
    console.log('✅ Chat response:', chatResponse.data.response);
    
    console.log('\n🎉 All tests passed! AI Assistant is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 500) {
      console.log('\n💡 Make sure your environment variables are set:');
      console.log('- OPENAI_API_KEY or OPENROUTER_API_KEY');
      console.log('- AI_MODEL (optional, defaults to openai/gpt-4o-mini)');
      console.log('- AI_PROVIDER (optional, defaults to openrouter)');
    }
  }
}

testAIAssistant();
