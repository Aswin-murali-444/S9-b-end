const express = require('express');
const router = express.Router();
const UserService = require('../services/userService');
const { supabase } = require('../lib/supabase');

const userService = new UserService();

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload profile picture
router.post('/profile-picture-upload', async (req, res) => {
  try {
    const { fileName, fileType, base64, userId } = req.body || {};
    if (!fileName || !fileType || !base64) {
      return res.status(400).json({ error: 'fileName, fileType, base64 are required' });
    }
    if (!String(fileType).toLowerCase().startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed' });
    }
    const bucket = 'profile-pictures';
    const ext = (String(fileName).split('.').pop() || 'png').toLowerCase();
    const safeUser = (String(userId || '').trim() || 'anonymous')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || 'anonymous';
    const objectKey = `${safeUser}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: bucketInfo, error: getBucketError } = await supabase.storage.getBucket(bucket);
        if (getBucketError || !bucketInfo) {
          await supabase.storage.createBucket(bucket, { public: true });
        }
        await supabase.storage.updateBucket(bucket, { public: true });
      } catch (ensureError) {
        console.warn('⚠️ Could not ensure profile-pictures bucket exists/public:', ensureError?.message || ensureError);
      }
    }

    const buffer = Buffer.from(base64, 'base64');
    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectKey, buffer, { contentType: fileType, upsert: true, cacheControl: '3600' });
    if (uploadError) {
      const msg = (uploadError.message || '').toLowerCase();
      if (msg.includes('row-level security') || msg.includes('violates row-level security') || uploadError.statusCode === 401 || uploadError.statusCode === 403) {
        return res.status(403).json({ error: 'Permission denied by storage policies. Ensure service role key is configured and bucket policies allow upload.' });
      }
      return res.status(500).json({ error: uploadError.message || 'Upload failed' });
    }
    let publicUrl = null;
    try {
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectKey);
      publicUrl = publicData?.publicUrl || null;
    } catch (_) {}
    return res.json({ path: `${bucket}/${objectKey}`, publicUrl });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('row-level security') || message.includes('violates row-level security')) {
      return res.status(403).json({ error: 'Permission denied by storage policies. Configure RLS or use service role key.' });
    }
    res.status(500).json({ error: error.message || 'Upload error' });
  }
});

module.exports = router;


