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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    let { booking, bookings } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay verification fields' });
    }
    if (!booking && !Array.isArray(bookings)) {
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

    // Normalize to an array of booking payloads
    const bookingPayloads = Array.isArray(bookings) ? bookings : [booking];

    // Validate each booking and enrich
    const required = ['user_id', 'service_id', 'scheduled_date', 'scheduled_time', 'service_address', 'contact_phone', 'base_price', 'total_amount', 'payment_method'];
    const enrichedPayloads = [];
    for (const b of bookingPayloads) {
      for (const f of required) {
        if (b[f] === undefined || b[f] === null || b[f] === '') {
          return res.status(400).json({ error: `Missing field: ${f}`, field: f });
        }
      }

      // Derive category_id if missing
      let categoryId = b.category_id;
      if (!categoryId) {
        const { data: svc, error: svcErr } = await supabase
          .from('services')
          .select('id, category_id')
          .eq('id', b.service_id)
          .single();
        if (svcErr || !svc) {
          return res.status(400).json({ error: 'Invalid service. Unable to determine category.', field: 'service_id' });
        }
        categoryId = svc.category_id;
      }

      enrichedPayloads.push({
        ...b,
        category_id: categoryId,
        payment_status: 'completed',
        payment_transaction_id: razorpay_payment_id,
        payment_gateway_response: { razorpay_order_id, razorpay_payment_id, razorpay_signature },
        booking_status: b.booking_status || 'pending'
      });
    }

    // Insert one or many
    const { data, error } = await supabase
      .from('bookings')
      .insert(enrichedPayloads)
      .select('*');

    if (error) return res.status(400).json({ error: error.message });

    // Shape response to support both single and multi
    if (Array.isArray(bookings)) {
      return res.json({ bookings: data });
    } else {
      return res.json({ booking: Array.isArray(data) ? data[0] : data });
    }
  } catch (error) {
    console.error('confirm-booking error:', error);
    return res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

router.post('/worker-payout', async (req, res) => {
  try {
    const { booking_id, payout_method, payout_reference, notes } = req.body || {};

    if (!booking_id) {
      return res.status(400).json({ error: 'booking_id is required' });
    }

    // Fetch booking to validate state and amounts
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, booking_status, payment_status, total_amount, worker_payout_amount, worker_payout_status, company_commission_amount, assigned_provider_id')
      .eq('id', booking_id)
      .single();

    if (fetchErr || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.booking_status !== 'completed') {
      return res.status(400).json({ error: 'Booking must be completed before paying the worker' });
    }

    if (booking.payment_status !== 'completed') {
      return res.status(400).json({ error: 'Customer payment must be completed before paying the worker' });
    }

    if (booking.worker_payout_status === 'paid') {
      return res.status(400).json({ error: 'Worker payout is already marked as paid for this booking' });
    }

    const totalAmount = parseFloat(booking.total_amount) || 0;
    const existingPayout = parseFloat(booking.worker_payout_amount) || 0;

    // If payout was not pre-calculated for some reason, calculate now (10% company, 90% worker)
    const payoutAmount =
      existingPayout > 0
        ? existingPayout
        : Number((totalAmount * 0.90).toFixed(2));

    // Company commission (10%) - use stored value if present, else compute
    const existingCommission = parseFloat(booking.company_commission_amount) || 0;
    const commissionAmount =
      existingCommission > 0
        ? existingCommission
        : Number((totalAmount * 0.10).toFixed(2));

    if (!booking.assigned_provider_id) {
      return res.status(400).json({ error: 'No worker is assigned to this booking, cannot record payout' });
    }

    // 1) Update booking payout fields
    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        worker_payout_amount: payoutAmount,
        worker_payout_status: 'paid',
        worker_payout_paid_at: new Date().toISOString()
      })
      .eq('id', booking_id);

    if (updateErr) {
      console.error('Failed to mark worker payout as paid:', updateErr);
      return res.status(500).json({ error: 'Failed to update worker payout status' });
    }

    // 2) Insert detailed payout record for the worker
    const { error: payoutInsertErr } = await supabase
      .from('booking_worker_payouts')
      .insert({
        booking_id,
        worker_id: booking.assigned_provider_id,
        total_amount: totalAmount,
        company_commission_amount: commissionAmount,
        worker_payout_amount: payoutAmount,
        payout_status: 'paid',
        payout_method: payout_method || 'manual',
        payout_reference: payout_reference || null,
        notes: notes || null,
        paid_at: new Date().toISOString()
      });

    if (payoutInsertErr) {
      console.error('Failed to insert booking_worker_payouts row:', payoutInsertErr);
      // Do not fail the request; booking payout is already marked as paid.
    }

    // 3) Record company revenue from this booking (idempotent-ish: ignore unique logic for now)
    const { error: revenueInsertErr } = await supabase
      .from('booking_company_revenue')
      .insert({
        booking_id,
        total_amount: totalAmount,
        company_commission_amount: commissionAmount,
        notes: notes || null
      });

    if (revenueInsertErr) {
      console.error('Failed to insert booking_company_revenue row:', revenueInsertErr);
      // Also non-blocking
    }

    return res.json({
      success: true,
      message: 'Worker payout marked as paid and recorded',
      payout_amount: payoutAmount,
      company_commission_amount: commissionAmount
    });
  } catch (error) {
    console.error('worker-payout error:', error);
    return res.status(500).json({ error: 'Failed to mark worker payout as paid' });
  }
});

