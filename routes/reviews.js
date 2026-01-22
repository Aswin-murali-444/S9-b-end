const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

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
