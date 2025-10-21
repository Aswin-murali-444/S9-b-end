const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');

// Get all notifications (for admin dashboard)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('notifications')
      .select(`
        *,
        provider:provider_id(
          id,
          email,
          user_profiles!inner(
            first_name,
            last_name,
            phone
          )
        ),
        admin_user:admin_user_id(
          id,
          email,
          user_profiles!inner(
            first_name,
            last_name
          )
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
    const { data, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'unread');

    if (error) {
      console.error('Get unread count error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      data: {
        unread_count: data?.length || 0
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

    const { data, error } = await supabase
      .from('notifications')
      .update({
        status: 'read',
        read_at: new Date().toISOString(),
        admin_user_id: adminUserId
      })
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

    const { data, error } = await supabase
      .from('notifications')
      .update({
        status: 'read',
        read_at: new Date().toISOString(),
        admin_user_id: adminUserId
      })
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

// Dismiss notification
router.put('/:notificationId/dismiss', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { adminUserId } = req.body;

    const { data, error } = await supabase
      .from('notifications')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
        admin_user_id: adminUserId
      })
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

// Get notifications for a specific provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

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

module.exports = router;
