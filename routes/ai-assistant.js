const express = require('express');
const axios = require('axios');
const router = express.Router();

class AIAssistantService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    this.model = process.env.AI_MODEL || 'openai/gpt-4o-mini';
    this.provider = process.env.AI_PROVIDER || 'openrouter';
    this.baseUrl = this.provider === 'openrouter' 
      ? 'https://openrouter.ai/api/v1' 
      : 'https://api.openai.com/v1';
  }

  async generateResponse(userMessage, conversationHistory = [], imageData = null) {
    try {
      const systemPrompt = `You are Nexus AI Assistant, a helpful AI assistant for a home services platform. You help users with:

1. Service-related questions for these specific categories:
   - Home Maintenance (cleaning, repairs, and general home upkeep services)
   - Caregiving (elder care, child care, and personal assistance services)
   - Transportation (ride services, delivery, and transportation solutions)
   - Technology (IT support, device setup, and technical assistance)
   - Healthcare (medical services, wellness, and health-related support)

2. Booking assistance and scheduling
3. General platform navigation
4. Troubleshooting common issues
5. Providing helpful tips and advice
6. Analyzing images related to home services, maintenance issues, or service requests

When analyzing images, focus on identifying issues related to:
- Home Maintenance: Cleaning needs, repair issues, maintenance problems
- Caregiving: Elder care needs, child care requirements, personal assistance
- Transportation: Vehicle issues, delivery problems, transportation needs
- Technology: Device problems, IT issues, technical setup needs
- Healthcare: Medical equipment, wellness needs, health-related concerns

Keep responses concise, helpful, and friendly. If you don't know something specific about the platform, suggest contacting customer support.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory
      ];

      // Add image content if provided
      if (imageData) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: userMessage || 'Please analyze this image' },
            { type: 'image_url', image_url: { url: imageData } }
          ]
        });
      } else {
        messages.push({ role: 'user', content: userMessage });
      }

      const requestBody = {
        model: this.model,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
        stream: false
      };

      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3001',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'Nexus AI Assistant'
      };

      const response = await axios.post(`${this.baseUrl}/chat/completions`, requestBody, {
        headers,
        timeout: 30000
      });

      return {
        success: true,
        response: response.data.choices[0].message.content,
        usage: response.data.usage
      };

    } catch (error) {
      console.error('AI Assistant Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Failed to generate response'
      };
    }
  }
}

const aiService = new AIAssistantService();

// POST /api/ai-assistant/chat
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [], imageData } = req.body;

    if (!message && !imageData) {
      return res.status(400).json({
        success: false,
        error: 'Message or image is required'
      });
    }

    const result = await aiService.generateResponse(message, conversationHistory, imageData);
    
    if (result.success) {
      res.json({
        success: true,
        response: result.response,
        usage: result.usage
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/ai-assistant/status
router.get('/status', async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'active',
      model: aiService.model,
      provider: aiService.provider
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Service unavailable'
    });
  }
});

module.exports = router;
