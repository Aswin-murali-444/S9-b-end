const express = require('express');
const multer = require('multer');

const app = express();
const PORT = 3002; // Use different port to avoid conflicts

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Test route
app.get('/test', (req, res) => {
  res.json({ message: 'Test server is working' });
});

// Simple Aadhaar test route
app.post('/api/aadhaar/test', upload.single('image'), (req, res) => {
  console.log('Test route hit!');
  console.log('File received:', req.file ? 'YES' : 'NO');
  console.log('Body:', req.body);
  
  res.json({
    success: true,
    message: 'Test route working',
    fileReceived: !!req.file,
    body: req.body
  });
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log('Test with: POST http://localhost:3002/api/aadhaar/test');
});
