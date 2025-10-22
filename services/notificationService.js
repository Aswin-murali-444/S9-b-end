const { supabase } = require('../lib/supabase');

/**
 * Create a notification for a user
 * @param {Object} notificationData - The notification data
 * @param {string} notificationData.type - Notification type (e.g., 'booking_assigned', 'service_completed')
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.message - Notification message
 * @param {string} notificationData.recipient_id - User ID to notify (updated field name)
 * @param {string} notificationData.sender_id - User ID of sender (optional)
 * @param {string} notificationData.status - Notification status (default: 'unread')
 * @param {string} notificationData.priority - Priority level (default: 'medium')
 * @param {Object} notificationData.metadata - Additional metadata
 * @param {string} notificationData.related_entity_type - Type of related entity
 * @param {string} notificationData.related_entity_id - ID of related entity
 * @returns {Promise<Object>} Created notification or error
 */
async function createNotification(notificationData) {
  try {
    const {
      type,
      title,
      message,
      recipient_id,
      sender_id = null,
      status = 'unread',
      priority = 'medium',
      metadata = {},
      related_entity_type = null,
      related_entity_id = null
    } = notificationData;

    // Validate required fields
    if (!type || !title || !message || !recipient_id) {
      throw new Error('Missing required notification fields: type, title, message, recipient_id');
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        type,
        title,
        message,
        recipient_id,
        sender_id,
        related_entity_type,
        related_entity_id,
        status,
        priority,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      throw error;
    }

    console.log(`Notification created successfully: ${type} for user ${recipient_id}`);
    return { success: true, data };

  } catch (error) {
    console.error('Failed to create notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a booking-related notification
 * @param {string} userId - User ID to notify
 * @param {string} bookingId - Booking ID
 * @param {string} eventType - Event type (assigned, confirmed, started, completed, cancelled)
 * @param {Object} bookingData - Booking data for context
 * @returns {Promise<Object>} Created notification or error
 */
async function createBookingNotification(userId, bookingId, eventType, bookingData = {}) {
  const notificationTemplates = {
    assigned: {
      type: 'booking_assigned',
      title: 'Service Provider Assigned',
      message: `A service provider has been assigned to your booking scheduled for ${bookingData.scheduled_date} at ${bookingData.scheduled_time}.`,
      priority: 'high'
    },
    confirmed: {
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: `Your booking scheduled for ${bookingData.scheduled_date} at ${bookingData.scheduled_time} has been confirmed by the service provider.`,
      priority: 'medium'
    },
    started: {
      type: 'service_started',
      title: 'Service Started',
      message: `Your service has started. The provider is on their way to ${bookingData.service_address}.`,
      priority: 'medium'
    },
    completed: {
      type: 'service_completed',
      title: 'Service Completed',
      message: `Your service has been completed successfully. Please rate your experience.`,
      priority: 'medium'
    },
    cancelled: {
      type: 'booking_cancelled',
      title: 'Booking Cancelled',
      message: `Your booking scheduled for ${bookingData.scheduled_date} has been cancelled.`,
      priority: 'high'
    }
  };

  const template = notificationTemplates[eventType];
  if (!template) {
    throw new Error(`Invalid booking event type: ${eventType}`);
  }

  return createNotification({
    ...template,
    recipient_id: userId,
    related_entity_type: 'booking',
    related_entity_id: bookingId,
    metadata: {
      booking_id: bookingId,
      event_type: eventType,
      scheduled_date: bookingData.scheduled_date,
      scheduled_time: bookingData.scheduled_time,
      service_address: bookingData.service_address,
      total_amount: bookingData.total_amount
    }
  });
}

/**
 * Create a payment-related notification
 * @param {string} userId - User ID to notify
 * @param {string} paymentId - Payment ID
 * @param {string} eventType - Event type (success, failed, refunded)
 * @param {Object} paymentData - Payment data for context
 * @returns {Promise<Object>} Created notification or error
 */
async function createPaymentNotification(userId, paymentId, eventType, paymentData = {}) {
  const notificationTemplates = {
    success: {
      type: 'payment_success',
      title: 'Payment Successful',
      message: `Your payment of ₹${paymentData.amount} has been processed successfully.`,
      priority: 'medium'
    },
    failed: {
      type: 'payment_failed',
      title: 'Payment Failed',
      message: `Your payment of ₹${paymentData.amount} could not be processed. Please try again.`,
      priority: 'high'
    },
    refunded: {
      type: 'payment_refunded',
      title: 'Payment Refunded',
      message: `Your payment of ₹${paymentData.amount} has been refunded to your account.`,
      priority: 'medium'
    }
  };

  const template = notificationTemplates[eventType];
  if (!template) {
    throw new Error(`Invalid payment event type: ${eventType}`);
  }

  return createNotification({
    ...template,
    recipient_id: userId,
    related_entity_type: 'payment',
    related_entity_id: paymentId,
    metadata: {
      payment_id: paymentId,
      event_type: eventType,
      amount: paymentData.amount,
      booking_id: paymentData.booking_id,
      payment_method: paymentData.payment_method
    }
  });
}

/**
 * Create a promotional notification
 * @param {string} userId - User ID to notify
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Created notification or error
 */
async function createPromotionalNotification(userId, title, message, metadata = {}) {
  return createNotification({
    type: 'promotion',
    title,
    message,
    recipient_id: userId,
    priority: 'low',
    metadata
  });
}

/**
 * Create a reminder notification
 * @param {string} userId - User ID to notify
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Created notification or error
 */
async function createReminderNotification(userId, title, message, metadata = {}) {
  return createNotification({
    type: 'reminder',
    title,
    message,
    recipient_id: userId,
    priority: 'medium',
    metadata
  });
}

/**
 * Create a system notification
 * @param {string} userId - User ID to notify
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {string} priority - Priority level
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Created notification or error
 */
async function createSystemNotification(userId, title, message, priority = 'medium', metadata = {}) {
  return createNotification({
    type: 'system',
    title,
    message,
    recipient_id: userId,
    priority,
    metadata
  });
}

/**
 * Create a welcome notification for new users
 * @param {string} userId - User ID to notify
 * @param {string} userName - User's name
 * @returns {Promise<Object>} Created notification or error
 */
async function createWelcomeNotification(userId, userName = 'there') {
  return createNotification({
    type: 'welcome',
    title: 'Welcome to S9 Mini2!',
    message: `Welcome ${userName}! We're excited to have you on board. Complete your profile to get started with our services.`,
    recipient_id: userId,
    priority: 'medium',
    metadata: {
      welcome_date: new Date().toISOString(),
      user_name: userName
    }
  });
}

/**
 * Create a profile completion notification
 * @param {string} userId - User ID to notify
 * @param {string} profileType - Type of profile completed
 * @returns {Promise<Object>} Created notification or error
 */
async function createProfileCompletionNotification(userId, profileType = 'user') {
  const messages = {
    user: 'Your profile has been completed successfully!',
    provider: 'Your service provider profile has been completed and is under review. You will be notified once verified.'
  };

  return createNotification({
    type: 'profile_completed',
    title: 'Profile Completed',
    message: messages[profileType] || messages.user,
    recipient_id: userId,
    priority: 'medium',
    metadata: {
      profile_type: profileType,
      completion_date: new Date().toISOString()
    }
  });
}

/**
 * Create a verification status notification
 * @param {string} userId - User ID to notify
 * @param {string} status - Verification status
 * @param {string} notes - Additional notes
 * @returns {Promise<Object>} Created notification or error
 */
async function createVerificationNotification(userId, status, notes = '') {
  const statusMessages = {
    verified: 'Congratulations! Your profile has been verified and approved.',
    rejected: 'Your profile verification was not approved. Please review and resubmit.',
    pending: 'Your profile is under review. We will notify you once verification is complete.'
  };

  return createNotification({
    type: 'verification_status',
    title: 'Verification Status Update',
    message: statusMessages[status] || 'Your verification status has been updated.',
    recipient_id: userId,
    priority: status === 'verified' ? 'high' : 'medium',
    metadata: {
      verification_status: status,
      verification_notes: notes,
      updated_at: new Date().toISOString()
    }
  });
}

/**
 * Get notification statistics for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Notification statistics
 */
async function getNotificationStats(userId) {
  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('type, status, priority, created_at')
      .eq('recipient_id', userId);

    if (error) {
      throw error;
    }

    const stats = {
      total: notifications.length,
      unread: notifications.filter(n => n.status === 'unread').length,
      byType: {},
      byStatus: {},
      byPriority: {},
      recent: notifications
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5)
    };

    notifications.forEach(notification => {
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      stats.byStatus[notification.status] = (stats.byStatus[notification.status] || 0) + 1;
      stats.byPriority[notification.priority] = (stats.byPriority[notification.priority] || 0) + 1;
    });

    return { success: true, data: stats };
  } catch (error) {
    console.error('Error getting notification stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark notification as read
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User ID (for security)
 * @returns {Promise<Object>} Success or error
 */
async function markAsRead(notificationId, userId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('recipient_id', userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark all notifications as read for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Success or error
 */
async function markAllAsRead(userId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('recipient_id', userId)
      .eq('status', 'unread');

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Dismiss a notification
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User ID (for security)
 * @returns {Promise<Object>} Success or error
 */
async function dismissNotification(notificationId, userId) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ 
        status: 'dismissed',
        dismissed_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('recipient_id', userId);

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error dismissing notification:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createNotification,
  createBookingNotification,
  createPaymentNotification,
  createPromotionalNotification,
  createReminderNotification,
  createSystemNotification,
  createWelcomeNotification,
  createProfileCompletionNotification,
  createVerificationNotification,
  getNotificationStats,
  markAsRead,
  markAllAsRead,
  dismissNotification
};