// Automatic payout: when called by system (no admin click), immediately
// record payout as paid for a completed & paid booking. This is intended
// to be triggered after both booking completion and customer payment.
router.post('/auto-worker-payout', async (req, res) => {
  try {
    const { booking_id, payout_method = 'auto', payout_reference = null, notes = null } = req.body || {};

    if (!booking_id) {
      return res.status(400).json({ error: 'booking_id is required' });
    }

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, booking_status, payment_status, total_amount, worker_payout_amount, worker_payout_status, company_commission_amount, assigned_provider_id')
      .eq('id', booking_id)
      .single();

    if (fetchErr || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.booking_status !== 'completed' || booking.payment_status !== 'completed') {
      return res.status(400).json({ error: 'Booking must be completed and paid before automatic payout' });
    }

    if (booking.worker_payout_status === 'paid') {
      return res.json({ success: true, message: 'Worker payout already marked as paid', alreadyPaid: true });
    }

    if (!booking.assigned_provider_id) {
      return res.status(400).json({ error: 'No worker is assigned to this booking, cannot record payout' });
    }

    const totalAmount = parseFloat(booking.total_amount) || 0;
    const existingPayout = parseFloat(booking.worker_payout_amount) || 0;
    const payoutAmount =
      existingPayout > 0
        ? existingPayout
        : Number((totalAmount * 0.90).toFixed(2));

    const existingCommission = parseFloat(booking.company_commission_amount) || 0;
    const commissionAmount =
      existingCommission > 0
        ? existingCommission
        : Number((totalAmount * 0.10).toFixed(2));

    const nowIso = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        worker_payout_amount: payoutAmount,
        worker_payout_status: 'paid',
        worker_payout_paid_at: nowIso,
        company_commission_amount: commissionAmount
      })
      .eq('id', booking_id);

    if (updateErr) {
      console.error('Failed to mark worker payout as paid (auto):', updateErr);
      return res.status(500).json({ error: 'Failed to update booking payout status (auto)' });
    }

    const { error: payoutInsertErr } = await supabase
      .from('booking_worker_payouts')
      .insert({
        booking_id,
        worker_id: booking.assigned_provider_id,
        total_amount: totalAmount,
        company_commission_amount: commissionAmount,
        worker_payout_amount: payoutAmount,
        payout_status: 'paid',
        payout_method,
        payout_reference,
        notes,
        paid_at: nowIso
      });

    if (payoutInsertErr) {
      console.error('Failed to insert booking_worker_payouts row (auto):', payoutInsertErr);
    }

    const { error: revenueInsertErr } = await supabase
      .from('booking_company_revenue')
      .insert({
        booking_id,
        total_amount: totalAmount,
        company_commission_amount: commissionAmount,
        notes
      });

    if (revenueInsertErr) {
      console.error('Failed to insert booking_company_revenue row (auto):', revenueInsertErr);
    }

    return res.json({
      success: true,
      message: 'Automatic worker payout recorded',
      payout_amount: payoutAmount,
      company_commission_amount: commissionAmount
    });
  } catch (error) {
    console.error('auto-worker-payout error:', error);
    return res.status(500).json({ error: 'Failed to record automatic worker payout' });
  }
});

