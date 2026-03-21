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
    const msg = error.response?.data?.error?.message || error.message;
    const status = error.response?.status;
    // 402 = Insufficient credits – treat as soft failure and allow manual entry
      if (
        status === 402 ||
        msg?.includes('Insufficient credits') ||
        String(msg).includes('402')
      ) {
      return res.status(200).json({
        success: true,
        data: {
          aadhaar_number: '',
          name: '',
          dob: '',
          gender: '',
          address: '',
          pincode: ''
        },
        warning: 'Aadhaar extraction skipped: OpenRouter account has no credits. Please fill details manually.'
      });
    }

      // Groq vision can return 400 "invalid image data" for some formats/encodings.
      // Treat it as a soft failure so the user can enter details manually.
      if (status === 400 && msg?.includes('invalid image data')) {
        return res.status(200).json({
          success: true,
          data: {
            aadhaar_number: '',
            name: '',
            dob: '',
            gender: '',
            address: '',
            pincode: ''
          },
          warning: 'Aadhaar extraction skipped: image could not be processed. Please fill details manually.'
        });
      }
    res.status(status && status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: msg
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
    const status = error.response?.status;
    const msg = error.response?.data?.error?.message || error.message;
    if (
      status === 402 ||
      msg?.includes('Insufficient credits') ||
      String(msg).includes('402')
    ) {
      return res.status(200).json({
        success: true,
        data: {
          aadhaar_number: '',
          name: '',
          dob: '',
          gender: '',
          address: '',
          pincode: ''
        },
        warning: 'Aadhaar extraction skipped: OpenRouter account has no credits. Please fill details manually.'
      });
    }

    if (status === 400 && msg?.includes('invalid image data')) {
      return res.status(200).json({
        success: true,
        data: {
          aadhaar_number: '',
          name: '',
          dob: '',
          gender: '',
          address: '',
          pincode: ''
        },
        warning: 'Aadhaar extraction skipped: image could not be processed. Please fill details manually.'
      });
    }
    res.status(status && status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: msg
    });
  }
});

module.exports = router;
