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
      metadata = {}
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
 * Create a team-related notification
 * @param {string} userId - User ID to notify
 * @param {string} teamId - Team ID
 * @param {string} eventType - Event type (created, joined, left, updated)
 * @param {Object} teamData - Team data for context
 * @returns {Promise<Object>} Created notification or error
 */
async function createTeamNotification(userId, teamId, eventType, teamData = {}) {
  const notificationTemplates = {
    created: {
      type: 'team_created',
      title: 'Team Created Successfully',
      message: `You have been assigned as ${teamData.role === 'leader' ? 'Team Leader' : 'Team Member'} of "${teamData.team_name}". Team details: ${teamData.description || 'No description provided'}.`,
      priority: 'high'
    },
    joined: {
      type: 'team_joined',
      title: 'Added to Team',
      message: `You have been added to team "${teamData.team_name}" as a ${teamData.role}.`,
      priority: 'medium'
    },
    left: {
      type: 'team_left',
      title: 'Removed from Team',
      message: `You have been removed from team "${teamData.team_name}".`,
      priority: 'medium'
    },
    updated: {
      type: 'team_updated',
      title: 'Team Updated',
      message: `Team "${teamData.team_name}" has been updated. Please check the latest changes.`,
      priority: 'low'
    }
  };

  const template = notificationTemplates[eventType];
  if (!template) {
    throw new Error(`Invalid team event type: ${eventType}`);
  }

  return createNotification({
    ...template,
    recipient_id: userId,
    metadata: {
      team_id: teamId,
      event_type: eventType,
      team_name: teamData.team_name,
      team_description: teamData.description,
      role: teamData.role,
      max_members: teamData.max_members,
      service_category: teamData.service_category,
      service_name: teamData.service_name
    }
  });
}

/**
 * Send "team job assigned" notifications to all assigned team members
 * @param {string[]} memberUserIds - Array of user IDs (assigned_members)
 * @param {Object} payload - { assignmentId, bookingId, teamName, scheduled_date, scheduled_time, service_address }
 * @returns {Promise<Array>} Array of { user_id, success, error? }
 */
async function sendTeamJobAssignedNotifications(memberUserIds, payload) {
  const {
    assignmentId,
    bookingId,
    teamName,
    scheduled_date,
    scheduled_time,
    service_address,
    service_name
  } = payload;

  const notifications = [];
  
  // Format date nicely (e.g., "Feb 4, 2026" instead of "2026-02-04")
  let dateStr = 'TBD';
  if (scheduled_date) {
    try {
      const date = new Date(scheduled_date + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      } else {
        dateStr = scheduled_date;
      }
    } catch {
      dateStr = scheduled_date;
    }
  }
  
  const timeStr = scheduled_time || '';
  const addressStr = service_address || 'Address TBD';
  const serviceStr = service_name ? ` (${service_name})` : '';
  const timePart = timeStr ? ` at ${timeStr}` : '';
  const message = `Your team "${teamName || 'Team'}" has been assigned a job${serviceStr} on ${dateStr}${timePart}, ${addressStr}. Please accept or decline in your dashboard.`;

  for (const userId of memberUserIds) {
    try {
      const result = await createNotification({
        type: 'team_job_assigned',
        title: 'New team job – action required',
        message,
        recipient_id: userId,
        sender_id: null,
        status: 'unread',
        priority: 'high',
        metadata: {
          team_assignment_id: assignmentId,
          booking_id: bookingId,
          team_name: teamName,
          scheduled_date: dateStr,
          scheduled_time: timeStr,
          service_address: addressStr,
          service_name: service_name || null,
          action_required: 'accept_or_decline'
        }
      });
      notifications.push({ user_id: userId, success: result.success, error: result.error });
    } catch (error) {
      console.error(`Failed to send team job notification to user ${userId}:`, error);
      notifications.push({ user_id: userId, success: false, error: error.message });
    }
  }
  return notifications;
}

/**
 * Helper to format booking date/time/address for messages
 */
function formatBookingContext(scheduled_date, scheduled_time, service_address) {
  // Format date nicely (e.g., "Feb 4, 2026" instead of "2026-02-04")
  let dateStr = 'TBD';
  if (scheduled_date) {
    try {
      const date = new Date(scheduled_date + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      } else {
        dateStr = scheduled_date;
      }
    } catch {
      dateStr = scheduled_date;
    }
  }

  const timeStr = scheduled_time || '';
  const addressStr = service_address || 'Address TBD';
  const timePart = timeStr ? ` at ${timeStr}` : '';

  return { dateStr, timeStr, addressStr, timePart };
}

