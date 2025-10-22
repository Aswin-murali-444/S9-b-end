const express = require('express');
const { supabase } = require('../lib/supabase');
const { notificationAutomation } = require('../services/notificationAutomation');
const NotificationMiddleware = require('../middleware/notificationMiddleware');
const { 
  createWelcomeNotification, 
  createProfileCompletionNotification,
  createVerificationNotification 
} = require('../services/notificationService');

const router = express.Router();

// ==================== EXAMPLE INTEGRATION ====================
// This file shows how to integrate automated notifications with your existing routes
// Copy the relevant middleware to your actual route files

// Example: Enhanced booking route with automated notifications
router.post('/bookings', 
  // Add notification middleware for booking creation
  NotificationMiddleware.bookingNotifications().created,
  async (req, res) => {
    try {
      const booking = req.body || {};

      // Your existing booking creation logic
      const required = ['user_id', 'service_id', 'scheduled_date', 'scheduled_time', 'service_address', 'contact_phone', 'base_price', 'total_amount', 'payment_method'];
      for (const f of required) {
        if (booking[f] === undefined || booking[f] === null || booking[f] === '') {
          return res.status(400).json({ error: `Missing field: ${f}`, field: f });
        }
      }

      // Set default statuses
      if (!booking.payment_status) booking.payment_status = 'pending';
      if (!booking.booking_status) booking.booking_status = 'pending';

      const { data, error } = await supabase
        .from('bookings')
        .insert(booking)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      
      // The notification will be automatically triggered by the middleware
      return res.json({ booking: data });
    } catch (error) {
      console.error('Create booking error:', error);
      return res.status(500).json({ error: 'Failed to create booking' });
    }
  }
);

// Example: Enhanced booking status update with notifications
router.put('/bookings/:bookingId/status',
  NotificationMiddleware.bookingNotifications().statusUpdated,
  async (req, res) => {
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

      // The notification will be automatically triggered by the middleware
      return res.json({ booking });
    } catch (error) {
      console.error('Update booking status error:', error);
      return res.status(500).json({ error: 'Failed to update booking status' });
    }
  }
);

// Example: Enhanced user registration with welcome notification
router.post('/users/register',
  NotificationMiddleware.userNotifications().registered,
  async (req, res) => {
    try {
      const userData = req.body;

      // Your existing user registration logic
      const { data: user, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      // Create welcome notification manually (middleware will also trigger)
      await createWelcomeNotification(user.id, user.name || user.first_name);

      return res.json({ user });
    } catch (error) {
      console.error('User registration error:', error);
      return res.status(500).json({ error: 'Failed to register user' });
    }
  }
);

// Example: Enhanced profile completion with notifications
router.post('/users/profile/complete',
  NotificationMiddleware.userNotifications().profileCompleted,
  async (req, res) => {
    try {
      const profileData = req.body;
      const userId = req.user?.id || req.body.userId;

      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      // Your existing profile completion logic
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
          id: userId,
          ...profileData,
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      // Create profile completion notification manually
      await createProfileCompletionNotification(userId, profileData.profileType || 'user');

      return res.json({ 
        success: true, 
        message: 'Profile completed successfully' 
      });
    } catch (error) {
      console.error('Profile completion error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// Example: Enhanced provider verification with notifications
router.put('/admin/providers/:providerId/verify',
  NotificationMiddleware.userNotifications().providerVerified,
  async (req, res) => {
    try {
      const { providerId } = req.params;
      const { status, notes } = req.body;
      const adminId = req.user?.id;

      if (!['verified', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'Invalid verification status' });
      }

      // Your existing verification logic
      const { error } = await supabase
        .from('provider_profiles')
        .update({ 
          status: status,
          verification_notes: notes,
          verified_at: status === 'verified' ? new Date().toISOString() : null,
          verified_by: adminId
        })
        .eq('provider_id', providerId);

      if (error) {
        return res.status(500).json({ error: 'Failed to update verification status' });
      }

      // Create verification notification manually
      await createVerificationNotification(providerId, status, notes);

      return res.json({ 
        success: true, 
        message: `Provider verification status updated to ${status}` 
      });
    } catch (error) {
      console.error('Provider verification error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

// Example: Enhanced payment processing with notifications
router.post('/payments/confirm',
  NotificationMiddleware.paymentNotifications().success,
  async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking } = req.body;

      // Your existing payment verification logic
      const crypto = require('crypto');
      const generatedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      const isValid = generatedSignature === razorpay_signature;
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      // Create booking and payment records
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert(booking)
        .select()
        .single();

      if (bookingError) {
        return res.status(400).json({ error: bookingError.message });
      }

      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: bookingData.id,
          user_id: bookingData.user_id,
          amount: bookingData.total_amount,
          payment_method: 'razorpay',
          payment_status: 'success',
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature
        })
        .select()
        .single();

      if (paymentError) {
        return res.status(400).json({ error: paymentError.message });
      }

      // The notification will be automatically triggered by the middleware
      return res.json({ 
        booking: bookingData, 
        payment: paymentData 
      });
    } catch (error) {
      console.error('Payment confirmation error:', error);
      return res.status(500).json({ error: 'Failed to confirm payment' });
    }
  }
);

// ==================== MANUAL NOTIFICATION TRIGGERS ====================
// These endpoints allow manual triggering of notifications for testing or special cases

// Trigger a specific notification manually
router.post('/notifications/trigger', async (req, res) => {
  try {
    const { eventType, eventData, options } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: 'Event type is required' });
    }

    const result = await notificationAutomation.triggerNotification(eventType, eventData, options);
    
    if (result.success) {
      return res.json({ 
        success: true, 
        message: `Notification triggered for event: ${eventType}` 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('Manual notification trigger error:', error);
    return res.status(500).json({ error: 'Failed to trigger notification' });
  }
});

// Get notification statistics
router.get('/notifications/stats/:userId?', async (req, res) => {
  try {
    const userId = req.params.userId || req.user?.id;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const stats = await notificationAutomation.getNotificationStats(userId);
    
    if (stats.success) {
      return res.json({ 
        success: true, 
        stats: stats.data 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: stats.error 
      });
    }
  } catch (error) {
    console.error('Get notification stats error:', error);
    return res.status(500).json({ error: 'Failed to get notification stats' });
  }
});

// Clean up old notifications
router.post('/notifications/cleanup', async (req, res) => {
  try {
    const { daysOld = 30, status = 'read' } = req.body;

    const result = await notificationAutomation.cleanupOldNotifications(daysOld, status);
    
    if (result.success) {
      return res.json({ 
        success: true, 
        message: `Cleaned up notifications older than ${daysOld} days` 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('Cleanup notifications error:', error);
    return res.status(500).json({ error: 'Failed to cleanup notifications' });
  }
});

// Send system-wide notification (admin only)
router.post('/notifications/system', async (req, res) => {
  try {
    const { type, title, message, priority = 'medium', metadata = {} } = req.body;
    const adminId = req.user?.id;

    if (!adminId || req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!type || !title || !message) {
      return res.status(400).json({ error: 'Type, title, and message are required' });
    }

    const result = await notificationAutomation.triggerNotification(type, {
      title,
      message,
      priority,
      metadata,
      sentBy: adminId
    });

    if (result.success) {
      return res.json({ 
        success: true, 
        message: 'System notification sent successfully' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('System notification error:', error);
    return res.status(500).json({ error: 'Failed to send system notification' });
  }
});

module.exports = router;
