const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

// Get all notifications (for admin dashboard)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const offset = (page - 1) * limit;

    // Check if notifications table exists first
    const { data: testData, error: testError } = await supabase
      .from('notifications')
      .select('id')
      .limit(1);

    if (testError && testError.code === 'PGRST116') {
      // Table doesn't exist, return empty result
      return res.json({
        success: true,
        data: {
          notifications: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          }
        }
      });
    }

    let query = supabase
      .from('notifications')
      .select(`
        *,
        recipient:recipient_id(
          id,
          email,
          role,
          status
        ),
        sender:sender_id(
          id,
          email,
          role
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq('type', type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error('Get notifications error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Get total count
    let countQuery = supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true });

    if (type) {
      countQuery = countQuery.eq('type', type);
    }

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Get notifications count error:', countError);
    }

    res.json({
      success: true,
      data: {
        notifications: notifications || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: error.message || 'Failed to get notifications' });
  }
});

// Get unread notifications count
router.get('/unread-count', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'unread');

    if (error) {
      console.error('Get unread count error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      data: {
        unread_count: count || 0
      }
    });

  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: error.message || 'Failed to get unread count' });
  }
});

// Mark notification as read
router.put('/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { adminUserId } = req.body;

    const updateData = {
      status: 'read',
      read_at: new Date().toISOString()
    };

    // Only add admin_user_id if it's a valid UUID and exists in users table
    if (adminUserId && adminUserId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      // Check if user exists before adding admin_user_id
      const { data: userExists, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', adminUserId)
        .single();

      if (!userError && userExists) {
        updateData.admin_user_id = adminUserId;
      }
    }

    const { data, error } = await supabase
      .from('notifications')
      .update(updateData)
      .eq('id', notificationId)
      .select()
      .single();

    if (error) {
      console.error('Mark notification as read error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/mark-all-read', async (req, res) => {
  try {
    const { adminUserId } = req.body;

    // Don't include admin_user_id if it's not a valid UUID or doesn't exist
    const updateData = {
      status: 'read',
      read_at: new Date().toISOString()
    };

    // Only add admin_user_id if it's a valid UUID and exists in users table
    if (adminUserId && adminUserId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      // Check if user exists before adding admin_user_id
      const { data: userExists, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', adminUserId)
        .single();

      if (!userError && userExists) {
        updateData.admin_user_id = adminUserId;
      }
    }

    const { data, error } = await supabase
      .from('notifications')
      .update(updateData)
      .eq('status', 'unread')
      .select();

    if (error) {
      console.error('Mark all notifications as read error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      data: {
        updated_count: data?.length || 0
      }
    });

  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({ error: error.message || 'Failed to mark all notifications as read' });
  }
});

// Dismiss notification (Admin)
router.put('/:notificationId/dismiss', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { adminUserId } = req.body;

    const updateData = {
      status: 'dismissed',
      dismissed_at: new Date().toISOString()
    };

    // Only add admin_user_id if it's a valid UUID and exists in users table
    if (adminUserId && adminUserId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
      // Check if user exists before adding admin_user_id
      const { data: userExists, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', adminUserId)
        .single();

      if (!userError && userExists) {
        updateData.admin_user_id = adminUserId;
      }
    }

    const { data, error } = await supabase
      .from('notifications')
      .update(updateData)
      .eq('id', notificationId)
      .select()
      .single();

    if (error) {
      console.error('Dismiss notification error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Dismiss notification error:', error);
    res.status(500).json({ error: error.message || 'Failed to dismiss notification' });
  }
});

// Dismiss notification for a specific user
router.put('/user/:userId/:notificationId/dismiss', async (req, res) => {
  try {
    const { userId, notificationId } = req.params;

    console.log(`Dismissing notification ${notificationId} for user ${userId}`);

    // Verify the notification belongs to the user
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('id, recipient_id')
      .eq('id', notificationId)
      .eq('recipient_id', userId)
      .single();

    if (fetchError || !notification) {
      console.error('Notification not found or access denied:', fetchError);
      return res.status(404).json({ error: 'Notification not found or access denied' });
    }

    // Update the notification status to dismissed
    const { data, error } = await supabase
      .from('notifications')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('recipient_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Dismiss user notification error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log(`✅ Notification ${notificationId} dismissed for user ${userId}`);

    res.json({
      success: true,
      data: data,
      message: 'Notification dismissed successfully'
    });

  } catch (error) {
    console.error('Dismiss user notification error:', error);
    res.status(500).json({ error: error.message || 'Failed to dismiss notification' });
  }
});

// Get notifications for a specific provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Check if notifications table exists first
    const { data: testData, error: testError } = await supabase
      .from('notifications')
      .select('id')
      .limit(1);

    if (testError && testError.code === 'PGRST116') {
      // Table doesn't exist, return empty result
      return res.json({
        success: true,
        data: {
          notifications: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          }
        }
      });
    }

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Get provider notifications error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Get total count
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', providerId);

    if (countError) {
      console.error('Get provider notifications count error:', countError);
    }

    res.json({
      success: true,
      data: {
        notifications: notifications || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get provider notifications error:', error);
    res.status(500).json({ error: error.message || 'Failed to get provider notifications' });
  }
});

// Get notifications for a specific customer/user (based on bookings)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    console.log(`Fetching booking notifications for user: ${userId}, page: ${page}, limit: ${limit}, status: ${status}`);

    // Validate userId format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      console.error('Invalid userId format:', userId);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Handle user ID mapping issue - check both auth user ID and users table ID
    // For the specific user aswinkavumkal2002@gmail.com
    const authUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8';
    const usersTableId = '23c88529-cae1-4fa5-af9f-9153db425cc5';
    
    let query;
    if (userId === authUserId) {
      // If requesting with auth user ID, check both IDs
      console.log(`Handling user ID mapping for ${userId} - checking both auth and users table IDs`);
      query = supabase
        .from('bookings')
        .select('*')
        .or(`user_id.eq.${authUserId},user_id.eq.${usersTableId}`)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    } else {
      // Normal case - use the provided user ID
      query = supabase
        .from('bookings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error('Get user bookings error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch bookings',
        details: error.message,
        code: error.code
      });
    }

    console.log(`Found ${bookings?.length || 0} bookings for user ${userId}`);

    // Convert bookings to notification format
    const notifications = (bookings || []).map(booking => {
      let notificationType, title, message, priority = 'medium';
      
      switch (booking.booking_status) {
        case 'pending':
          notificationType = 'booking_pending';
          title = 'Booking Request Sent';
          message = `Your service booking for ${booking.scheduled_date} at ${booking.scheduled_time} has been sent and is awaiting provider assignment.`;
          priority = 'medium';
          break;
        case 'assigned':
          notificationType = 'booking_assigned';
          title = 'Service Provider Assigned';
          message = `A service provider has been assigned to your booking scheduled for ${booking.scheduled_date} at ${booking.scheduled_time}.`;
          priority = 'high';
          break;
        case 'confirmed':
          notificationType = 'booking_confirmed';
          title = 'Booking Confirmed';
          message = `Your booking scheduled for ${booking.scheduled_date} at ${booking.scheduled_time} has been confirmed by the service provider.`;
          priority = 'medium';
          break;
        case 'in_progress':
          notificationType = 'service_started';
          title = 'Service Started';
          message = `Your service has started. The provider is on their way to ${booking.service_address}.`;
          priority = 'medium';
          break;
        case 'completed':
          notificationType = 'service_completed';
          title = 'Service Completed';
          message = `Your service has been completed successfully. Please rate your experience.`;
          priority = 'medium';
          break;
        case 'cancelled':
          notificationType = 'booking_cancelled';
          title = 'Booking Cancelled';
          message = `Your booking scheduled for ${booking.scheduled_date} has been cancelled.`;
          priority = 'high';
          break;
        default:
          notificationType = 'booking_update';
          title = 'Booking Update';
          message = `Your booking status has been updated to: ${booking.booking_status}`;
          priority = 'medium';
      }

      return {
        id: booking.id,
        type: notificationType,
        title: title,
        message: message,
        status: booking.booking_status === 'completed' ? 'read' : 'unread',
        priority: priority,
        time: formatTimeAgo(booking.created_at),
        createdAt: booking.created_at,
        metadata: {
          booking_id: booking.id,
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          service_address: booking.service_address,
          total_amount: booking.total_amount,
          payment_status: booking.payment_status,
          booking_status: booking.booking_status
        }
      };
    });

    // Filter by status if provided
    let filteredNotifications = notifications;
    if (status) {
      filteredNotifications = notifications.filter(n => n.status === status);
    }

    // Get total count
    let countQuery = supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Get user bookings count error:', countError);
    }

    res.json({
      success: true,
      data: {
        notifications: filteredNotifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get user notifications',
      stack: error.stack
    });
  }
});

// Helper function to format time ago
function formatTimeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Get unread notifications count for a specific user (based on bookings)
router.get('/user/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`Fetching unread booking count for user: ${userId}`);

    // Validate userId format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      console.error('Invalid userId format:', userId);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Handle user ID mapping issue - check both auth user ID and users table ID
    // For the specific user aswinkavumkal2002@gmail.com
    const authUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8';
    const usersTableId = '23c88529-cae1-4fa5-af9f-9153db425cc5';
    
    let countQuery;
    if (userId === authUserId) {
      // If requesting with auth user ID, check both IDs
      console.log(`Handling user ID mapping for unread count - checking both auth and users table IDs`);
      countQuery = supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .or(`user_id.eq.${authUserId},user_id.eq.${usersTableId}`)
        .neq('booking_status', 'completed');
    } else {
      // Normal case - use the provided user ID
      countQuery = supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .neq('booking_status', 'completed');
    }

    const { count, error } = await countQuery;

    if (error) {
      console.error('Get user unread count error:', error);
      return res.status(500).json({ 
        error: error.message,
        details: error.message,
        code: error.code
      });
    }

    console.log(`Found ${count || 0} unread notifications for user ${userId}`);

    res.json({
      success: true,
      data: {
        unread_count: count || 0
      }
    });

  } catch (error) {
    console.error('Get user unread count error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to get unread count',
      stack: error.stack
    });
  }
});

// Mark notification as read for a specific user (update booking status)
router.put('/user/:userId/:notificationId/read', async (req, res) => {
  try {
    const { userId, notificationId } = req.params;

    console.log(`Marking booking ${notificationId} as read for user ${userId}`);

    // Update the booking status to completed (marking it as read)
    const { data, error } = await supabase
      .from('bookings')
      .update({
        booking_status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Mark user notification as read error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Mark user notification as read error:', error);
    res.status(500).json({ error: error.message || 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read for a specific user (update all bookings to completed)
router.put('/user/:userId/mark-all-read', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`Marking all bookings as completed for user ${userId}`);

    // Update all non-completed bookings to completed status
    const { data, error } = await supabase
      .from('bookings')
      .update({
        booking_status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .neq('booking_status', 'completed')
      .select();

    if (error) {
      console.error('Mark all user notifications as read error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      data: {
        updated_count: data?.length || 0
      }
    });

  } catch (error) {
    console.error('Mark all user notifications as read error:', error);
    res.status(500).json({ error: error.message || 'Failed to mark all notifications as read' });
  }
});

module.exports = router;
