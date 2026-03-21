const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

// Resolve userId (auth UID or users.id) to users.id for recipient_id lookups
async function resolveUserId(idOrAuthUid) {
  if (!idOrAuthUid) return null;
  const { data: byId } = await supabase.from('users').select('id').eq('id', idOrAuthUid).maybeSingle();
  if (byId?.id) return byId.id;
  const { data: byAuth } = await supabase.from('users').select('id').eq('auth_user_id', idOrAuthUid).maybeSingle();
  return byAuth?.id || null;
}

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

// Get unread notifications count (global – for admin; use /user/:userId/unread-count for per-user)
router.get('/unread-count', async (req, res) => {
  try {
    const { data: testData, error: testError } = await supabase
      .from('notifications')
      .select('id')
      .limit(1);

    if (testError && testError.code === 'PGRST116') {
      return res.json({ success: true, data: { unread_count: 0 } });
    }

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
    const { userId: rawUserId, notificationId } = req.params;
    const userId = await resolveUserId(rawUserId) || rawUserId;

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
      .eq('recipient_id', providerId)
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
      .eq('recipient_id', providerId);

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

// Get notifications for a specific customer/user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId: rawUserId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    // Resolve auth UID to users.id (notifications.recipient_id is usually users.id)
    const resolvedId = await resolveUserId(rawUserId);
    const userIdsToQuery = [resolvedId, rawUserId].filter(Boolean);
    const uniqueIds = [...new Set(userIdsToQuery)];

    console.log(`Fetching notifications for user: raw=${rawUserId}, resolved=${resolvedId || 'none'}, page: ${page}, limit: ${limit}, status: ${status}`);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawUserId)) {
      console.error('Invalid userId format:', rawUserId);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

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

    // Query by resolved users.id and/or raw (auth UID) so we find notifications either way
    let query = supabase
      .from('notifications')
      .select('*')
      .in('recipient_id', uniqueIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: notifications, error } = await query;

    if (error) {
      console.error('Get user notifications error:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch notifications',
        details: error.message,
        code: error.code
      });
    }

    console.log(`Found ${notifications?.length || 0} notifications for user (ids: ${uniqueIds.join(', ')})`);

    // Format notifications for frontend (ensure created_at exists)
    const formattedNotifications = (notifications || []).map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      status: notification.status,
      priority: notification.priority,
      time: formatTimeAgo(notification.created_at || notification.createdAt || new Date().toISOString()),
      createdAt: notification.created_at || notification.createdAt || new Date().toISOString(),
      metadata: notification.metadata
    }));

    // Get total count (same recipient_id set)
    let countQuery = supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .in('recipient_id', uniqueIds);

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error('Get user notifications count error:', countError);
    }

    res.json({
      success: true,
      data: {
        notifications: formattedNotifications,
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
  if (!dateString) return 'Recently';
  const now = new Date();
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return 'Recently';
  }
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

// Get unread notifications count for a specific user
router.get('/user/:userId/unread-count', async (req, res) => {
  try {
    const { userId: rawUserId } = req.params;

    // Resolve auth UID to users.id; query by both so we count either way
    const resolvedId = await resolveUserId(rawUserId);
    const uniqueIds = [...new Set([resolvedId, rawUserId].filter(Boolean))];

    console.log(`Fetching unread notification count for user: raw=${rawUserId}, resolved=${resolvedId || 'none'}`);

    // Validate userId format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(rawUserId)) {
      console.error('Invalid userId format:', rawUserId);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Check if notifications table exists first
    const { data: testData, error: testError } = await supabase
      .from('notifications')
      .select('id')
      .limit(1);

    if (testError && testError.code === 'PGRST116') {
      // Table doesn't exist, return 0 count
      return res.json({
        success: true,
        data: {
          unread_count: 0
        }
      });
    }

    // Get unread count for this user (recipient_id = resolved or raw)
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .in('recipient_id', uniqueIds)
      .eq('status', 'unread');

    if (error) {
      console.error('Get user unread count error:', error);
      return res.status(500).json({ 
        error: error.message,
        details: error.message,
        code: error.code
      });
    }

    console.log(`Found ${count || 0} unread notifications for user (ids: ${uniqueIds.join(', ')})`);

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

// Mark notification as read for a specific user
router.put('/user/:userId/:notificationId/read', async (req, res) => {
  try {
    const { userId: rawUserId, notificationId } = req.params;
    const userId = await resolveUserId(rawUserId) || rawUserId;

    console.log(`Marking notification ${notificationId} as read for user ${userId}`);

    // Update the notification status to read
    const { data, error } = await supabase
      .from('notifications')
      .update({
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('recipient_id', userId)
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

// Mark all notifications as read for a specific user
router.put('/user/:userId/mark-all-read', async (req, res) => {
  try {
    const { userId: rawUserId } = req.params;
    const resolvedId = await resolveUserId(rawUserId);
    const uniqueIds = [...new Set([resolvedId, rawUserId].filter(Boolean))];

    console.log(`Marking all notifications as read for user: ${uniqueIds.join(', ')}`);

    // Update all unread notifications to read status (recipient_id may be users.id or auth UID)
    const { data, error } = await supabase
      .from('notifications')
      .update({
        status: 'read',
        read_at: new Date().toISOString()
      })
      .in('recipient_id', uniqueIds)
      .eq('status', 'unread')
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