// Provider salary summary for the worker dashboard (per-provider view)
router.get('/provider/:providerId/salary-summary', async (req, res) => {
  try {
    const { providerId } = req.params;
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }

    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    const { data: payouts, error } = await supabase
      .from('booking_worker_payouts')
      .select('id, booking_id, total_amount, company_commission_amount, worker_payout_amount, payout_status, payout_method, payout_reference, notes, paid_at')
      .eq('worker_id', providerId)
      .order('paid_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Failed to fetch provider payouts:', error);
      return res.status(500).json({ error: 'Failed to fetch salary summary' });
    }

    const paidPayouts = (payouts || []).filter(p => p.payout_status === 'paid');
    const totalEarned = paidPayouts.reduce((sum, p) => sum + (Number(p.worker_payout_amount) || 0), 0);
    const monthEarned = paidPayouts
      .filter(p => p.paid_at && p.paid_at >= firstOfMonth)
      .reduce((sum, p) => sum + (Number(p.worker_payout_amount) || 0), 0);

    const pendingPayouts = (payouts || []).filter(p => p.payout_status === 'pending');
    const pendingAmount = pendingPayouts.reduce((sum, p) => sum + (Number(p.worker_payout_amount) || 0), 0);

    return res.json({
      summary: {
        totalEarned,
        monthEarned,
        pendingAmount,
        totalJobsPaid: paidPayouts.length,
        totalJobsPending: pendingPayouts.length
      },
      payouts: payouts || []
    });
  } catch (error) {
    console.error('provider salary-summary error:', error);
    return res.status(500).json({ error: 'Failed to load salary summary' });
  }
});

// Provider bank / UPI details for salary payouts
router.get('/provider/:providerId/bank-details', async (req, res) => {
  try {
    const { providerId } = req.params;
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }

    const { data, error } = await supabase
      .from('service_provider_details')
      .select('id, upi_id, bank_account_number, bank_ifsc, bank_name, account_holder_name, payout_preference')
      .eq('id', providerId)
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch provider bank details:', error);
      return res.status(500).json({ error: 'Failed to fetch bank details' });
    }

    return res.json({ bankDetails: data || null });
  } catch (error) {
    console.error('provider bank-details error:', error);
    return res.status(500).json({ error: 'Failed to load bank details' });
  }
});

router.put('/provider/:providerId/bank-details', async (req, res) => {
  try {
    const { providerId } = req.params;
    const {
      upi_id,
      bank_account_number,
      bank_ifsc,
      bank_name,
      account_holder_name,
      payout_preference
    } = req.body || {};

    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }

    const payload = {
      upi_id: upi_id || null,
      bank_account_number: bank_account_number || null,
      bank_ifsc: bank_ifsc || null,
      bank_name: bank_name || null,
      account_holder_name: account_holder_name || null,
      payout_preference: payout_preference || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('service_provider_details')
      .upsert({
        id: providerId,
        ...payload
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('Failed to update provider bank details:', error);
      return res.status(500).json({ error: 'Failed to save bank details' });
    }

    return res.json({ bankDetails: data });
  } catch (error) {
    console.error('provider bank-details update error:', error);
    return res.status(500).json({ error: 'Failed to save bank details' });
  }
});



