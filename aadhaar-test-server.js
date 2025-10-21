const express = require('express');
const multer = require('multer');
const AadhaarService = require('./services/aadhaarService');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = 3003; // Use port 3003 to avoid conflicts

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const aadhaarService = new AadhaarService();

// Test route
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Aadhaar test server is working',
    timestamp: new Date().toISOString(),
    environment: {
      apiKey: process.env.AADHAAR_API_KEY ? 'SET' : 'NOT SET',
      provider: process.env.AADHAAR_API_PROVIDER || 'NOT SET',
      model: process.env.OPENROUTER_MODEL || 'NOT SET'
    }
  });
});

// Aadhaar extraction route
app.post('/api/aadhaar/extract', upload.single('image'), async (req, res) => {
  try {
    console.log('=== AADHAAR EXTRACTION REQUEST ===');
    console.log('File received:', req.file ? 'YES' : 'NO');
    console.log('Side:', req.body.side);
    console.log('File size:', req.file ? req.file.size : 'N/A');
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image provided'
      });
    }

    const { side = 'front' } = req.body;
    
    console.log('Starting extraction...');
    const result = await aadhaarService.extractAadhaarDetails(
      req.file.buffer,
      side,
      req.file.originalname
    );

    console.log('Extraction successful:', result);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Aadhaar extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Both sides extraction route
app.post('/api/aadhaar/extract-both', upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('=== AADHAAR BOTH SIDES EXTRACTION REQUEST ===');
    console.log('Front file:', req.files?.front?.[0] ? 'YES' : 'NO');
    console.log('Back file:', req.files?.back?.[0] ? 'YES' : 'NO');
    
    if (!req.files?.front?.[0] || !req.files?.back?.[0]) {
      return res.status(400).json({
        success: false,
        error: 'Both front and back images are required'
      });
    }

    console.log('Starting both sides extraction...');
    const result = await aadhaarService.extractAadhaarFromBoth(
      req.files.front[0].buffer,
      req.files.back[0].buffer
    );

    console.log('Both sides extraction successful:', result);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Aadhaar both sides extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🔧 Aadhaar Test Server running on port ${PORT}`);
  console.log(`📡 Test endpoint: http://localhost:${PORT}/test`);
  console.log(`🪪 Aadhaar extract: http://localhost:${PORT}/api/aadhaar/extract`);
  console.log(`🪪 Aadhaar both: http://localhost:${PORT}/api/aadhaar/extract-both`);
  console.log('');
  console.log('Environment check:');
  console.log('AADHAAR_API_KEY:', process.env.AADHAAR_API_KEY ? '✅ SET' : '❌ NOT SET');
  console.log('AADHAAR_API_PROVIDER:', process.env.AADHAAR_API_PROVIDER || '❌ NOT SET');
  console.log('OPENROUTER_MODEL:', process.env.OPENROUTER_MODEL || '❌ NOT SET');
  console.log('');
  console.log('To test:');
  console.log('1. Upload an Aadhaar image to the frontend');
  console.log('2. Check this console for detailed logs');
  console.log('3. Check browser console for any errors');
});
