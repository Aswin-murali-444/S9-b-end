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

module.exports = router;


