const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

// List services with category information
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message || 'Failed to fetch services' });

    // Format the response to include category name
    const formattedServices = Array.isArray(data) ? data.map(service => ({
      ...service,
      category_name: service.service_categories?.name || 'Unknown',
      category: service.service_categories?.id || null
    })) : [];

    res.json(formattedServices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check service name availability
router.post('/check-name', async (req, res) => {
  try {
    const { name, categoryId, excludeId } = req.body || {};
    
    if (!name || !categoryId) {
      return res.status(400).json({ error: 'Name and category ID are required' });
    }

    const normalizedName = String(name).trim();
    
    // Check if service name exists in the same category
    let query = supabase
      .from('services')
      .select('id, name')
      .eq('category_id', categoryId)
      .ilike('name', normalizedName);
    
    // Exclude current service when editing
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data: existingService, error } = await query.single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      return res.status(500).json({ error: 'Database error' });
    }
    
    const isAvailable = !existingService;
    
    res.json({ 
      available: isAvailable,
      message: isAvailable ? 'Service name is available' : 'Service name already exists in this category'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create service
router.post('/', async (req, res) => {
  try {
    const { categoryId, name, description, iconBase64, iconFileName, iconMimeType, duration, price, offerPrice, offerPercentage, offerEnabled, active = true } = req.body || {};
    
    console.log('Received service data:', { categoryId, name, duration, price, offerPrice, offerPercentage, offerEnabled });
    
    if (!categoryId || !name || !String(name).trim()) {
      return res.status(400).json({ error: 'Category ID and service name are required' });
    }

    const normalizedName = String(name).trim();
    
    // Check if category exists
    const { data: categoryData, error: categoryError } = await supabase
      .from('service_categories')
      .select('id, name')
      .eq('id', categoryId)
      .single();
    
    if (categoryError || !categoryData) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }

    // Check for duplicate service name within category
    const { data: existingService, error: duplicateError } = await supabase
      .from('services')
      .select('id')
      .eq('category_id', categoryId)
      .ilike('name', normalizedName)
      .single();
    
    if (existingService) {
      return res.status(409).json({ error: 'Service name already exists in this category' });
    }

    // Handle icon upload to Supabase Storage
    let iconUrl = null;
    if (iconBase64 && iconFileName && iconMimeType) {
      try {
        const bucket = 'service_images';
        const ext = (String(iconFileName).split('.').pop() || 'png').toLowerCase();
        const nameSlug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 40) || 'service';
        const objectKey = `${nameSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const buffer = Buffer.from(iconBase64, 'base64');
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectKey, buffer, { 
            contentType: iconMimeType, 
            upsert: true, 
            cacheControl: '3600' 
          });

        if (uploadError) {
          console.error('Service icon upload failed:', uploadError);
          return res.status(500).json({ error: uploadError.message || 'Failed to upload service icon' });
        }

        const { data: publicData } = supabase.storage
          .from(bucket)
          .getPublicUrl(objectKey);
        iconUrl = publicData?.publicUrl || null;
      } catch (uploadErr) {
        console.error('Icon upload error:', uploadErr);
        return res.status(500).json({ error: 'Failed to process icon upload' });
      }
    }

    const payload = {
      category_id: categoryId,
      name: normalizedName,
      description: description || null,
      icon_url: iconUrl,
      duration: duration || null,
      price: price ? parseFloat(price) : null,
      offer_price: offerPrice ? parseFloat(offerPrice) : null,
      offer_percentage: offerPercentage ? parseFloat(offerPercentage) : null,
      offer_enabled: Boolean(offerEnabled),
      active: Boolean(active)
    };
    
    console.log('Creating service with payload:', payload);

    const { data, error } = await supabase
      .from('services')
      .insert(payload)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    console.log('Database insert result:', { data, error });
    
    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('duplicate') || message.includes('unique')) {
        return res.status(409).json({ error: 'Service name already exists in this category' });
      }
      if (error.code === '42501') {
        return res.status(403).json({ error: 'Permission denied. Check RLS policies or use service role key.' });
      }
      return res.status(500).json({ error: message || 'Failed to create service' });
    }

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.status(201).json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single service
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update service
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, description, iconBase64, iconFileName, iconMimeType, duration, price, offerPrice, offerPercentage, offerEnabled, active } = req.body || {};
    
    const update = {};
    
    if (typeof categoryId === 'string' && categoryId.trim()) {
      // Verify category exists
      const { data: categoryData, error: categoryError } = await supabase
        .from('service_categories')
        .select('id')
        .eq('id', categoryId)
        .single();
      
      if (categoryError || !categoryData) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }
      update.category_id = categoryId;
    }
    
    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: 'Service name cannot be empty' });
      update.name = trimmed;
    }
    
    if (typeof description !== 'undefined') update.description = description;
    if (typeof duration !== 'undefined') update.duration = duration;
    if (typeof price !== 'undefined') update.price = price ? parseFloat(price) : null;
    if (typeof offerPrice !== 'undefined') update.offer_price = offerPrice ? parseFloat(offerPrice) : null;
    if (typeof offerPercentage !== 'undefined') update.offer_percentage = offerPercentage ? parseFloat(offerPercentage) : null;
    if (typeof offerEnabled !== 'undefined') update.offer_enabled = Boolean(offerEnabled);
    if (typeof active !== 'undefined') update.active = Boolean(active);
    
    // Handle icon upload to Supabase Storage
    if (iconBase64 && iconFileName && iconMimeType) {
      try {
        const bucket = 'service_images';
        const ext = (String(iconFileName).split('.').pop() || 'png').toLowerCase();
        const nameSlug = (update.name || 'service').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 40) || 'service';
        const objectKey = `${nameSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const buffer = Buffer.from(iconBase64, 'base64');
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectKey, buffer, { 
            contentType: iconMimeType, 
            upsert: true, 
            cacheControl: '3600' 
          });

        if (uploadError) {
          console.error('Service icon upload failed:', uploadError);
          return res.status(500).json({ error: uploadError.message || 'Failed to upload service icon' });
        }

        const { data: publicData } = supabase.storage
          .from(bucket)
          .getPublicUrl(objectKey);
        update.icon_url = publicData?.publicUrl || null;
      } catch (uploadErr) {
        console.error('Icon upload error:', uploadErr);
        return res.status(500).json({ error: 'Failed to process icon upload' });
      }
    }
    
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No fields to update' });
    
    const { data, error } = await supabase
      .from('services')
      .update(update)
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block / Suspend service
router.patch('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: false })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unblock / Activate service
router.patch('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: true })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallbacks for environments without PATCH
router.post('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: false })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: true })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete service
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
