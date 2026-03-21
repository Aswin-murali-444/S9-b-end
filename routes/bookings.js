const express = require('express');
const { supabase } = require('../lib/supabase');
const {
  createBookingNotification,
  sendNewBookingTeamNotifications,
  sendNewBookingProviderNotifications,
  createNotification,
  notifyAdminsBookingCompleted
} = require('../services/notificationService');
const { rankProvidersForBooking } = require('../services/mlService');

const router = express.Router();

// Resolve providerId (Supabase auth UID or users.id) to users.id for consistent DB lookups
async function resolveProviderUserId(providerId) {
  if (!providerId) return null;
  const { data: byId } = await supabase.from('users').select('id').eq('id', providerId).maybeSingle();
  if (byId?.id) return byId.id;
  const { data: byAuth } = await supabase.from('users').select('id').eq('auth_user_id', providerId).maybeSingle();
  return byAuth?.id || null;
}

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
    if (!booking.internal_status) booking.internal_status = 'active';

    const { data, error } = await supabase
      .from('bookings')
      .insert(booking)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // After booking is created, notify INDIVIDUAL providers whose specialization matches this service
    try {
      const { data: allProviders, error: providersErr } = await supabase
        .from('service_provider_details')
        .select('id, service_id, service_category_id, status')
        .eq('status', 'active');

      if (!providersErr && allProviders?.length > 0) {
        const matchingProviders = allProviders.filter((p) => {
          // Exact service match
          if (p.service_id && p.service_id === booking.service_id) return true;
          // If provider has only category set, match by category
          if (!p.service_id && p.service_category_id && p.service_category_id === booking.category_id) return true;
          return false;
        });

        const providerIds = [...new Set(matchingProviders.map((p) => p.id).filter(Boolean))];

        if (providerIds.length > 0) {
          // Get service name for notification
          let serviceName = null;
          try {
            const { data: svc } = await supabase
              .from('services')
              .select('name')
              .eq('id', booking.service_id)
              .single();
            serviceName = svc?.name || null;
          } catch (_) {}

          const notifResults = await sendNewBookingProviderNotifications(providerIds, {
            bookingId: data.id,
            serviceName,
            scheduled_date: booking.scheduled_date,
            scheduled_time: booking.scheduled_time,
            service_address: booking.service_address
          });

          if (notifResults.some((r) => !r.success)) {
            console.warn(
              'Some provider notifications failed for new booking:',
              notifResults.filter((r) => !r.success)
            );
          } else {
            console.log(`Sent notifications to ${providerIds.length} individual providers for new booking ${data.id}`);
          }
        }
      }
    } catch (notifErr) {
      console.error('Failed to notify individual providers about new booking:', notifErr);
      // Don't fail the booking creation if notifications fail
    }

    // After booking is created, notify TEAMS that handle this service
    try {
      // Find teams that handle this service (by service_id or category_id)
      const { data: teams, error: teamsErr } = await supabase
        .from('teams')
        .select(`
          id,
          name,
          service_id,
          service_category_id,
          team_members(
            user_id,
            status
          )
        `)
        .eq('status', 'active')
        .or(`service_id.eq.${booking.service_id},service_category_id.eq.${booking.category_id}`);

      if (!teamsErr && teams?.length > 0) {
        // Collect all active team member user IDs
        const allTeamMemberIds = [];
        const teamNames = [];
        for (const team of teams) {
          const activeMembers = (team.team_members || []).filter((tm) => tm.status === 'active');
          const memberUserIds = activeMembers.map((tm) => tm.user_id).filter(Boolean);
          allTeamMemberIds.push(...memberUserIds);
          if (team.name) teamNames.push(team.name);
        }

        // Remove duplicates
        const uniqueMemberIds = [...new Set(allTeamMemberIds)];

        if (uniqueMemberIds.length > 0) {
          // Get service name for notification
          let serviceName = null;
          try {
            const { data: svc } = await supabase
              .from('services')
              .select('name')
              .eq('id', booking.service_id)
              .single();
            serviceName = svc?.name || null;
          } catch (_) {}

          // Resolve all member IDs to users.id (for recipient_id)
          const resolvedIds = [];
          for (const id of uniqueMemberIds) {
            const resolved = await resolveProviderUserId(id);
            if (resolved) resolvedIds.push(resolved);
            else resolvedIds.push(id); // fallback
          }

          // Send notifications to all team members about the new booking
          const notifResults = await sendNewBookingTeamNotifications(resolvedIds, {
            bookingId: data.id,
            serviceName: serviceName,
            scheduled_date: booking.scheduled_date,
            scheduled_time: booking.scheduled_time,
            service_address: booking.service_address,
            category_id: booking.category_id,
            service_id: booking.service_id
          });

          if (notifResults.some((r) => !r.success)) {
            console.warn('Some team notifications failed for new booking:', notifResults.filter((r) => !r.success));
          } else {
            console.log(`Sent notifications to ${resolvedIds.length} team members for new booking ${data.id}`);
          }
        }
      }
    } catch (notifErr) {
      console.error('Failed to notify teams about new booking:', notifErr);
      // Don't fail the booking creation if notifications fail
    }

    return res.json({ booking: data });
  } catch (error) {
    console.error('Create booking error:', error);
    return res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Recommend best providers for an existing booking (for admin / assignment UIs)
router.get('/:bookingId/recommended-providers', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const topK = parseInt(req.query.topK || req.query.top_k || '5', 10);

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID is required' });
    }

    // Fetch the booking to understand required service/category and some context
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(
        'id, user_id, service_id, category_id, service_city, service_state, scheduled_date, scheduled_time, total_amount'
      )
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Get active providers that could potentially handle this booking
    const { data: allProviders, error: providersErr } = await supabase
      .from('service_provider_details')
      .select('id, service_id, service_category_id, status')
      .eq('status', 'active');

    if (providersErr) {
      console.error('Error fetching providers for recommendation:', providersErr);
      return res.status(500).json({ error: 'Failed to fetch providers' });
    }

    const matchingProviders = (allProviders || []).filter((p) => {
      if (p.service_id && p.service_id === booking.service_id) return true;
      if (!p.service_id && p.service_category_id && p.service_category_id === booking.category_id) return true;
      return false;
    });

    if (!matchingProviders.length) {
      return res.json({
        bookingId,
        recommendedProviders: [],
        totalCandidates: 0,
        message: 'No matching providers found for this booking'
      });
    }

    // For each candidate provider, compute simple performance statistics from past bookings
    const candidateIds = [...new Set(matchingProviders.map((p) => p.id).filter(Boolean))];

    const providerStats = await Promise.all(
      candidateIds.map(async (providerId) => {
        try {
          const { data: providerBookings, error: pbErr } = await supabase
            .from('bookings')
            .select('booking_status, provider_rating')
            .eq('assigned_provider_id', providerId)
            .limit(200);

          if (pbErr || !providerBookings) {
            return {
              id: providerId,
              service_id: matchingProviders.find((p) => p.id === providerId)?.service_id || null,
              service_category_id: matchingProviders.find((p) => p.id === providerId)?.service_category_id || null,
              rating: null,
              completed_jobs: null,
              cancelled_jobs: null,
              avg_response_minutes: null,
              current_active_jobs: null,
              distance_km: null
            };
          }

          let completed = 0;
          let cancelled = 0;
          let active = 0;
          let ratingSum = 0;
          let ratingCount = 0;

          for (const b of providerBookings) {
            if (b.booking_status === 'completed') completed += 1;
            if (b.booking_status === 'cancelled') cancelled += 1;
            if (['pending', 'confirmed', 'assigned', 'in_progress'].includes(b.booking_status)) active += 1;
            if (typeof b.provider_rating === 'number') {
              ratingSum += b.provider_rating;
              ratingCount += 1;
            }
          }

          const avgRating = ratingCount > 0 ? ratingSum / ratingCount : null;

          const baseProvider = matchingProviders.find((p) => p.id === providerId) || {};

          return {
            id: providerId,
            service_id: baseProvider.service_id || null,
            service_category_id: baseProvider.service_category_id || null,
            rating: avgRating,
            completed_jobs: completed,
            cancelled_jobs: cancelled,
            avg_response_minutes: null,
            current_active_jobs: active,
            distance_km: null
          };
        } catch (e) {
          console.warn('Failed to compute provider stats for', providerId, e.message || e);
          const baseProvider = matchingProviders.find((p) => p.id === providerId) || {};
          return {
            id: providerId,
            service_id: baseProvider.service_id || null,
            service_category_id: baseProvider.service_category_id || null,
            rating: null,
            completed_jobs: null,
            cancelled_jobs: null,
            avg_response_minutes: null,
            current_active_jobs: null,
            distance_km: null
          };
        }
      })
    );

    const bookingForMl = {
      id: booking.id,
      user_id: booking.user_id,
      service_id: booking.service_id,
      category_id: booking.category_id,
      service_city: booking.service_city,
      service_state: booking.service_state,
      scheduled_date: booking.scheduled_date,
      scheduled_time: booking.scheduled_time,
      total_amount: booking.total_amount
    };

    const { data: mlData, error: mlError } = await rankProvidersForBooking(
      bookingForMl,
      providerStats,
      Number.isFinite(topK) ? topK : 5
    );

    if (mlError || !mlData) {
      console.error('ML provider ranking failed, falling back to simple ordering:', mlError);
      // Fallback: sort by completed_jobs desc, then rating desc
      const fallbackSorted = [...providerStats].sort((a, b) => {
        const aCompleted = a.completed_jobs || 0;
        const bCompleted = b.completed_jobs || 0;
        if (bCompleted !== aCompleted) return bCompleted - aCompleted;
        const aRating = a.rating || 0;
        const bRating = b.rating || 0;
        return bRating - aRating;
      });

      return res.json({
        bookingId,
        recommendedProviders: fallbackSorted.slice(0, topK > 0 ? topK : 5),
        totalCandidates: providerStats.length,
        usedMlService: false
      });
    }

    // Enrich ML-ranked providers with basic user profile data
    const rankedProviders = mlData.providers || [];
    const rankedIds = rankedProviders.map((p) => p.id).filter(Boolean);

    let userProfilesById = {};
    if (rankedIds.length > 0) {
      try {
        const { data: users } = await supabase
          .from('users')
          .select('id, email, user_profiles(first_name, last_name, phone)')
          .in('id', rankedIds);

        if (Array.isArray(users)) {
          for (const u of users) {
            const profileRaw = u.user_profiles;
            const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
            userProfilesById[u.id] = {
              id: u.id,
              email: u.email,
              first_name: profile?.first_name || '',
              last_name: profile?.last_name || '',
              phone: profile?.phone || ''
            };
          }
        }
      } catch (e) {
        console.warn('Failed to enrich provider profiles for recommendations:', e.message || e);
      }
    }

    const responseProviders = rankedProviders.map((p) => {
      const profile = userProfilesById[p.id] || {};
      const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
      return {
        id: p.id,
        score: p.score,
        match_type: p.details?.match_type || null,
        rating: p.rating,
        completed_jobs: p.completed_jobs,
        cancelled_jobs: p.cancelled_jobs,
        current_active_jobs: p.current_active_jobs,
        service_id: p.service_id,
        service_category_id: p.service_category_id,
        provider_name: fullName || profile.email || '',
        provider_phone: profile.phone || ''
      };
    });

    return res.json({
      bookingId,
      recommendedProviders: responseProviders,
      totalCandidates: mlData.total_candidates || providerStats.length,
      usedMlService: true
    });
  } catch (error) {
    console.error('Get recommended providers error:', error);
    return res.status(500).json({ error: 'Failed to get recommended providers' });
  }
});

