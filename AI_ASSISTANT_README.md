# Nexus AI Assistant

A comprehensive AI-powered customer support system integrated into the Nexus home services platform.

## Features

### 🤖 AI Chat Interface
- Real-time conversation with AI assistant
- Context-aware responses based on conversation history
- Typing indicators and smooth animations
- Auto-scrolling chat messages

### 💡 Quick Suggestions
- Pre-defined common questions
- One-click question submission
- Dynamic suggestion loading

### 🎨 Modern UI/UX
- Beautiful gradient header design
- Responsive layout for all devices
- Smooth animations and transitions
- Professional chat interface

### 🔧 Smart Features
- Clear conversation functionality
- Online/offline status indicator
- Error handling with user-friendly messages
- Loading states and disabled states

## Backend API

### Endpoints

#### `POST /api/ai-assistant/chat`
Send a message to the AI assistant.

**Request Body:**
```json
{
  "message": "How do I book a service?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant", 
      "content": "Hi! How can I help you today?"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "response": "To book a service, you can...",
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 100,
    "total_tokens": 150
  }
}
```

#### `GET /api/ai-assistant/suggestions`
Get quick suggestion questions.

**Response:**
```json
{
  "success": true,
  "suggestions": [
    "How do I book a service?",
    "What services are available?",
    "How can I track my booking?"
  ]
}
```

#### `GET /api/ai-assistant/status`
Check AI assistant service status.

**Response:**
```json
{
  "success": true,
  "status": "active",
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter"
}
```

## Environment Variables

Add these to your `.env` file:

```env
# AI Assistant Configuration
OPENAI_API_KEY=your_openai_api_key_here
# OR
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional Configuration
AI_MODEL=openai/gpt-4o-mini
AI_PROVIDER=openrouter
OPENROUTER_SITE_URL=http://localhost:3001
OPENROUTER_APP_NAME=Nexus AI Assistant
```

## Installation & Setup

### Backend Setup

1. **Install Dependencies:**
   ```bash
   cd S9-b-end
   npm install
   ```

2. **Configure Environment:**
   - Copy `.env.example` to `.env`
   - Add your API keys and configuration

3. **Start Server:**
   ```bash
   npm start
   # or
   node index.js
   ```

4. **Test API:**
   ```bash
   node test-ai-assistant.js
   ```

### Frontend Setup

1. **Install Dependencies:**
   ```bash
   cd S9-f-end
   npm install
   ```

2. **Start Development Server:**
   ```bash
   npm run dev
   ```

3. **Access AI Assistant:**
   - Navigate to Customer Dashboard
   - Click on "Nexus AI Assistant" in the sidebar

## Usage

### For Users

1. **Access AI Assistant:**
   - Go to Customer Dashboard
   - Click "Nexus AI Assistant" in the sidebar

2. **Ask Questions:**
   - Type your question in the chat input
   - Click send or press Enter
   - Wait for AI response

3. **Use Quick Suggestions:**
   - Click on any suggestion card
   - Question will be automatically sent

4. **Clear Conversation:**
   - Click "Clear Conversation" button
   - Start fresh chat session

### For Developers

#### Frontend Service Usage

```javascript
import aiAssistantService from '../services/aiAssistantService';

// Send a message
const response = await aiAssistantService.sendMessage('Hello', conversationHistory);

// Get suggestions
const suggestions = await aiAssistantService.getSuggestions();

// Check status
const status = await aiAssistantService.checkStatus();
```

#### Backend Service Usage

```javascript
const aiService = new AIAssistantService();

// Generate response
const result = await aiService.generateResponse(message, conversationHistory);

// Get suggestions
const suggestions = await aiService.getQuickSuggestions();
```

## Customization

### AI Personality

Modify the system prompt in `S9-b-end/routes/ai-assistant.js`:

```javascript
const systemPrompt = `You are Nexus AI Assistant, a helpful AI assistant for a home services platform...`;
```

### UI Styling

Customize the appearance in `S9-f-end/src/pages/dashboards/AIAssistant.css`:

```css
.ai-assistant-header {
  background: linear-gradient(135deg, #your-color-1, #your-color-2);
}
```

### Quick Suggestions

Update suggestions in `S9-b-end/routes/ai-assistant.js`:

```javascript
async getQuickSuggestions() {
  return [
    "Your custom question 1",
    "Your custom question 2",
    // ...
  ];
}
```

## Troubleshooting

### Common Issues

1. **API Key Not Working:**
   - Verify API key is correct
   - Check API key has sufficient credits
   - Ensure environment variables are loaded

2. **No Response from AI:**
   - Check network connection
   - Verify backend server is running
   - Check browser console for errors

3. **Styling Issues:**
   - Ensure CSS file is imported
   - Check for CSS conflicts
   - Verify responsive breakpoints

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
```

## Security Considerations

- API keys are stored server-side only
- No sensitive data is sent to AI
- Rate limiting recommended for production
- Input validation and sanitization

## Performance

- Optimized for fast response times
- Efficient conversation history management
- Minimal memory usage
- Responsive design for all devices

## Future Enhancements

- [ ] Voice input/output
- [ ] Multi-language support
- [ ] File upload support
- [ ] Integration with booking system
- [ ] Analytics and insights
- [ ] Custom AI models

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Test with the provided test script
4. Check server logs for errors

---

**Note:** This AI Assistant is designed specifically for the Nexus home services platform and provides contextual help for service-related queries.
