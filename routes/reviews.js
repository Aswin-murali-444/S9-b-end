const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

// Create or update a service review from a customer
router.post('/service', async (req, res) => {
  try {
    const { serviceId, bookingId, rating, note, answers, authUserId } = req.body || {};

    if (!serviceId || !authUserId || typeof rating !== 'number') {
      return res.status(400).json({ error: 'serviceId, authUserId and numeric rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Map Supabase auth user ID to internal users.id
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    if (userError || !userRow) {
      console.error('Error resolving internal user ID for review:', userError);
      return res.status(400).json({ error: 'Unable to resolve user for review' });
    }

    const customerId = userRow.id;

    // Upsert review so a customer can update their review for a service
    const { data: reviewRow, error: reviewError } = await supabase
      .from('service_reviews')
      .upsert(
        {
          service_id: serviceId,
          booking_id: bookingId || null,
          customer_id: customerId,
          rating,
          note: note || null,
          answers: answers && Object.keys(answers || {}).length > 0 ? answers : null
        },
        {
          onConflict: 'service_id,customer_id'
        }
      )
      .select('*')
      .single();

    if (reviewError) {
      console.error('Error saving service review:', reviewError);
      return res.status(500).json({ error: 'Failed to save review' });
    }

    // Optionally mirror rating/feedback onto the booking record if provided
    if (bookingId) {
      await supabase
        .from('bookings')
        .update({
          customer_rating: rating,
          customer_feedback: note || null,
          feedback_submitted_at: new Date().toISOString()
        })
        .eq('id', bookingId);
    }

    // Recalculate aggregate rating for the service
    const { data: allReviews, count, error: aggError } = await supabase
      .from('service_reviews')
      .select('rating', { count: 'exact' })
      .eq('service_id', serviceId);

    if (!aggError && Array.isArray(allReviews) && (count || 0) > 0) {
      const total = allReviews.reduce((sum, r) => sum + (r.rating || 0), 0);
      const average = total / count;

      await supabase
        .from('services')
        .update({
          rating: Math.round(average * 10) / 10,
          review_count: count
        })
        .eq('id', serviceId);
    }

    return res.json({
      success: true,
      data: {
        review: reviewRow
      }
    });
  } catch (error) {
    console.error('Create service review error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit review' });
  }
});

// Get reviews for a specific service (visible to all customers)
router.get('/service/:serviceId', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 20;
    const from = (pageNum - 1) * pageSize;
    const to = from + pageSize - 1;

    if (!serviceId) {
      return res.status(400).json({ error: 'Service ID is required' });
    }

    const { data: rows, count, error } = await supabase
      .from('service_reviews')
      .select(`
        id,
        rating,
        note,
        created_at,
        customer_id,
        users:customer_id (
          user_profiles (
            first_name,
            last_name
          )
        )
      `, { count: 'exact' })
      .eq('service_id', serviceId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching service reviews:', error);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }

    const reviews = (rows || []).map(row => {
      const profileSource = row.users?.user_profiles;
      const userProfile = Array.isArray(profileSource) ? profileSource[0] : profileSource;
      const firstName = userProfile?.first_name || '';
      const lastName = userProfile?.last_name || '';
      const customerName = `${firstName} ${lastName}`.trim() || 'Anonymous';

      return {
        id: row.id,
        rating: row.rating,
        note: row.note,
        created_at: row.created_at,
        customer_name: customerName
      };
    });

    return res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total: count || 0,
          pages: Math.ceil((count || 0) / pageSize)
        }
      }
    });
  } catch (error) {
    console.error('Get service reviews error:', error);
    res.status(500).json({ error: error.message || 'Failed to get service reviews' });
  }
});

// Get reviews for a specific provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    // Get bookings with customer ratings for this provider
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        customer_rating,
        customer_feedback,
        feedback_submitted_at,
        created_at,
        user_id,
        service_id,
        services:service_id(
          name
        ),
        users:user_id(
          id,
          user_profiles(
            first_name,
            last_name
          )
        )
      `)
      .eq('assigned_provider_id', providerId)
      .not('customer_rating', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) {
      console.error('Error fetching provider reviews:', error);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_provider_id', providerId)
      .not('customer_rating', 'is', null);

    // Format reviews
    const reviews = (bookings || []).map(booking => {
      // Handle user_profiles - could be array or single object
      const userProfile = Array.isArray(booking.users?.user_profiles) 
        ? booking.users.user_profiles[0] 
        : booking.users?.user_profiles;
      
      const firstName = userProfile?.first_name || '';
      const lastName = userProfile?.last_name || '';
      const customerName = `${firstName} ${lastName}`.trim() || 'Anonymous';
      
      // Handle services - could be array or single object
      const service = Array.isArray(booking.services) 
        ? booking.services[0] 
        : booking.services;
      
      return {
        id: booking.id,
        customer_name: customerName,
        rating: booking.customer_rating,
        comment: booking.customer_feedback || null,
        created_at: booking.feedback_submitted_at || booking.created_at,
        service_name: service?.name || 'Service',
        booking_id: booking.id
      };
    });

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get provider reviews error:', error);
    res.status(500).json({ error: error.message || 'Failed to get provider reviews' });
  }
});

// Get rating statistics for a provider
router.get('/provider/:providerId/stats', async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    // Get all bookings with ratings for this provider
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('customer_rating')
      .eq('assigned_provider_id', providerId)
      .not('customer_rating', 'is', null);

    if (error) {
      console.error('Error fetching provider rating stats:', error);
      return res.status(500).json({ error: 'Failed to fetch rating statistics' });
    }

    const reviews = bookings || [];
    const totalReviews = reviews.length;

    if (totalReviews === 0) {
      return res.json({
        success: true,
        data: {
          average_rating: 0,
          total_reviews: 0,
          rating_breakdown: {
            5: 0,
            4: 0,
            3: 0,
            2: 0,
            1: 0
          }
        }
      });
    }

    // Calculate average rating
    const sum = reviews.reduce((acc, booking) => acc + booking.customer_rating, 0);
    const averageRating = sum / totalReviews;

    // Calculate rating breakdown
    const ratingBreakdown = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    };

    reviews.forEach(booking => {
      const rating = booking.customer_rating;
      if (rating >= 1 && rating <= 5) {
        ratingBreakdown[rating] = (ratingBreakdown[rating] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        average_rating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
        total_reviews: totalReviews,
        rating_breakdown: ratingBreakdown
      }
    });

  } catch (error) {
    console.error('Get provider rating stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to get provider rating statistics' });
  }
});

module.exports = router;