/**
 * Send "new booking available" notifications to team members (when booking is created, before assignment)
 * @param {string[]} memberUserIds - Array of user IDs (team members)
 * @param {Object} payload - { bookingId, serviceName, scheduled_date, scheduled_time, service_address, category_id, service_id }
 * @returns {Promise<Array>} Array of { user_id, success, error? }
 */
async function sendNewBookingTeamNotifications(memberUserIds, payload) {
  const {
    bookingId,
    serviceName,
    scheduled_date,
    scheduled_time,
    service_address
  } = payload;

  const notifications = [];

  const { dateStr, timeStr, addressStr, timePart } = formatBookingContext(
    scheduled_date,
    scheduled_time,
    service_address
  );

  const serviceStr = serviceName ? ` for ${serviceName}` : '';
  const message = `A new job${serviceStr} is available on ${dateStr}${timePart}, ${addressStr}. Check your dashboard for details.`;

  for (const userId of memberUserIds) {
    try {
      const result = await createNotification({
        type: 'team_job_available',
        title: 'New job available for your team',
        message,
        recipient_id: userId,
        sender_id: null,
        status: 'unread',
        priority: 'medium',
        metadata: {
          booking_id: bookingId,
          scheduled_date: dateStr,
          scheduled_time: timeStr,
          service_address: addressStr,
          service_name: serviceName || null
        }
      });
      notifications.push({ user_id: userId, success: result.success, error: result.error });
    } catch (error) {
      console.error(`Failed to send new booking notification to user ${userId}:`, error);
      notifications.push({ user_id: userId, success: false, error: error.message });
    }
  }
  return notifications;
}

/**
 * Send "new booking available" notifications directly to individual service providers
 * (matched by their specialization in service_provider_details)
 * @param {string[]} providerUserIds - Array of user IDs (providers)
 * @param {Object} payload - { bookingId, serviceName, scheduled_date, scheduled_time, service_address }
 * @returns {Promise<Array>} Array of { user_id, success, error? }
 */
async function sendNewBookingProviderNotifications(providerUserIds, payload) {
  const {
    bookingId,
    serviceName,
    scheduled_date,
    scheduled_time,
    service_address
  } = payload;

  const notifications = [];

  const { dateStr, timeStr, addressStr, timePart } = formatBookingContext(
    scheduled_date,
    scheduled_time,
    service_address
  );

  const serviceLabel = serviceName || 'service booking';
  const message = `You have a new booking for ${serviceLabel} on ${dateStr}${timePart}, ${addressStr}. Check your dashboard to review and accept the job.`;

  for (const userId of providerUserIds) {
    try {
      const result = await createNotification({
        type: 'booking_pending',
        title: `New job: ${serviceLabel}`,
        message,
        recipient_id: userId,
        sender_id: null,
        status: 'unread',
        priority: 'high',
        metadata: {
          booking_id: bookingId,
          scheduled_date: dateStr,
          scheduled_time: timeStr,
          service_address: addressStr,
          service_name: serviceName || null,
          role: 'service_provider'
        }
      });
      notifications.push({ user_id: userId, success: result.success, error: result.error });
    } catch (error) {
      console.error(`Failed to send new booking notification to provider ${userId}:`, error);
      notifications.push({ user_id: userId, success: false, error: error.message });
    }
  }

  return notifications;
}

/**
 * Send team creation notifications to all team members
 * @param {Array} teamMembers - Array of team member data
 * @param {Object} teamData - Team information
 * @returns {Promise<Array>} Array of notification results
 */
