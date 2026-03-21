const axios = require('axios');

class AadhaarService {
  constructor() {
    this.apiKey = process.env.AADHAAR_API_KEY;
    this.provider = process.env.AADHAAR_API_PROVIDER || 'openrouter';
    // Use a vision-capable model for document/OCR extraction.
    // For Groq, override via OPENROUTER_MODEL (variable name kept for backwards compatibility).
    this.model =
      process.env.AADHAAR_MODEL ||
      process.env.OPENROUTER_MODEL ||
      (this.provider === 'groq' ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'google/gemini-2.5-flash-image-preview:free');

    this.siteUrl = process.env.OPENROUTER_SITE_URL || 'http://localhost:3001';
    this.appName = process.env.OPENROUTER_APP_NAME || 'S9-Aadhaar-Extractor';
    this.timeout = 60000; // 60 seconds for image processing
  }

  detectImageMime(imageBuffer) {
    // Minimal mime sniffing to avoid sending PNG bytes as image/jpeg (can cause "invalid image data").
    // Supports only what's commonly used in our tests/uploads.
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const isPng =
      imageBuffer.length >= 8 &&
      imageBuffer.slice(0, 8).equals(pngSignature);

    const isJpeg =
      imageBuffer.length >= 3 &&
      imageBuffer[0] === 0xFF &&
      imageBuffer[1] === 0xD8 &&
      imageBuffer[2] === 0xFF;

    if (isPng) return 'image/png';
    if (isJpeg) return 'image/jpeg';
    return 'image/jpeg';
  }

  async extractAadhaarDetails(imageBuffer, side = 'front', filename = 'aadhaar.jpg') {
    try {
      console.log(`Extracting Aadhaar details from ${side} side`);
      if (this.provider === 'groq') {
        return await this.extractUsingGroq(imageBuffer, side);
      }
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
        this.extractAadhaarDetails(frontBuffer, 'front'),
        this.extractAadhaarDetails(backBuffer, 'back')
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

  // Free / common vision models / fallbacks (try in order - keep this list in sync with OpenRouter)
  static FREE_VISION_MODELS = [
    'google/gemini-2.5-flash-image-preview:free',
    'google/gemini-2.5-flash-image',
    'google/gemini-2.5-flash-lite'
  ];

  async callOpenRouter(model, imageDataUrl, side) {
    const prompt = `Extract Aadhaar card details from this ${side} side image. Return ONLY JSON with keys: aadhaar_number, name, dob, gender, address, pincode. If a field is missing, use empty string.`;
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model,
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
    if (!content) throw new Error('No content in AI response');
    try {
      return JSON.parse(content);
    } catch (parseError) {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse AI response as JSON');
      return JSON.parse(match[0]);
    }
  }

  async callGroq(model, imageDataUrl, side) {
    const prompt = `Extract Aadhaar card details from this ${side} side image. Return ONLY JSON with keys: aadhaar_number, name, dob, gender, address, pincode. If a field is missing, use empty string.`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ],
        temperature: 0,
        // Force valid JSON so we can parse deterministically.
        response_format: { type: 'json_object' },
        max_completion_tokens: 512
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.appName
        },
        timeout: this.timeout
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in AI response');
    try {
      return JSON.parse(content);
    } catch (parseError) {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse AI response as JSON');
      return JSON.parse(match[0]);
    }
  }

  async extractUsingGroq(imageBuffer, side) {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('Groq API key is not configured. Set AADHAAR_API_KEY in .env');
    }

    const base64Image = imageBuffer.toString('base64');
    const mime = this.detectImageMime(imageBuffer);
    const imageDataUrl = `data:${mime};base64,${base64Image}`;

    console.log(`🤖 Extracting data from ${side} side using Groq (model: ${this.model})`);
    return await this.callGroq(this.model, imageDataUrl, side);
  }

  async extractUsingOpenRouter(imageBuffer, side) {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('OpenRouter API key is not configured. Set AADHAAR_API_KEY in .env');
    }
    const base64Image = imageBuffer.toString('base64');
    const mime = this.detectImageMime(imageBuffer);
    const imageDataUrl = `data:${mime};base64,${base64Image}`;

    // Try configured model first, then free models on 402/404
    const modelsToTry = [this.model];
    for (const m of AadhaarService.FREE_VISION_MODELS) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }

    let lastError;
    for (const model of modelsToTry) {
      try {
        console.log(`🤖 Extracting data from ${side} side using OpenRouter (model: ${model})`);
        return await this.callOpenRouter(model, imageDataUrl, side);
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const msg = error.response?.data?.error?.message || error.message || '';
        const is402 = status === 402 || msg.includes('Insufficient credits') || String(msg).includes('402');
        const is404 = status === 404 || msg.includes('No endpoints found') || msg.includes('not found');
        const shouldRetry = is402 || is404;
        if (shouldRetry && modelsToTry.indexOf(model) < modelsToTry.length - 1) {
          console.log(`⚠️ Model ${model} failed (${is402 ? 'credits' : 'not found'}). Retrying with next model...`);
          continue;
        }
        break;
      }
    }

    console.error('OpenRouter API error:', lastError?.message);
    if (lastError?.response) console.error('API response:', lastError.response.data);
    const err = new Error(`OpenRouter API error: ${lastError?.message}`);
    err.response = lastError?.response;
    throw err;
  }
}

module.exports = AadhaarService;