// Get bookings for a specific service provider (ASSIGNED BOOKINGS — individual + team)
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { status, limit = 50, offset = 0, scope = 'upcoming' } = req.query;

    if (!providerId) {
      return res.status(400).json({ error: 'Provider ID is required' });
    }

    const resolvedId = await resolveProviderUserId(providerId);
    if (!resolvedId) {
      return res.status(400).json({ error: 'Provider not found. Ensure you are logged in and your user record exists.' });
    }

    // Date filter (prevents old bookings from showing as active jobs)
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1) Bookings assigned to this provider individually
    const { data: individualBookings, error: indErr } = await supabase
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
      .eq('assigned_provider_id', resolvedId)
      .eq('internal_status', 'active')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (indErr) {
      console.error('Error fetching individual provider bookings:', indErr);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    // 2) Bookings where this provider is in a team assignment AND has ACCEPTED it.
    // Declined/pending responses should not show up as "assigned" jobs here.
    let teamBookingIds = [];
    try {
      const { data: acceptedRows, error: accErr } = await supabase
        .from('team_assignment_acceptances')
        .select('team_assignment_id')
        .eq('user_id', resolvedId)
        .eq('status', 'accepted');

      if (!accErr && acceptedRows?.length) {
        const acceptedAssignmentIds = acceptedRows.map((r) => r.team_assignment_id).filter(Boolean);
        if (acceptedAssignmentIds.length > 0) {
          const { data: teamRows, error: teamErr } = await supabase
            .from('team_assignments')
            .select('booking_id, assignment_status')
            .in('id', acceptedAssignmentIds)
            .neq('assignment_status', 'cancelled');
          if (!teamErr && teamRows?.length) {
            teamBookingIds = teamRows.map((r) => r.booking_id).filter(Boolean);
          }
        }
      } else if (accErr) {
        // Table may not exist yet
        console.warn('team_assignment_acceptances query failed:', accErr.message);
      }
    } catch (e) {
      // team_assignments table or column may not exist
    }

    let bookings = individualBookings || [];
    if (teamBookingIds.length > 0) {
      const { data: teamBookings, error: teamBErr } = await supabase
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
        .in('id', teamBookingIds)
        .eq('internal_status', 'active');
      if (!teamBErr && teamBookings?.length) {
        const existingIds = new Set((bookings || []).map((b) => b.id));
        const extra = teamBookings.filter((b) => !existingIds.has(b.id));
        bookings = [...(bookings || []), ...extra];
      }
    }

    // Apply scope (date) and status in memory
    if (String(scope).toLowerCase() !== 'all') {
      if (String(scope).toLowerCase() === 'past') {
        bookings = bookings.filter((b) => b.scheduled_date < todayStr);
      } else {
        bookings = bookings.filter((b) => b.scheduled_date >= todayStr);
      }
    }
    if (status && status !== 'all') {
      bookings = bookings.filter((b) => b.booking_status === status);
    } else if (String(scope).toLowerCase() !== 'all' && String(scope).toLowerCase() !== 'past') {
      bookings = bookings.filter((b) =>
        ['pending', 'confirmed', 'assigned', 'in_progress'].includes(b.booking_status)
      );
    }

    // Sort and paginate
    bookings.sort(
      (a, b) =>
        String(a.scheduled_date).localeCompare(String(b.scheduled_date)) ||
        String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || ''))
    );
    const total = bookings.length;
    bookings = bookings.slice(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));

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
        matchReason: 'assigned',
        isTeamAssignment: teamBookingIds.length > 0 && teamBookingIds.includes(booking.id)
      };
    }));

    return res.json({ 
      bookings: transformedBookings,
      total,
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

    const resolvedId = await resolveProviderUserId(providerId);
    if (!resolvedId) {
      return res.status(400).json({ error: 'Provider not found. Ensure you are logged in and your user record exists.' });
    }

    // Get provider's specialization details from service_provider_details (id = users.id)
    const { data: providerDetails, error: providerError } = await supabase
      .from('service_provider_details')
      .select(`
        id,
        specialization,
        service_category_id,
        service_id,
        status
      `)
      .eq('id', resolvedId)
      .single();

    if (providerError || !providerDetails) {
      console.error('Provider details error:', providerError);
      return res.status(404).json({ error: 'Provider not found or no specialization details' });
    }

    console.log('Provider details found:', providerDetails);

    // Only show upcoming, unassigned, pending bookings (prevents old bookings from appearing)
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Get candidate bookings first, then filter in JavaScript (service/category match)
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
      .eq('booking_status', 'pending')
      .is('assigned_provider_id', null)
      .gte('scheduled_date', todayStr)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
      .limit(100);

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    console.log(`Found ${allBookings?.length || 0} total bookings`);

    // Filter bookings based on provider specialization - ONLY show exact matches
    const matchingBookings = (allBookings || []).filter(booking => {
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

      const isAssigned = false;
      let matchReason = '';
      if (booking.service_id === providerDetails.service_id) {
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
        canAccept: booking.booking_status === 'pending'
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

    // Resolve providerId to users.id (frontend sends Supabase auth UID; bookings.assigned_provider_id is users.id)
    let resolvedProviderId = null;
    const { data: userById, error: userByIdError } = await supabase.from('users').select('id').eq('id', providerId).maybeSingle();
    if (!userByIdError && userById?.id) {
      resolvedProviderId = userById.id;
    }
    if (!resolvedProviderId) {
      const { data: userByAuth, error: userByAuthError } = await supabase.from('users').select('id').eq('auth_user_id', providerId).maybeSingle();
      if (!userByAuthError && userByAuth?.id) {
        resolvedProviderId = userByAuth.id;
      }
    }
    if (!resolvedProviderId) {
      return res.status(400).json({ error: 'Provider not found. Ensure you are logged in and your user record has auth_user_id set in Supabase users table.' });
    }

    // Optional: verify service_provider_details exists (don't block assign if table/row missing)
    const { data: providerDetails, error: providerDetailsError } = await supabase
      .from('service_provider_details')
      .select('id, status')
      .eq('id', resolvedProviderId)
      .maybeSingle();
    if (providerDetailsError) {
      console.warn('Service provider details check skipped:', providerDetailsError.message);
    } else if (!providerDetails) {
      console.warn('No service_provider_details row for user', resolvedProviderId, '- assign will still be attempted');
    }

    // Check if booking exists and is available for assignment
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, booking_status, assigned_provider_id, internal_status, scheduled_date')
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

    // Ensure provider is not on leave for this booking date
    try {
      if (booking.scheduled_date) {
        const { data: leaveRows, error: leaveErr } = await supabase
          .from('provider_time_off')
          .select('id, status, start_date, end_date')
          .eq('provider_id', resolvedProviderId)
          .neq('status', 'cancelled')
          .neq('status', 'rejected')
          .lte('start_date', booking.scheduled_date)
          .gte('end_date', booking.scheduled_date);

        if (!leaveErr && Array.isArray(leaveRows) && leaveRows.length > 0) {
          return res.status(400).json({
            error: 'This provider is on leave for the booking date. Please choose another provider or date.'
          });
        }
      }
    } catch (e) {
      console.warn('Failed to enforce provider leave check when assigning booking:', e.message || e);
    }

    // Assign the booking to the provider (use resolved users.id for FK)
    const updatePayload = {
      assigned_provider_id: resolvedProviderId,
      provider_assigned_at: new Date().toISOString(),
      booking_status: 'assigned'
    };
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      console.error('Error assigning booking:', updateError);
      const msg = updateError.message || 'Database update failed';
      return res.status(500).json({
        error: 'Failed to assign booking',
        details: msg,
        code: updateError.code
      });
    }

    if (!updatedBooking) {
      console.error('Booking update succeeded but no booking returned');
      return res.status(500).json({ error: 'Booking assignment completed but failed to retrieve updated booking' });
    }

    // Create notification for customer (non-blocking; do not fail assign on notification errors)
    try {
      if (updatedBooking?.user_id) {
        const notificationResult = await createBookingNotification(
          updatedBooking.user_id,
          updatedBooking.id,
          'assigned',
          {
            scheduled_date: updatedBooking.scheduled_date,
            scheduled_time: updatedBooking.scheduled_time,
            service_address: updatedBooking.service_address,
            total_amount: updatedBooking.total_amount
          }
        );
        if (!notificationResult?.success) {
          console.error('Failed to create notification:', notificationResult?.error);
        }
      }
    } catch (notifErr) {
      console.error('Notification error (assign succeeded):', notifErr);
    }

    // Optional: log to booking_assign_audit if table exists (from supabase-fix-booking-assign.sql)
    const { error: auditErr } = await supabase.from('booking_assign_audit').insert({
      booking_id: bookingId,
      assigned_provider_id: resolvedProviderId,
      notes: 'assign-api'
    });
    if (auditErr) { /* table may not exist; ignore */ }

    return res.json({ 
      message: 'Booking assigned successfully',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Assign booking error:', error);
    return res.status(500).json({
      error: 'Failed to assign booking',
      details: error.message || 'Unknown error occurred'
    });
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

    // When the job is marked as completed AND the customer has paid,
    // automatically calculate the 10% company commission and 90% worker payout
    // and mark the payout as PAID, inserting proper salary records. This is
    // automatic for both single-worker and team (group) jobs.
    try {
      if (
        booking.booking_status === 'completed' &&
        booking.payment_status === 'completed'
      ) {
        // If already processed, skip (idempotent)
        if (booking.worker_payout_status === 'paid') {
          // Nothing to do
        } else {
          const totalAmount = parseFloat(booking.total_amount) || 0;

          const baseCommission = parseFloat(booking.company_commission_amount);
          const companyCommission = Number(
            (Number.isFinite(baseCommission) && baseCommission > 0
              ? baseCommission
              : totalAmount * 0.10
            ).toFixed(2)
          );
          const baseWorkerPayout = parseFloat(booking.worker_payout_amount);
          const workerPayout = Number(
            (Number.isFinite(baseWorkerPayout) && baseWorkerPayout > 0
              ? baseWorkerPayout
              : totalAmount - companyCommission
            ).toFixed(2)
          );
          const nowIso = new Date().toISOString();

          // Determine if this is a team (group) booking
          const isTeamBooking = booking.is_team_booking || !!booking.assigned_team_id;

          if (isTeamBooking) {
            // TEAM / GROUP JOB: split workerPayout among accepted team members
            let memberIds = [];
            try {
              // Find latest non-cancelled team assignment for this booking
              const { data: assignment, error: assignErr } = await supabase
                .from('team_assignments')
                .select('id, assigned_members, assignment_status')
                .eq('booking_id', bookingId)
                .neq('assignment_status', 'cancelled')
                .order('assigned_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!assignErr && assignment) {
                // First, get members who actually accepted this assignment
                const { data: acceptedRows, error: accErr } = await supabase
                  .from('team_assignment_acceptances')
                  .select('user_id, status')
                  .eq('team_assignment_id', assignment.id)
                  .eq('status', 'accepted');

                if (!accErr && Array.isArray(acceptedRows) && acceptedRows.length > 0) {
                  memberIds = acceptedRows.map(r => r.user_id).filter(Boolean);
                } else if (Array.isArray(assignment.assigned_members) && assignment.assigned_members.length > 0) {
                  // Fallback: use assigned_members from team_assignments if no explicit acceptances
                  memberIds = assignment.assigned_members.filter(Boolean);
                }
              }
            } catch (teamErr) {
              console.warn('Failed to resolve team members for payout (non-blocking):', teamErr);
            }

            // If we still don't have members, fallback to single assigned_provider_id if present
            if (memberIds.length === 0 && booking.assigned_provider_id) {
              memberIds = [booking.assigned_provider_id];
            }

            if (memberIds.length === 0) {
              console.warn('No team members found for completed team booking, skipping automatic payout for booking', bookingId);
            } else {
              // Split workerPayout equally among members, adjust last one for rounding
              const perMemberRaw = workerPayout / memberIds.length;
              const perMember = Number(perMemberRaw.toFixed(2));
              const payouts = [];
              let allocated = 0;

              memberIds.forEach((memberId, index) => {
                let share = perMember;
                if (index === memberIds.length - 1) {
                  // Give remainder (if any) to last member so sum matches workerPayout
                  const remaining = Number((workerPayout - allocated).toFixed(2));
                  share = remaining;
                }
                allocated += share;
                payouts.push({
                  booking_id: bookingId,
                  worker_id: memberId,
                  total_amount: totalAmount,
                  company_commission_amount: companyCommission,
                  worker_payout_amount: share,
                  payout_status: 'paid',
                  payout_method: 'auto',
                  payout_reference: null,
                  notes: 'Auto team payout on completion',
                  paid_at: nowIso
                });
              });

              // Update booking totals and status
              const { error: payoutUpdateError } = await supabase
                .from('bookings')
                .update({
                  company_commission_amount: companyCommission,
                  worker_payout_amount: workerPayout,
                  worker_payout_status: 'paid',
                  worker_payout_paid_at: nowIso
                })
                .eq('id', bookingId);

              if (payoutUpdateError) {
                console.error('Failed to update booking payout fields (team):', payoutUpdateError);
              } else {
                const { error: payoutInsertErr } = await supabase
                  .from('booking_worker_payouts')
                  .insert(payouts);

                if (payoutInsertErr) {
                  console.error('Failed to insert booking_worker_payouts rows (team):', payoutInsertErr);
                } else {
                  // Notify each worker that their payout has been credited
                  for (const payout of payouts) {
                    try {
                      await createNotification({
                        type: 'worker_payout_credited',
                        title: 'Payment credited',
                        message: `₹${(Number(payout.worker_payout_amount) || 0).toFixed(2)} has been credited for booking ${bookingId}.`,
                        recipient_id: payout.worker_id,
                        status: 'unread',
                        priority: 'medium',
                        metadata: {
                          booking_id: bookingId,
                          total_amount: totalAmount,
                          worker_payout_amount: payout.worker_payout_amount,
                          company_commission_amount: companyCommission,
                          paid_at: nowIso,
                          mode: 'auto_team'
                        }
                      });
                    } catch (notifyErr) {
                      console.error('Failed to notify worker about team payout credit:', notifyErr);
                    }
                  }
                }

                const { error: revenueInsertErr } = await supabase
                  .from('booking_company_revenue')
                  .insert({
                    booking_id: bookingId,
                    total_amount: totalAmount,
                    company_commission_amount: companyCommission,
                    notes: 'Auto team revenue on completion'
                  });

                if (revenueInsertErr) {
                  console.error('Failed to insert booking_company_revenue row (team):', revenueInsertErr);
                }
              }
            }
          } else {
            // SINGLE WORKER JOB: entire workerPayout goes to assigned_provider_id
            if (!booking.assigned_provider_id) {
              console.warn('Completed booking has no assigned_provider_id, skipping automatic payout for booking', bookingId);
            } else {
              const { error: payoutUpdateError } = await supabase
                .from('bookings')
                .update({
                  company_commission_amount: companyCommission,
                  worker_payout_amount: workerPayout,
                  worker_payout_status: 'paid',
                  worker_payout_paid_at: nowIso
                })
                .eq('id', bookingId);

              if (payoutUpdateError) {
                console.error('Failed to update booking payout fields (single):', payoutUpdateError);
              } else {
                const { error: payoutInsertErr } = await supabase
                  .from('booking_worker_payouts')
                  .insert({
                    booking_id: bookingId,
                    worker_id: booking.assigned_provider_id,
                    total_amount: totalAmount,
                    company_commission_amount: companyCommission,
                    worker_payout_amount: workerPayout,
                    payout_status: 'paid',
                    payout_method: 'auto',
                    payout_reference: null,
                    notes: 'Auto payout on completion',
                    paid_at: nowIso
                  });

                if (payoutInsertErr) {
                  console.error('Failed to insert booking_worker_payouts row (single):', payoutInsertErr);
                } else {
                  // Notify the worker that their payout has been credited
                  try {
                    await createNotification({
                      type: 'worker_payout_credited',
                      title: 'Payment credited',
                      message: `₹${workerPayout.toFixed(2)} has been credited for booking ${bookingId}.`,
                      recipient_id: booking.assigned_provider_id,
                      status: 'unread',
                      priority: 'medium',
                      metadata: {
                        booking_id: bookingId,
                        total_amount: totalAmount,
                        worker_payout_amount: workerPayout,
                        company_commission_amount: companyCommission,
                        paid_at: nowIso,
                        mode: 'auto_single'
                      }
                    });
                  } catch (notifyErr) {
                    console.error('Failed to notify worker about payout credit (single):', notifyErr);
                  }
                }

                const { error: revenueInsertErr } = await supabase
                  .from('booking_company_revenue')
                  .insert({
                    booking_id: bookingId,
                    total_amount: totalAmount,
                    company_commission_amount: companyCommission,
                    notes: 'Auto revenue on completion'
                  });

                if (revenueInsertErr) {
                  console.error('Failed to insert booking_company_revenue row (single):', revenueInsertErr);
                }
              }
            }
          }
        }
      }
    } catch (payoutErr) {
      console.error('Payout calculation error (non-blocking):', payoutErr);
    }

    // Create notification for customer based on status change
    if (['confirmed', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      const notificationResult = await createBookingNotification(
        booking.user_id,
        booking.id,
        status === 'in_progress' ? 'started' : status,
        {
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          service_address: booking.service_address,
          total_amount: booking.total_amount
        }
      );

      if (!notificationResult.success) {
        console.error('Failed to create notification:', notificationResult.error);
        // Don't fail the request, just log the error
      }
    }

    // Notify all admins when a booking has been completed
    if (status === 'completed') {
      try {
        // Try to fetch some human-friendly context (service name, customer name, provider name)
        let serviceName = null;
        let customerName = null;
        let providerName = null;

        try {
          if (booking.service_id) {
            const { data: svc } = await supabase
              .from('services')
              .select('name')
              .eq('id', booking.service_id)
              .maybeSingle();
            serviceName = svc?.name || null;
          }
        } catch (_e) {}

        try {
          if (booking.user_id) {
            const { data: cust } = await supabase
              .from('users')
              .select('email, user_profiles(first_name, last_name)')
              .eq('id', booking.user_id)
              .maybeSingle();
            if (cust) {
              const profRaw = cust.user_profiles;
              const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
              const first = prof?.first_name || '';
              const last = prof?.last_name || '';
              const full = `${first} ${last}`.trim();
              customerName = full || cust.email || null;
            }
          }
        } catch (_e) {}

        try {
          if (booking.assigned_provider_id) {
            const { data: prov } = await supabase
              .from('users')
              .select('email, user_profiles(first_name, last_name)')
              .eq('id', booking.assigned_provider_id)
              .maybeSingle();
            if (prov) {
              const profRaw = prov.user_profiles;
              const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
              const first = prof?.first_name || '';
              const last = prof?.last_name || '';
              const full = `${first} ${last}`.trim();
              providerName = full || prov.email || null;
            }
          }
        } catch (_e) {}

        await notifyAdminsBookingCompleted({
          bookingId,
          serviceName,
          customerName,
          providerName,
          totalAmount: booking.total_amount,
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time
        });
      } catch (adminNotifyErr) {
        console.error('Failed to notify admins about booking completion:', adminNotifyErr);
      }
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