async function sendTeamCreationNotifications(teamMembers, teamData) {
  const notifications = [];
  
  for (const member of teamMembers) {
    try {
      const notification = await createTeamNotification(
        member.user_id,
        teamData.id,
        'created',
        {
          team_name: teamData.name,
          description: teamData.description,
          role: member.role,
          max_members: teamData.max_members,
          service_category: teamData.service_category,
          service_name: teamData.service_name
        }
      );
      
      notifications.push({
        user_id: member.user_id,
        success: notification.success,
        error: notification.error
      });
    } catch (error) {
      console.error(`Failed to send notification to user ${member.user_id}:`, error);
      notifications.push({
        user_id: member.user_id,
        success: false,
        error: error.message
      });
    }
  }
  
  return notifications;
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

/**
 * Notify all active admins when all team members have accepted an assignment
 * @param {Object} payload - { bookingId, teamName, serviceName, scheduled_date, scheduled_time, customerName?, workers: [{ name }] }
 */
async function notifyAdminsTeamAllAccepted(payload) {
  const { bookingId, teamName, serviceName, scheduled_date, scheduled_time, customerName, workers = [] } = payload;
  const workerList = workers.length ? workers.map((w, i) => `${i + 1}. ${w.name}`).join(', ') : 'Team members';
  const dateStr = scheduled_date || 'TBD';
  const timeStr = scheduled_time ? ` at ${scheduled_time}` : '';
  const serviceStr = serviceName ? ` (${serviceName})` : '';
  const message = `All workers have accepted: booking${serviceStr} on ${dateStr}${timeStr}. Team: ${teamName || 'Team'}. Accepted: ${workerList}.${customerName ? ` Customer: ${customerName}.` : ''}`;
  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active');
    if (error || !admins?.length) return { success: true };
    for (const admin of admins) {
      await createNotification({
        type: 'team_all_accepted',
        title: 'Team accepted – all workers confirmed',
        message,
        recipient_id: admin.id,
        sender_id: null,
        status: 'unread',
        priority: 'high',
        metadata: { booking_id: bookingId, team_name: teamName, workers: workers.map(w => ({ name: w.name })) }
      });
    }
    return { success: true };
  } catch (e) {
    console.error('Failed to notify admins (team all accepted):', e);
    return { success: false, error: e.message };
  }
}

/**
 * Notify customer when all team members have accepted (workers confirmed)
 * @param {string} customerUserId - users.id of the customer
 * @param {Object} payload - { bookingId, teamName, serviceName, scheduled_date, scheduled_time, workers: [{ name }] }
 */
async function sendTeamAllAcceptedToCustomerNotification(customerUserId, payload) {
  if (!customerUserId) return { success: false, error: 'customerUserId required' };
  const { bookingId, teamName, serviceName, scheduled_date, scheduled_time, workers = [] } = payload;
  const workerList = workers.length ? workers.map((w, i) => `${i + 1}. ${w.name}`).join(', ') : 'All team members';
  const dateStr = scheduled_date || 'TBD';
  const timeStr = scheduled_time ? ` at ${scheduled_time}` : '';
  const serviceStr = serviceName ? ` (${serviceName})` : '';
  const message = `All assigned workers have accepted your booking${serviceStr} on ${dateStr}${timeStr}. Team: ${teamName || 'Team'}. Confirmed: ${workerList}.`;
  return createNotification({
    type: 'team_all_accepted_customer',
    title: 'Team confirmed – all workers accepted',
    message,
    recipient_id: customerUserId,
    sender_id: null,
    status: 'unread',
    priority: 'high',
    metadata: { booking_id: bookingId, team_name: teamName, workers: workers.map(w => ({ name: w.name })) }
  });
}

/**
 * Notify all active admins when a worker has declined a team assignment
 * @param {Object} payload - { bookingId, teamName, serviceName, scheduled_date, scheduled_time, workerName, customerName? }
 */
async function notifyAdminsWorkerDeclined(payload) {
  const { bookingId, teamName, serviceName, scheduled_date, scheduled_time, workerName, customerName } = payload;
  const dateStr = scheduled_date || 'TBD';
  const timeStr = scheduled_time ? ` at ${scheduled_time}` : '';
  const serviceStr = serviceName ? ` (${serviceName})` : '';
  const message = `Worker "${workerName || 'A team member'}" has declined the team assignment for booking${serviceStr} on ${dateStr}${timeStr}. Team: ${teamName || 'Team'}.${customerName ? ` Customer: ${customerName}.` : ''} You may need to assign a different team or member.`;
  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active');
    if (error || !admins?.length) return { success: true };
    for (const admin of admins) {
      await createNotification({
        type: 'worker_declined_team',
        title: 'Worker declined team assignment',
        message,
        recipient_id: admin.id,
        sender_id: null,
        status: 'unread',
        priority: 'high',
        metadata: { booking_id: bookingId, team_name: teamName, worker_name: workerName }
      });
    }
    return { success: true };
  } catch (e) {
    console.error('Failed to notify admins (worker declined):', e);
    return { success: false, error: e.message };
  }
}

/**
 * Notify all active admins when a provider submits a time off / leave request
 * @param {Object} payload - { providerId, providerName, start_date, end_date, status, reason }
 */
