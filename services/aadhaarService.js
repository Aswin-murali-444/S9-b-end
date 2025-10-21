const axios = require('axios');

class AadhaarService {
  constructor() {
    this.apiKey = process.env.AADHAAR_API_KEY;
    this.provider = process.env.AADHAAR_API_PROVIDER || 'openrouter';
    this.model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-image';
    this.siteUrl = process.env.OPENROUTER_SITE_URL || 'http://localhost:3001';
    this.appName = process.env.OPENROUTER_APP_NAME || 'S9-Aadhaar-Extractor';
    this.timeout = 30000; // 30 seconds timeout
  }

  async extractAadhaarDetails(imageBuffer, side = 'front', filename = 'aadhaar.jpg') {
    try {
      console.log(`Extracting Aadhaar details from ${side} side`);
      return await this.extractUsingOpenRouter(imageBuffer, side);
    } catch (error) {
      console.error('Aadhaar extraction error:', error);
      throw error;
    }
  }

  async extractAadhaarFromBoth(frontBuffer, backBuffer) {
    try {
      console.log('Extracting from both sides of Aadhaar');
      
      const [frontResult, backResult] = await Promise.all([
        this.extractUsingOpenRouter(frontBuffer, 'front'),
        this.extractUsingOpenRouter(backBuffer, 'back')
      ]);

      // Combine results, preferring front side for common fields
      return {
        aadhaar_number: frontResult.aadhaar_number || backResult.aadhaar_number || '',
        name: frontResult.name || backResult.name || '',
        dob: frontResult.dob || backResult.dob || '',
        gender: frontResult.gender || backResult.gender || '',
        address: backResult.address || frontResult.address || '',
        pincode: backResult.pincode || frontResult.pincode || ''
      };
    } catch (error) {
      console.error('Error extracting from both sides:', error);
      throw error;
    }
  }

  async extractUsingOpenRouter(imageBuffer, side) {
    console.log(`🤖 Extracting data from ${side} side using OpenRouter AI`);
    
    const base64Image = imageBuffer.toString('base64');
    const imageDataUrl = `data:image/jpeg;base64,${base64Image}`;

    const prompt = `Extract Aadhaar card details from this ${side} side image. Return ONLY JSON with keys: aadhaar_number, name, dob, gender, address, pincode. If a field is missing, use empty string.`;

    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ],
        temperature: 0
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName
        },
        timeout: this.timeout
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content in AI response');
      }

      // Try to parse the JSON response
      try {
        return JSON.parse(content);
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from text
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) {
          throw new Error('Could not parse AI response as JSON');
        }
        return JSON.parse(match[0]);
      }
    } catch (error) {
      console.error('OpenRouter API error:', error.message);
      if (error.response) {
        console.error('API response:', error.response.data);
      }
      throw new Error(`OpenRouter API error: ${error.message}`);
    }
  }
}

module.exports = AadhaarService;
