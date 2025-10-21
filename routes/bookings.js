const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// Create a new booking
router.post('/', async (req, res) => {
  try {
    const booking = req.body || {};

    // Basic required fields validation
    const required = ['user_id', 'service_id', 'scheduled_date', 'scheduled_time', 'service_address', 'contact_phone', 'base_price', 'total_amount', 'payment_method'];
    for (const f of required) {
      if (booking[f] === undefined || booking[f] === null || booking[f] === '') {
        return res.status(400).json({ error: `Missing field: ${f}`, field: f });
      }
    }

    // If category_id not provided, derive it from service
    if (!booking.category_id) {
      const { data: svc, error: svcErr } = await supabase
        .from('services')
        .select('id, category_id')
        .eq('id', booking.service_id)
        .single();
      if (svcErr || !svc) {
        return res.status(400).json({ error: 'Invalid service. Unable to determine category.', field: 'service_id' });
      }
      booking.category_id = svc.category_id;
    }

    // Insert booking with pending payment/status if not provided
    if (!booking.payment_status) booking.payment_status = 'pending';
    if (!booking.booking_status) booking.booking_status = 'pending';

    const { data, error } = await supabase
      .from('bookings')
      .insert(booking)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ booking: data });
  } catch (error) {
    console.error('Create booking error:', error);
    return res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get bookings for a specific service provider (ASSIGNED BOOKINGS)
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    // Build query to get bookings assigned to this provider
    let query = supabase
      .from('bookings')
      .select(`
        id,
        booking_status,
        payment_status,
        scheduled_date,
        scheduled_time,
        service_address,
        service_city,
        service_state,
        contact_phone,
        contact_email,
        special_instructions,
        additional_requirements,
        base_price,
        total_amount,
        payment_method,
        created_at,
        confirmed_at,
        started_at,
        completed_at,
        customer_rating,
        customer_feedback,
        provider_rating,
        provider_feedback,
        user_id,
        service_id,
        category_id,
        assigned_provider_id,
        provider_assigned_at,
        provider_confirmed_at,
        priority_level,
        internal_status
      `)
      .eq('assigned_provider_id', providerId)
      .eq('internal_status', 'active')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .range(offset, offset + limit - 1);

    // Filter by status if provided
    if (status && status !== 'all') {
      query = query.eq('booking_status', status);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error('Error fetching provider bookings:', error);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // Fetch related data separately
    const transformedBookings = await Promise.all((bookings || []).map(async (booking) => {
      // Fetch user data
      let userData = null;
      if (booking.user_id) {
        const { data: user } = await supabase
          .from('users')
          .select('id, email, full_name, phone')
          .eq('id', booking.user_id)
          .single();
        userData = user;
      }

      // Fetch service data
      let serviceData = null;
      if (booking.service_id) {
        const { data: service } = await supabase
          .from('services')
          .select('id, name, description, price, duration')
          .eq('id', booking.service_id)
          .single();
        serviceData = service;
      }

      // Fetch category data
      let categoryData = null;
      if (booking.category_id) {
        const { data: category } = await supabase
          .from('service_categories')
          .select('id, name, description')
          .eq('id', booking.category_id)
          .single();
        categoryData = category;
      }

      return {
        id: booking.id,
        customerName: userData?.full_name || userData?.email || 'Unknown Customer',
        serviceType: serviceData?.name || 'Unknown Service',
        address: booking.service_address || 'Address not provided',
        scheduledDate: booking.scheduled_date,
        scheduledTime: booking.scheduled_time,
        description: serviceData?.description || '',
        specialInstructions: booking.special_instructions || '',
        status: booking.booking_status,
        amount: parseFloat(booking.total_amount) || 0,
        customerPhone: booking.contact_phone || userData?.phone || '',
        customerEmail: booking.contact_email || userData?.email || '',
        attachments: [],
        progressNotes: [],
        completionPhotos: [],
        categoryName: categoryData?.name || '',
        serviceName: serviceData?.name || '',
        paymentStatus: booking.payment_status,
        paymentMethod: booking.payment_method,
        createdAt: booking.created_at,
        confirmedAt: booking.confirmed_at,
        startedAt: booking.started_at,
        completedAt: booking.completed_at,
        customerRating: booking.customer_rating,
        customerFeedback: booking.customer_feedback,
        providerRating: booking.provider_rating,
        providerFeedback: booking.provider_feedback,
        priorityLevel: booking.priority_level,
        isAssigned: true,
        matchReason: 'assigned'
      };
    }));

    return res.json({ 
      bookings: transformedBookings,
      total: transformedBookings.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      message: `Showing ${transformedBookings.length} assigned bookings`
    });

  } catch (error) {
    console.error('Get provider bookings error:', error);
    return res.status(500).json({ error: 'Failed to fetch provider bookings' });
  }
});