async function notifyAdminsProviderTimeOffCreated(payload) {
  const { providerId, providerName, start_date, end_date, status, reason } = payload;
  const start = start_date;
  const hasRange = end_date && end_date !== start_date;
  const dateRange = hasRange ? `${start} to ${end_date}` : start;
  const statusLabel = status || 'pending';
  const baseName = providerName || providerId || 'Service provider';

  const messageParts = [
    `${baseName} has submitted a time off request for ${dateRange}.`,
    `Status: ${statusLabel}.`
  ];
  if (reason) {
    messageParts.push(`Reason: ${reason}`);
  }
  const message = messageParts.join(' ');

  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active');

    if (error || !admins?.length) return { success: true };

    for (const admin of admins) {
      await createNotification({
        type: 'provider_time_off_request',
        title: 'New provider time off request',
        message,
        recipient_id: admin.id,
        sender_id: providerId || null,
        status: 'unread',
        priority: 'high',
        metadata: {
          provider_id: providerId,
          provider_name: providerName || null,
          start_date,
          end_date,
          status: statusLabel,
          reason: reason || null
        }
      });
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to notify admins (provider time off):', e);
    return { success: false, error: e.message };
  }
}

/**
 * Notify a provider when their time off / leave request has been approved or rejected
 * @param {string} providerId - users.id of the provider
 * @param {Object} payload - { start_date, end_date, status }
 */
