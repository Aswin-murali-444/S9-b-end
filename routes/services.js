const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { recommendServicesForUser } = require('../services/mlService');

/**
 * Booking momentum per service: last 7 days vs previous 7 days (platform trend signal).
 */
function buildServiceTrendsFromRows(rows) {
  const trends = {};
  if (!Array.isArray(rows)) return trends;
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const recentStart = now - 7 * DAY;
  const priorStart = now - 14 * DAY;

  for (const b of rows) {
    if (!b?.service_id || !b?.created_at) continue;
    const sid = String(b.service_id);
    const ts = new Date(b.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    if (!trends[sid]) trends[sid] = { recent: 0, prior: 0 };
    if (ts >= recentStart) trends[sid].recent += 1;
    else if (ts >= priorStart && ts < recentStart) trends[sid].prior += 1;
  }
  return trends;
}

function fallbackInsight(serviceId, trends, popCount, maxPop) {
  const t = trends[String(serviceId)] || { recent: 0, prior: 0 };
  const mom = (t.recent + 0.5) / (t.prior + 0.5);
  const popNorm = maxPop > 0 ? popCount / maxPop : 0;
  if (t.recent >= 2 && mom >= 1.4) {
    return { insightKey: 'trending', insightLabel: 'Trending this week' };
  }
  if (t.recent >= 3) {
    return { insightKey: 'high_demand', insightLabel: 'High demand lately' };
  }
  if (mom >= 1.25 && t.recent >= 1) {
    return { insightKey: 'rising', insightLabel: 'Rising interest' };
  }
  if (popNorm >= 0.65) {
    return { insightKey: 'popular', insightLabel: 'Popular with customers' };
  }
  return { insightKey: 'popular', insightLabel: 'Popular right now' };
}

/**
 * When ML returns fewer than `targetCount` (e.g. small booking sample + many prefs excluded),
 * pad with next-best popular/catalog services so the dashboard always shows a full row.
 */
async function backfillRecommendationsEnriched(
  supabase,
  recommendations,
  targetCount,
  popularServices,
  excludeSet,
  serviceTrends,
  maxPop
) {
  const cap = Math.max(1, Number(targetCount) || 5);
  if (!Array.isArray(recommendations) || recommendations.length >= cap) return recommendations;

  const have = new Set(recommendations.map((r) => String(r.serviceId)));
  const sorted = [...(popularServices || [])].sort(
    (a, b) => (Number(b.count) || 0) - (Number(a.count) || 0)
  );
  const want = cap - recommendations.length;
  const idQueue = [];
  for (const p of sorted) {
    if (idQueue.length >= want) break;
    const sid = String(p.service_id);
    if (!sid || excludeSet.has(sid) || have.has(sid)) continue;
    have.add(sid);
    idQueue.push({ sid, count: Number(p.count) || 0 });
  }
  if (!idQueue.length) return recommendations;

  const { data: serviceRows } = await supabase
    .from('services')
    .select('id, name, description, icon_url, duration, price, offer_price, offer_enabled, category_id')
    .in(
      'id',
      idQueue.map((x) => x.sid)
    );

  const serviceById = {};
  (serviceRows || []).forEach((s) => {
    serviceById[String(s.id)] = s;
  });

  const extra = idQueue.map(({ sid, count }) => {
    const s = serviceById[sid] || {};
    const ins = fallbackInsight(sid, serviceTrends, count, maxPop);
    return {
      serviceId: sid,
      score: count > 0 ? count * 0.001 : 0.01,
      insightKey: ins.insightKey,
      insightLabel: ins.insightLabel,
      scoreComponents: null,
      name: s.name || '',
      description: s.description || '',
      icon_url: s.icon_url || null,
      duration: s.duration,
      price: s.price,
      offer_price: s.offer_price,
      offer_enabled: s.offer_enabled,
      category_id: s.category_id
    };
  });

  return [...recommendations, ...extra];
}

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
        service_type,
        active, 
        created_at, 
        updated_at,
        category_id,
        rating,
        review_count,
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
      service_category_id: service.category_id || service.service_categories?.id || null,
      category_name: service.service_categories?.name || 'Unknown'
    })) : [];

    res.json(formattedServices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Recommend services for a user (for dashboards / booking page)
router.get('/user/:userId/recommendations', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit || '5', 10);
    const currentServiceId = req.query.currentServiceId || req.query.current_service_id || null;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Resolve auth_user_id -> users.id so we can query bookings/customer_details correctly
    // (frontend might pass auth UID, while bookings.user_id is likely users.id).
    let resolvedUserId = userId;
    try {
      const { data: userRow, error: userRowErr } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (!userRowErr && userRow?.id) resolvedUserId = userRow.id;
    } catch (e) {
      // Non-blocking; we'll fall back to userId as-is.
      resolvedUserId = userId;
    }

    // Fetch this user's recent booking history
    const { data: userBookings, error: userErr } = await supabase
      .from('bookings')
      .select('id, user_id, service_id')
      .eq('user_id', resolvedUserId)
      .neq('booking_status', 'cancelled')
      .not('service_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (userErr) {
      console.error('Error fetching user bookings for recommendations:', userErr);
      return res.status(500).json({ error: 'Failed to fetch user bookings' });
    }

    let userHistory = (userBookings || [])
      .map((b) => b.service_id)
      .filter((sid) => !!sid);

    // Cold-start fallback: if the user has no booking history yet,
    // use onboarding preferences from customer_details.preferred_services.
    if (userHistory.length === 0) {
      const isUuid = (v) =>
        typeof v === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

      try {
        const { data: customerRow, error: customerErr } = await supabase
          .from('customer_details')
          .select('preferred_services')
          .eq('id', resolvedUserId)
          .maybeSingle();

        if (!customerErr && customerRow?.preferred_services) {
          const rawPrefs = Array.isArray(customerRow.preferred_services)
            ? customerRow.preferred_services
            : [];

          const prefStrings = rawPrefs.filter(Boolean).map((x) => String(x));
          if (prefStrings.length > 0) {
            const uuidPrefs = prefStrings.filter(isUuid);
            const namePrefs = prefStrings.filter((p) => !isUuid(p));

            // If preferences already look like service IDs, use them directly.
            if (uuidPrefs.length === prefStrings.length) {
              userHistory = uuidPrefs;
            } else if (namePrefs.length > 0) {
              // Map service names -> service IDs (best-effort for older/onboarding docs).
              const serviceRows = await supabase
                .from('services')
                .select('id, name')
                .in('name', namePrefs);

              const byName = {};
              (serviceRows || []).forEach((s) => {
                if (s?.name) byName[s.name] = s.id;
              });

              const mappedByName = namePrefs.map((n) => byName[n]).filter(Boolean);
              userHistory = [...new Set([...uuidPrefs, ...mappedByName])];
            } else {
              userHistory = uuidPrefs;
            }
          }
        }
      } catch (e) {
        // Non-blocking: ML will fall back to popularity if userHistory stays empty.
        console.warn('Cold-start preferred_services fallback failed:', e?.message || e);
      }
    }

    // Fetch a global sample of bookings to build co-occurrence and popularity
    const { data: globalBookings, error: globalErr } = await supabase
      .from('bookings')
      .select('user_id, service_id')
      .neq('booking_status', 'cancelled')
      .not('service_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1000);

    if (globalErr) {
      console.error('Error fetching global bookings for recommendations:', globalErr);
      return res.status(500).json({ error: 'Failed to fetch global bookings' });
    }

    const globalCooccurrence = {};
    const popularityCounts = {};
    const bookingsByUser = {};

    for (const b of globalBookings || []) {
      if (!b.user_id || !b.service_id) continue;
      const uid = String(b.user_id);
      if (!bookingsByUser[uid]) bookingsByUser[uid] = [];
      bookingsByUser[uid].push(String(b.service_id));
      popularityCounts[String(b.service_id)] = (popularityCounts[String(b.service_id)] || 0) + 1;
    }

    // Every catalog service must be a candidate for ML (not only IDs seen in the 1000-row sample).
    // Otherwise users with many preferred_services see almost nothing to recommend.
    try {
      const { data: catalogIds, error: catErr } = await supabase.from('services').select('id').limit(1000);
      if (!catErr && Array.isArray(catalogIds)) {
        for (const row of catalogIds) {
          if (row?.id == null) continue;
          const k = String(row.id);
          if (popularityCounts[k] === undefined) popularityCounts[k] = 0;
        }
      }
    } catch (e) {
      console.warn('Recommendation catalog merge skipped:', e?.message || e);
    }

    // Build co-occurrence matrix at user level (services that co-occur for same user)
    Object.values(bookingsByUser).forEach((serviceList) => {
      const uniqueServices = Array.from(new Set(serviceList));
      for (let i = 0; i < uniqueServices.length; i += 1) {
        for (let j = 0; j < uniqueServices.length; j += 1) {
          if (i === j) continue;
          const a = uniqueServices[i];
          const b = uniqueServices[j];
          if (!globalCooccurrence[a]) globalCooccurrence[a] = {};
          globalCooccurrence[a][b] = (globalCooccurrence[a][b] || 0) + 1;
        }
      }
    });

    const popularServices = Object.entries(popularityCounts)
      .sort(([, aCount], [, bCount]) => bCount - aCount)
      .map(([serviceId, count]) => ({ service_id: serviceId, count }));

    // Trend windows: last 14 days of bookings (for ML momentum: recent 7d vs prior 7d)
    let serviceTrends = {};
    try {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: trendRows, error: trendErr } = await supabase
        .from('bookings')
        .select('service_id, created_at')
        .neq('booking_status', 'cancelled')
        .not('service_id', 'is', null)
        .gte('created_at', fourteenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(8000);

      if (!trendErr && trendRows) {
        serviceTrends = buildServiceTrendsFromRows(trendRows);
      }
    } catch (e) {
      console.warn('Service trend aggregation skipped:', e?.message || e);
    }

    const maxPop = popularServices.length
      ? Math.max(...popularServices.map((p) => Number(p.count) || 0), 1)
      : 1;

    const payload = {
      user_id: resolvedUserId,
      current_service_id: currentServiceId,
      user_history: userHistory,
      global_cooccurrence: globalCooccurrence,
      popular_services: popularServices,
      service_trends: serviceTrends,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 5
    };

    const { data: mlData, error: mlError } = await recommendServicesForUser(payload);

    if (mlError || !mlData) {
      console.error('ML recommend-services failed, falling back to popularity:', mlError);
      // Simple popularity-based fallback excluding already used services
      const usedSet = new Set(userHistory.map(String));
      const fallback = popularServices
        .filter((p) => !usedSet.has(String(p.service_id)))
        .slice(0, payload.limit)
        .map((p) => ({
          service_id: p.service_id,
          score: p.count
        }));

      if (!fallback.length) {
        const paddedNone = await backfillRecommendationsEnriched(
          supabase,
          [],
          payload.limit,
          popularServices,
          usedSet,
          serviceTrends,
          maxPop
        );
        return res.json({
          userId,
          currentServiceId,
          recommendations: paddedNone,
          usedMlService: false,
          trendSignalAvailable: Object.keys(serviceTrends).length > 0
        });
      }

      const serviceIds = fallback.map((r) => r.service_id);
      const { data: serviceRows } = await supabase
        .from('services')
        .select('id, name, description, icon_url, duration, price, offer_price, offer_enabled, category_id')
        .in('id', serviceIds);

      const serviceById = {};
      (serviceRows || []).forEach((s) => {
        serviceById[s.id] = s;
      });

      const recommendations = fallback.map((r) => {
        const s = serviceById[r.service_id] || {};
        const ins = fallbackInsight(r.service_id, serviceTrends, Number(r.score) || 0, maxPop);
        return {
          serviceId: r.service_id,
          score: r.score,
          insightKey: ins.insightKey,
          insightLabel: ins.insightLabel,
          scoreComponents: null,
          name: s.name || '',
          description: s.description || '',
          icon_url: s.icon_url || null,
          duration: s.duration,
          price: s.price,
          offer_price: s.offer_price,
          offer_enabled: s.offer_enabled,
          category_id: s.category_id
        };
      });

      const excludeSet = new Set(userHistory.map(String));
      const padded = await backfillRecommendationsEnriched(
        supabase,
        recommendations,
        payload.limit,
        popularServices,
        excludeSet,
        serviceTrends,
        maxPop
      );

      return res.json({
        userId,
        currentServiceId,
        recommendations: padded,
        usedMlService: false,
        trendSignalAvailable: Object.keys(serviceTrends).length > 0
      });
    }

    const recommendedList = mlData.recommendations || [];
    const excludeSet = new Set(userHistory.map(String));

    if (!recommendedList.length) {
      const paddedEmpty = await backfillRecommendationsEnriched(
        supabase,
        [],
        payload.limit,
        popularServices,
        excludeSet,
        serviceTrends,
        maxPop
      );
      return res.json({
        userId,
        currentServiceId,
        recommendations: paddedEmpty,
        usedMlService: true,
        trendSignalAvailable: Object.keys(serviceTrends).length > 0
      });
    }

    const serviceIds = recommendedList.map((r) => r.service_id);
    const { data: serviceRows } = await supabase
      .from('services')
      .select('id, name, description, icon_url, duration, price, offer_price, offer_enabled, category_id')
      .in('id', serviceIds);

    const serviceById = {};
    (serviceRows || []).forEach((s) => {
      serviceById[s.id] = s;
    });

    let recommendations = recommendedList.map((r) => {
      const s = serviceById[r.service_id] || {};
      return {
        serviceId: r.service_id,
        score: r.score,
        insightKey: r.insight_key || null,
        insightLabel: r.insight_label || null,
        scoreComponents: r.components || null,
        name: s.name || '',
        description: s.description || '',
        icon_url: s.icon_url || null,
        duration: s.duration,
        price: s.price,
        offer_price: s.offer_price,
        offer_enabled: s.offer_enabled,
        category_id: s.category_id
      };
    });

    recommendations = await backfillRecommendationsEnriched(
      supabase,
      recommendations,
      payload.limit,
      popularServices,
      excludeSet,
      serviceTrends,
      maxPop
    );

    return res.json({
      userId,
      currentServiceId,
      recommendations,
      usedMlService: true,
      trendSignalAvailable: Object.keys(serviceTrends).length > 0
    });
  } catch (error) {
    console.error('Get service recommendations error:', error);
    return res.status(500).json({ error: 'Failed to get service recommendations' });
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
    const { categoryId, name, description, iconBase64, iconFileName, iconMimeType, duration, price, offerPrice, offerPercentage, offerEnabled, serviceType = 'individual', active = true } = req.body || {};
    
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
      service_type: serviceType && ['individual', 'group'].includes(serviceType) ? serviceType : 'individual',
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
        service_type,
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
        service_type,
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
    const { categoryId, name, description, iconBase64, iconFileName, iconMimeType, duration, price, offerPrice, offerPercentage, offerEnabled, serviceType, active } = req.body || {};
    
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
    if (typeof serviceType !== 'undefined') update.service_type = serviceType && ['individual', 'group'].includes(serviceType) ? serviceType : 'individual';
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
        service_type,
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
        service_type,
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
        service_type,
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
        service_type,
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
        service_type,
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