// Get bookings matching service provider's specialization (AVAILABLE JOBS)
router.get('/matching/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    // Get provider's specialization details from service_provider_details
    const { data: providerDetails, error: providerError } = await supabase
      .from('service_provider_details')
      .select(`
        id,
        specialization,
        service_category_id,
        service_id,
        status
      `)
      .eq('id', providerId)
      .single();

    if (providerError || !providerDetails) {
      console.error('Provider details error:', providerError);
      return res.status(404).json({ error: 'Provider not found or no specialization details' });
    }

    console.log('Provider details found:', providerDetails);

    // Get all bookings first, then filter in JavaScript
    const { data: allBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_status,
        payment_status,
        scheduled_date,
        scheduled_time,
        service_address,
        service_city,
        service_state,
        contact_phone,
        contact_email,
        special_instructions,
        additional_requirements,
        base_price,
        total_amount,
        payment_method,
        created_at,
        user_id,
        service_id,
        category_id,
        assigned_provider_id,
        priority_level,
        internal_status
      `)
      .eq('internal_status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    console.log(`Found ${allBookings?.length || 0} total bookings`);

    // Filter bookings based on provider specialization - ONLY show exact matches
    const matchingBookings = (allBookings || []).filter(booking => {
      // Bookings assigned to this provider
      if (booking.assigned_provider_id === providerId) {
        return true;
      }
      
      // ONLY show bookings that match the provider's SPECIFIC service (not category)
      if (providerDetails.service_id && 
          booking.service_id === providerDetails.service_id && 
          !booking.assigned_provider_id) {
        return true;
      }
      
      // If no specific service is set, then show category matches as fallback
      if (!providerDetails.service_id && 
          providerDetails.service_category_id && 
          booking.category_id === providerDetails.service_category_id && 
          !booking.assigned_provider_id) {
        return true;
      }
      
      return false;
    });

    console.log(`Found ${matchingBookings.length} matching bookings`);

    // Apply pagination
    const paginatedBookings = matchingBookings.slice(offset, offset + parseInt(limit));

    // Transform the data with separate queries
    const transformedBookings = await Promise.all(paginatedBookings.map(async (booking) => {
      // Fetch user data
      let userData = null;
      if (booking.user_id) {
        const { data: user } = await supabase
          .from('users')
          .select('id, email, full_name, phone')
          .eq('id', booking.user_id)
          .single();
        userData = user;
      }

      // Fetch service data
      let serviceData = null;
      if (booking.service_id) {
        const { data: service } = await supabase
          .from('services')
          .select('id, name, description, price, duration')
          .eq('id', booking.service_id)
          .single();
        serviceData = service;
      }

      // Fetch category data
      let categoryData = null;
      if (booking.category_id) {
        const { data: category } = await supabase
          .from('service_categories')
          .select('id, name, description')
          .eq('id', booking.category_id)
          .single();
        categoryData = category;
      }

      const isAssigned = booking.assigned_provider_id === providerId;
      let matchReason = '';
      
      if (isAssigned) {
        matchReason = 'assigned';
      } else if (booking.service_id === providerDetails.service_id) {
        matchReason = 'exact_service_match';
      } else if (!providerDetails.service_id && booking.category_id === providerDetails.service_category_id) {
        matchReason = 'category_match';
      } else {
        matchReason = 'general_match';
      }

      return {
        id: booking.id,
        customerName: userData?.full_name || userData?.email || 'Unknown Customer',
        serviceType: serviceData?.name || 'Unknown Service',
        address: booking.service_address || 'Address not provided',
        scheduledDate: booking.scheduled_date,
        scheduledTime: booking.scheduled_time,
        description: serviceData?.description || '',
        specialInstructions: booking.special_instructions || '',
        status: booking.booking_status,
        amount: parseFloat(booking.total_amount) || 0,
        customerPhone: booking.contact_phone || userData?.phone || '',
        customerEmail: booking.contact_email || userData?.email || '',
        attachments: [],
        progressNotes: [],
        completionPhotos: [],
        categoryName: categoryData?.name || '',
        serviceName: serviceData?.name || '',
        paymentStatus: booking.payment_status,
        paymentMethod: booking.payment_method,
        createdAt: booking.created_at,
        priorityLevel: booking.priority_level,
        isAssigned: isAssigned,
        matchReason: matchReason,
        canAccept: !isAssigned && booking.booking_status === 'pending'
      };
    }));

    return res.json({ 
      bookings: transformedBookings,
      providerSpecialization: {
        categoryName: providerDetails.service_category_id ? 'Category matched' : '',
        serviceName: providerDetails.service_id ? 'Service matched' : '',
        specialization: providerDetails.specialization || '',
        status: providerDetails.status
      },
      total: matchingBookings.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      message: providerDetails.service_id ? 
        `Found ${matchingBookings.length} jobs matching your exact specialization: ${providerDetails.specialization}` :
        `Found ${matchingBookings.length} jobs matching your category (no specific service set)`
    });

  } catch (error) {
    console.error('Get matching bookings error:', error);
    return res.status(500).json({ error: 'Failed to fetch matching bookings' });
  }
});

// Assign a booking to a service provider
router.put('/:bookingId/assign', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { providerId } = req.body;

    if (!bookingId || !providerId) {
      return res.status(400).json({ error: 'Booking ID and Provider ID are required' });
    }

    // Check if booking exists and is available for assignment
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_status, assigned_provider_id, internal_status')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.internal_status !== 'active') {
      return res.status(400).json({ error: 'Booking is not active' });
    }

    if (booking.assigned_provider_id) {
      return res.status(400).json({ error: 'Booking is already assigned to another provider' });
    }

    if (booking.booking_status !== 'pending') {
      return res.status(400).json({ error: 'Only pending bookings can be assigned' });
    }

    // Assign the booking to the provider
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({
        assigned_provider_id: providerId,
        provider_assigned_at: new Date().toISOString(),
        booking_status: 'assigned',
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      console.error('Error assigning booking:', updateError);
      return res.status(500).json({ error: 'Failed to assign booking' });
    }

    return res.json({ 
      message: 'Booking assigned successfully',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Assign booking error:', error);
    return res.status(500).json({ error: 'Failed to assign booking' });
  }
});

// Update booking status (for service provider actions)
router.put('/:bookingId/status', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, notes } = req.body;

    if (!bookingId || !status) {
      return res.status(400).json({ error: 'Booking ID and status are required' });
    }

    const validStatuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    const updateData = { booking_status: status };
    
    // Set timestamp based on status
    switch (status) {
      case 'confirmed':
        updateData.confirmed_at = new Date().toISOString();
        break;
      case 'in_progress':
        updateData.started_at = new Date().toISOString();
        break;
      case 'completed':
        updateData.completed_at = new Date().toISOString();
        break;
    }

    if (notes) {
      updateData.admin_notes = notes;
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single();

    if (error) {
      console.error('Error updating booking status:', error);
      return res.status(500).json({ error: 'Failed to update booking status' });
    }

    return res.json({ 
      message: 'Booking status updated successfully',
      booking 
    });

  } catch (error) {
    console.error('Update booking status error:', error);
    return res.status(500).json({ error: 'Failed to update booking status' });
  }
});

module.exports = router;