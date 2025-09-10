const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

// List categories
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('service_categories')
      .select('id, name, description, icon_url, settings, active, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message || 'Failed to fetch categories' });

    // Resolve icon URLs server-side for robustness
    const resolved = Array.isArray(data) ? data.map((cat) => {
      try {
        let icon = cat.icon_url || '';
        if (icon && !/^https?:\/\//i.test(icon)) {
          const m = String(icon).match(/^([^\/]+)\/(.+)$/);
          if (m) {
            const bucket = m[1];
            const key = m[2];
            try {
              const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
              if (pub?.publicUrl) icon = pub.publicUrl;
            } catch (_) {}
          }
        }
        return { ...cat, icon_url: icon };
      } catch (_) {
        return cat;
      }
    }) : [];

    res.json(resolved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', async (req, res) => {
  try {
    const { name, description, active = true, iconUrl = null, settings = null, status } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    const normalizedName = String(name).trim();
    if (/\d/.test(normalizedName)) {
      return res.status(400).json({ error: 'Numbers are not allowed in category name' });
    }
    const allowedStatuses = ['active', 'inactive', 'suspended'];
    let normalizedStatus = undefined;
    if (typeof status === 'string') {
      const s = status.toLowerCase().trim();
      if (!allowedStatuses.includes(s)) {
        return res.status(400).json({ error: 'Invalid status. Must be one of: active, inactive, suspended' });
      }
      normalizedStatus = s;
    }
    const payload = {
      name: normalizedName,
      description: description ?? null,
      active: Boolean(active),
      icon_url: iconUrl ?? null,
      settings: settings ?? null,
      ...(normalizedStatus ? { status: normalizedStatus } : {})
    };
    const { data, error } = await supabase
      .from('service_categories')
      .insert(payload)
      .select()
      .single();
    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('duplicate') || message.includes('unique')) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      if (error.code === '42501') {
        return res.status(403).json({ error: 'Permission denied. Check RLS policies or use service role key.' });
      }
      return res.status(500).json({ error: message || 'Failed to create category' });
    }
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload category icon
router.post('/icon-upload', async (req, res) => {
  try {
    const { fileName, fileType, base64 } = req.body || {};
    if (!fileName || !fileType || !base64) {
      return res.status(400).json({ error: 'fileName, fileType, base64 are required' });
    }
    if (!String(fileType).toLowerCase().startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed' });
    }
    const bucket = 'category_image';
    const ext = (String(fileName).split('.').pop() || 'png').toLowerCase();
    const nameNoExt = String(fileName).replace(/\.[^/.]+$/, '');
    const nameSlug = nameNoExt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 40) || 'category';
    const objectKey = `${nameSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: bucketInfo, error: getBucketError } = await supabase.storage.getBucket(bucket);
        if (getBucketError || !bucketInfo) {
          await supabase.storage.createBucket(bucket, { public: true });
        }
        await supabase.storage.updateBucket(bucket, { public: true });
      } catch (ensureError) {
        console.warn('⚠️ Could not ensure bucket exists/public:', ensureError?.message || ensureError);
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

// Get single category
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('service_categories')
      .select('id, name, description, icon_url, settings, active, created_at, updated_at')
      .eq('id', id)
      .single();
    if (error) return res.status(404).json({ error: 'Category not found' });
    let icon = data?.icon_url || '';
    if (icon && !/^https?:\/\//i.test(icon)) {
      const m = String(icon).match(/^([^\/]+)\/(.+)$/);
      if (m) {
        const bucket = m[1];
        const key = m[2];
        try {
          const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
          if (pub?.publicUrl) icon = pub.publicUrl;
        } catch (_) {}
      }
    }
    res.json({ ...data, icon_url: icon });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, active, iconUrl, settings, status } = req.body || {};
    const update = {};
    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: 'Category name cannot be empty' });
      if (/\d/.test(trimmed)) return res.status(400).json({ error: 'Numbers are not allowed in category name' });
      update.name = trimmed;
    }
    if (typeof description !== 'undefined') update.description = description;
    if (typeof active !== 'undefined') update.active = Boolean(active);
    if (typeof iconUrl !== 'undefined') update.icon_url = iconUrl;
    if (typeof settings !== 'undefined') update.settings = settings;
    if (typeof status === 'string') {
      const s = status.toLowerCase().trim();
      const allowed = ['active', 'inactive', 'suspended'];
      if (!allowed.includes(s)) return res.status(400).json({ error: 'Invalid status' });
      update.status = s;
    }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No fields to update' });
    const { data, error } = await supabase
      .from('service_categories')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Category not found' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block / Unblock
router.patch('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('service_categories')
      .update({ active: false, status: 'suspended' })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Category not found' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('service_categories')
      .update({ active: true, status: 'active' })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Category not found' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallbacks for environments without PATCH
router.post('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('service_categories')
      .update({ active: false, status: 'suspended' })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Category not found' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('service_categories')
      .update({ active: true, status: 'active' })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Category not found' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('service_categories').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


