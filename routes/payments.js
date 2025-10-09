const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { supabase } = require('../lib/supabase');

const router = express.Router();

// Create Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create an order for a booking
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes = {} } = req.body || {};
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes
    });

    return res.json({ order });
  } catch (error) {
    console.error('Razorpay create order error:', error);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify payment signature and update booking payment status
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay verification fields' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isValid = generatedSignature === razorpay_signature;
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // If booking_id provided, update its payment fields
    if (booking_id) {
      const { error: updErr } = await supabase
        .from('bookings')
        .update({
          payment_status: 'completed',
          payment_transaction_id: razorpay_payment_id,
          payment_gateway_response: {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
          }
        })
        .eq('id', booking_id);

      if (updErr) {
        console.error('Failed to update booking after payment:', updErr);
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Razorpay verify error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;

// Verify payment and create booking atomically
router.post('/confirm-booking', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay verification fields' });
    }
    if (!booking || typeof booking !== 'object') {
      return res.status(400).json({ error: 'Missing booking payload' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    const isValid = generatedSignature === razorpay_signature;
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Validate minimal booking fields
    const required = ['user_id', 'service_id', 'scheduled_date', 'scheduled_time', 'service_address', 'contact_phone', 'base_price', 'total_amount', 'payment_method'];
    for (const f of required) {
      if (booking[f] === undefined || booking[f] === null || booking[f] === '') {
        return res.status(400).json({ error: `Missing field: ${f}`, field: f });
      }
    }

    // Ensure category_id present (derive from service if needed)
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

    // Force completed payment fields
    booking.payment_status = 'completed';
    booking.payment_transaction_id = razorpay_payment_id;
    booking.payment_gateway_response = { razorpay_order_id, razorpay_payment_id, razorpay_signature };
    if (!booking.booking_status) booking.booking_status = 'pending';

    const { data, error } = await supabase
      .from('bookings')
      .insert(booking)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ booking: data });
  } catch (error) {
    console.error('confirm-booking error:', error);
    return res.status(500).json({ error: 'Failed to confirm booking' });
  }
});