async function notifyProviderLeaveDecision(providerId, payload) {
  if (!providerId) return { success: false, error: 'providerId required' };
  const { start_date, end_date, status } = payload || {};
  const sameDay = start_date && end_date && start_date === end_date;
  const rangeLabel = sameDay || !end_date ? start_date : `${start_date} to ${end_date}`;
  const statusLabel = (status || 'pending').toLowerCase();
  const isApproved = statusLabel === 'approved';
  const title = isApproved ? 'Leave request approved' : 'Leave request not approved';
  const message = isApproved
    ? `Your leave request for ${rangeLabel} has been approved. You will not be assigned work on these days.`
    : `Your leave request for ${rangeLabel} was not approved. Please check with the admin if you have questions.`;

  try {
    const notification = await createNotification({
      type: 'provider_leave_decision',
      title,
      message,
      recipient_id: providerId,
      sender_id: null,
      status: 'unread',
      priority: isApproved ? 'high' : 'medium',
      metadata: {
        start_date,
        end_date,
        status: statusLabel
      }
    });
    return { success: true, data: notification };
  } catch (e) {
    console.error('Failed to notify provider of leave decision:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Notify all active admins when a provider updates availability with specific dates/times
 * @param {Object} payload - { providerId, providerName, slots: [{ date, day, start, end }] }
 */
async function notifyAdminsProviderAvailabilityUpdated(payload) {
  const { providerId, providerName, slots = [] } = payload || {};
  if (!Array.isArray(slots) || slots.length === 0) {
    return { success: true };
  }

  const baseName = providerName || providerId || 'Service provider';
  const slotSummaries = slots.map((s) => {
    const dayLabel = s.day
      ? s.day.charAt(0).toUpperCase() + s.day.slice(1)
      : '';
    const datePart = s.date || '';
    const timePart =
      s.start && s.end ? `, ${s.start}–${s.end}` : '';
    return `${dayLabel} ${datePart}${timePart}`.trim();
  });

  const message = `${baseName} has updated their availability for the following slots: ${slotSummaries.join(
    '; '
  )}.`;

  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active');

    if (error || !admins?.length) return { success: true };

    for (const admin of admins) {
      await createNotification({
        type: 'provider_availability_updated',
        title: 'Provider availability updated',
        message,
        recipient_id: admin.id,
        sender_id: providerId || null,
        status: 'unread',
        priority: 'medium',
        metadata: {
          provider_id: providerId,
          provider_name: providerName || null,
          slots
        }
      });
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to notify admins (provider availability updated):', e);
    return { success: false, error: e.message };
  }
}

/**
 * Notify customer when a worker has declined the team assignment
 * @param {string} customerUserId - users.id of the customer
 * @param {Object} payload - { bookingId, teamName, serviceName, scheduled_date, scheduled_time, workerName }
 */
async function sendWorkerDeclinedToCustomerNotification(customerUserId, payload) {
  if (!customerUserId) return { success: false, error: 'customerUserId required' };
  const { bookingId, teamName, serviceName, scheduled_date, scheduled_time, workerName } = payload;
  const dateStr = scheduled_date || 'TBD';
  const timeStr = scheduled_time ? ` at ${scheduled_time}` : '';
  const serviceStr = serviceName ? ` (${serviceName})` : '';
  const message = `A team member (${workerName || 'worker'}) has declined the assignment for your booking${serviceStr} on ${dateStr}${timeStr}. We will assign a new team or update you shortly.`;
  return createNotification({
    type: 'worker_declined_customer',
    title: 'Team member declined – we\'ll reassign',
    message,
    recipient_id: customerUserId,
    sender_id: null,
    status: 'unread',
    priority: 'high',
    metadata: { booking_id: bookingId, team_name: teamName, worker_name: workerName }
  });
}

/**
 * Notify all active admins when a booking has been completed
 * @param {Object} payload - { bookingId, serviceName?, customerName?, providerName?, totalAmount?, scheduled_date?, scheduled_time? }
 */
async function notifyAdminsBookingCompleted(payload) {
  const {
    bookingId,
    serviceName,
    customerName,
    providerName,
    totalAmount,
    scheduled_date,
    scheduled_time
  } = payload || {};

  const serviceStr = serviceName ? ` for ${serviceName}` : '';
  const customerStr = customerName ? ` Customer: ${customerName}.` : '';
  const providerStr = providerName ? ` Worker: ${providerName}.` : '';
  const amountStr = Number(totalAmount) ? ` Amount: ₹${Number(totalAmount).toFixed(2)}.` : '';

  let datePart = '';
  if (scheduled_date) {
    datePart = scheduled_date;
    if (scheduled_time) {
      datePart += ` at ${scheduled_time}`;
    }
  }

  const message = `Booking ${bookingId}${serviceStr} has been completed${datePart ? ` on ${datePart}` : ''}.${customerStr}${providerStr}${amountStr}`;

  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active');

    if (error || !admins?.length) return { success: true };

    for (const admin of admins) {
      await createNotification({
        type: 'booking_completed_admin',
        title: 'Booking completed',
        message,
        recipient_id: admin.id,
        sender_id: null,
        status: 'unread',
        priority: 'high',
        metadata: {
          booking_id: bookingId,
          service_name: serviceName || null,
          customer_name: customerName || null,
          provider_name: providerName || null,
          total_amount: totalAmount || null,
          scheduled_date,
          scheduled_time
        }
      });
    }

    return { success: true };
  } catch (e) {
    console.error('Failed to notify admins (booking completed):', e);
    return { success: false, error: e.message };
  }
}

/**
 * Notify customer when a team is assigned to their booking (with worker details)
 * @param {string} customerUserId - users.id of the customer (bookings.user_id)
 * @param {Object} payload - { bookingId, teamName, serviceName, scheduled_date, scheduled_time, service_address, workers: [{ name, phone, email? }] }
 */
async function sendTeamAssignedToCustomerNotification(customerUserId, payload) {
  if (!customerUserId) return { success: false, error: 'customerUserId required' };
  const { bookingId, teamName, serviceName, scheduled_date, scheduled_time, service_address, workers = [] } = payload;
  const workerList = workers.length
    ? workers.map((w, i) => `${i + 1}. ${w.name}${w.phone ? ` – ${w.phone}` : ''}`).join('\n')
    : 'Team members will be confirmed once they accept.';
  const dateStr = scheduled_date || 'TBD';
  const timeStr = scheduled_time ? ` at ${scheduled_time}` : '';
  const addressStr = service_address || 'Address TBD';
  const serviceStr = serviceName ? ` (${serviceName})` : '';
  const message = `Your booking${serviceStr} on ${dateStr}${timeStr}, ${addressStr} has been assigned to team "${teamName || 'Team'}". Assigned workers:\n${workerList}`;
  return createNotification({
    type: 'team_assigned_to_booking',
    title: 'Team assigned to your booking',
    message,
    recipient_id: customerUserId,
    sender_id: null,
    status: 'unread',
    priority: 'high',
    metadata: {
      booking_id: bookingId,
      team_name: teamName,
      scheduled_date: dateStr,
      scheduled_time: scheduled_time || null,
      service_address: service_address || null,
      workers: workers.map(w => ({ name: w.name, phone: w.phone || null, email: w.email || null }))
    }
  });
}

module.exports = {
  createNotification,
  createBookingNotification,
  createPaymentNotification,
  createPromotionalNotification,
  createReminderNotification,
  createSystemNotification,
  createTeamNotification,
  sendTeamCreationNotifications,
  sendTeamJobAssignedNotifications,
  sendNewBookingTeamNotifications,
  createWelcomeNotification,
  createProfileCompletionNotification,
  createVerificationNotification,
  getNotificationStats,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  sendNewBookingProviderNotifications,
  sendTeamAssignedToCustomerNotification,
  notifyAdminsTeamAllAccepted,
  sendTeamAllAcceptedToCustomerNotification,
  notifyAdminsWorkerDeclined,
  sendWorkerDeclinedToCustomerNotification,
  notifyAdminsProviderTimeOffCreated,
  notifyAdminsProviderAvailabilityUpdated,
  notifyProviderLeaveDecision,
  notifyAdminsBookingCompleted
};
