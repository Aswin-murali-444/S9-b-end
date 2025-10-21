const express = require('express');
const multer = require('multer');
const AadhaarService = require('../services/aadhaarService');

const router = express.Router();
const aadhaarService = new AadhaarService();

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Extract from single side (front or back)
router.post('/extract', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image provided'
      });
    }

    const { side = 'front' } = req.body;
    const result = await aadhaarService.extractAadhaarDetails(
      req.file.buffer,
      side,
      req.file.originalname
    );

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

// Extract from both sides simultaneously
router.post('/extract-both', upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files?.front?.[0] || !req.files?.back?.[0]) {
      return res.status(400).json({
        success: false,
        error: 'Both front and back images are required'
      });
    }

    const result = await aadhaarService.extractAadhaarFromBoth(
      req.files.front[0].buffer,
      req.files.back[0].buffer
    );

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

module.exports = router;
