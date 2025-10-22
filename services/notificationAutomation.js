const { supabase } = require('../lib/supabase');
const { createNotification, createBookingNotification, createPaymentNotification } = require('./notificationService');

/**
 * Comprehensive Notification Automation System
 * This service automatically creates notifications based on system actions
 * without interfering with existing functionality
 */

class NotificationAutomation {
  constructor() {
    this.eventHandlers = new Map();
    this.setupEventHandlers();
  }

  /**
   * Setup all event handlers for different system actions
   */
  setupEventHandlers() {
    // User Registration & Profile Events
    this.eventHandlers.set('user_registered', this.handleUserRegistration.bind(this));
    this.eventHandlers.set('profile_completed', this.handleProfileCompletion.bind(this));
    this.eventHandlers.set('profile_updated', this.handleProfileUpdate.bind(this));
    
    // Booking Events
    this.eventHandlers.set('booking_created', this.handleBookingCreated.bind(this));
    this.eventHandlers.set('booking_assigned', this.handleBookingAssigned.bind(this));
    this.eventHandlers.set('booking_confirmed', this.handleBookingConfirmed.bind(this));
    this.eventHandlers.set('booking_started', this.handleBookingStarted.bind(this));
    this.eventHandlers.set('booking_completed', this.handleBookingCompleted.bind(this));
    this.eventHandlers.set('booking_cancelled', this.handleBookingCancelled.bind(this));
    
    // Payment Events
    this.eventHandlers.set('payment_success', this.handlePaymentSuccess.bind(this));
    this.eventHandlers.set('payment_failed', this.handlePaymentFailed.bind(this));
    this.eventHandlers.set('payment_refunded', this.handlePaymentRefunded.bind(this));
    
    // Provider Events
    this.eventHandlers.set('provider_verified', this.handleProviderVerified.bind(this));
    this.eventHandlers.set('provider_suspended', this.handleProviderSuspended.bind(this));
    this.eventHandlers.set('provider_reactivated', this.handleProviderReactivated.bind(this));
    
    // Service Events
    this.eventHandlers.set('service_created', this.handleServiceCreated.bind(this));
    this.eventHandlers.set('service_updated', this.handleServiceUpdated.bind(this));
    
    // Team Events
    this.eventHandlers.set('team_created', this.handleTeamCreated.bind(this));
    this.eventHandlers.set('team_member_added', this.handleTeamMemberAdded.bind(this));
    this.eventHandlers.set('team_member_removed', this.handleTeamMemberRemoved.bind(this));
    
    // System Events
    this.eventHandlers.set('maintenance_scheduled', this.handleMaintenanceScheduled.bind(this));
    this.eventHandlers.set('system_update', this.handleSystemUpdate.bind(this));
  }

  /**
   * Main method to trigger notifications based on events
   * @param {string} eventType - Type of event that occurred
   * @param {Object} eventData - Data related to the event
   * @param {Object} options - Additional options for notification
   */
  async triggerNotification(eventType, eventData = {}, options = {}) {
    try {
      console.log(`🔔 Triggering notification for event: ${eventType}`);
      
      const handler = this.eventHandlers.get(eventType);
      if (!handler) {
        console.warn(`No handler found for event type: ${eventType}`);
        return { success: false, error: `No handler for event: ${eventType}` };
      }

      const result = await handler(eventData, options);
      console.log(`✅ Notification triggered successfully for: ${eventType}`);
      return result;
    } catch (error) {
      console.error(`❌ Error triggering notification for ${eventType}:`, error);
      return { success: false, error: error.message };
    }
  }

  // ==================== USER EVENTS ====================

  async handleUserRegistration(eventData, options = {}) {
    const { userId, userEmail, userName } = eventData;
    
    // Notify user about successful registration
    await createNotification({
      type: 'welcome',
      title: 'Welcome to S9 Mini2!',
      message: `Welcome ${userName || 'to our platform'}! Your account has been created successfully. Complete your profile to get started.`,
      recipient_id: userId,
      priority: 'medium',
      metadata: {
        event_type: 'user_registration',
        user_email: userEmail,
        registration_date: new Date().toISOString()
      }
    });

    // Notify admins about new user registration
    await this.notifyAdmins({
      type: 'new_user_registration',
      title: 'New User Registration',
      message: `A new user has registered: ${userEmail}`,
      priority: 'low',
      metadata: {
        user_id: userId,
        user_email: userEmail,
        registration_date: new Date().toISOString()
      }
    });

    return { success: true };
  }

  async handleProfileCompletion(eventData, options = {}) {
    const { userId, profileType, providerId } = eventData;
    
    if (profileType === 'provider') {
      // Notify provider about profile completion
      await createNotification({
        type: 'profile_completed',
        title: 'Profile Completed Successfully',
        message: 'Your service provider profile has been completed and is under review. You will be notified once verified.',
        recipient_id: providerId,
        priority: 'medium',
        metadata: {
          event_type: 'profile_completion',
          profile_type: 'provider',
          completion_date: new Date().toISOString()
        }
      });

      // Notify admins about profile completion (existing trigger handles this)
      console.log('Provider profile completion notification will be handled by database trigger');
    } else {
      // Regular user profile completion
      await createNotification({
        type: 'profile_completed',
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully.',
        recipient_id: userId,
        priority: 'low',
        metadata: {
          event_type: 'profile_completion',
          profile_type: 'user',
          completion_date: new Date().toISOString()
        }
      });
    }

    return { success: true };
  }

  async handleProfileUpdate(eventData, options = {}) {
    const { userId, updateType, changes } = eventData;
    
    await createNotification({
      type: 'profile_updated',
      title: 'Profile Updated',
      message: `Your profile has been updated: ${updateType}`,
      recipient_id: userId,
      priority: 'low',
      metadata: {
        event_type: 'profile_update',
        update_type: updateType,
        changes: changes,
        updated_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  // ==================== BOOKING EVENTS ====================

  async handleBookingCreated(eventData, options = {}) {
    const { userId, bookingId, bookingData } = eventData;
    
    await createBookingNotification(userId, bookingId, 'pending', bookingData);
    
    // Notify admins about new booking
    await this.notifyAdmins({
      type: 'new_booking',
      title: 'New Booking Request',
      message: `A new booking has been created for ${bookingData.scheduled_date} at ${bookingData.scheduled_time}`,
      priority: 'medium',
      metadata: {
        booking_id: bookingId,
        user_id: userId,
        scheduled_date: bookingData.scheduled_date,
        scheduled_time: bookingData.scheduled_time,
        total_amount: bookingData.total_amount
      }
    });

    return { success: true };
  }

  async handleBookingAssigned(eventData, options = {}) {
    const { userId, providerId, bookingId, bookingData } = eventData;
    
    // Notify customer
    await createBookingNotification(userId, bookingId, 'assigned', bookingData);
    
    // Notify provider
    await createNotification({
      type: 'booking_assigned_provider',
      title: 'New Booking Assignment',
      message: `You have been assigned a new booking for ${bookingData.scheduled_date} at ${bookingData.scheduled_time}`,
      recipient_id: providerId,
      priority: 'high',
      metadata: {
        booking_id: bookingId,
        user_id: userId,
        scheduled_date: bookingData.scheduled_date,
        scheduled_time: bookingData.scheduled_time,
        service_address: bookingData.service_address,
        total_amount: bookingData.total_amount
      }
    });

    return { success: true };
  }

  async handleBookingConfirmed(eventData, options = {}) {
    const { userId, providerId, bookingId, bookingData } = eventData;
    
    // Notify customer
    await createBookingNotification(userId, bookingId, 'confirmed', bookingData);
    
    // Notify provider
    await createNotification({
      type: 'booking_confirmed_provider',
      title: 'Booking Confirmed',
      message: `Your booking for ${bookingData.scheduled_date} has been confirmed by the customer.`,
      recipient_id: providerId,
      priority: 'medium',
      metadata: {
        booking_id: bookingId,
        user_id: userId,
        scheduled_date: bookingData.scheduled_date,
        scheduled_time: bookingData.scheduled_time
      }
    });

    return { success: true };
  }

  async handleBookingStarted(eventData, options = {}) {
    const { userId, providerId, bookingId, bookingData } = eventData;
    
    // Notify customer
    await createBookingNotification(userId, bookingId, 'started', bookingData);
    
    // Notify provider
    await createNotification({
      type: 'service_started_provider',
      title: 'Service Started',
      message: `Service has started for booking on ${bookingData.scheduled_date}`,
      recipient_id: providerId,
      priority: 'medium',
      metadata: {
        booking_id: bookingId,
        user_id: userId,
        started_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  async handleBookingCompleted(eventData, options = {}) {
    const { userId, providerId, bookingId, bookingData } = eventData;
    
    // Notify customer
    await createBookingNotification(userId, bookingId, 'completed', bookingData);
    
    // Notify provider
    await createNotification({
      type: 'service_completed_provider',
      title: 'Service Completed',
      message: `Service completed successfully for booking on ${bookingData.scheduled_date}. Payment will be processed shortly.`,
      recipient_id: providerId,
      priority: 'medium',
      metadata: {
        booking_id: bookingId,
        user_id: userId,
        completed_at: new Date().toISOString(),
        total_amount: bookingData.total_amount
      }
    });

    return { success: true };
  }

  async handleBookingCancelled(eventData, options = {}) {
    const { userId, providerId, bookingId, bookingData, cancellationReason } = eventData;
    
    // Notify customer
    await createBookingNotification(userId, bookingId, 'cancelled', bookingData);
    
    // Notify provider if they were assigned
    if (providerId) {
      await createNotification({
        type: 'booking_cancelled_provider',
        title: 'Booking Cancelled',
        message: `Booking for ${bookingData.scheduled_date} has been cancelled. Reason: ${cancellationReason || 'Not specified'}`,
        recipient_id: providerId,
        priority: 'medium',
        metadata: {
          booking_id: bookingId,
          user_id: userId,
          cancellation_reason: cancellationReason,
          cancelled_at: new Date().toISOString()
        }
      });
    }

    return { success: true };
  }

  // ==================== PAYMENT EVENTS ====================

  async handlePaymentSuccess(eventData, options = {}) {
    const { userId, paymentId, paymentData } = eventData;
    
    await createPaymentNotification(userId, paymentId, 'success', paymentData);
    
    // Notify admins about successful payment
    await this.notifyAdmins({
      type: 'payment_success',
      title: 'Payment Processed Successfully',
      message: `Payment of ₹${paymentData.amount} processed successfully`,
      priority: 'low',
      metadata: {
        payment_id: paymentId,
        user_id: userId,
        amount: paymentData.amount,
        booking_id: paymentData.booking_id,
        payment_method: paymentData.payment_method
      }
    });

    return { success: true };
  }

  async handlePaymentFailed(eventData, options = {}) {
    const { userId, paymentId, paymentData, failureReason } = eventData;
    
    await createPaymentNotification(userId, paymentId, 'failed', paymentData);
    
    // Notify admins about failed payment
    await this.notifyAdmins({
      type: 'payment_failed',
      title: 'Payment Failed',
      message: `Payment of ₹${paymentData.amount} failed. Reason: ${failureReason || 'Unknown'}`,
      priority: 'medium',
      metadata: {
        payment_id: paymentId,
        user_id: userId,
        amount: paymentData.amount,
        failure_reason: failureReason,
        booking_id: paymentData.booking_id
      }
    });

    return { success: true };
  }

  async handlePaymentRefunded(eventData, options = {}) {
    const { userId, paymentId, paymentData, refundReason } = eventData;
    
    await createPaymentNotification(userId, paymentId, 'refunded', paymentData);
    
    // Notify admins about refund
    await this.notifyAdmins({
      type: 'payment_refunded',
      title: 'Payment Refunded',
      message: `Payment of ₹${paymentData.amount} has been refunded. Reason: ${refundReason || 'Not specified'}`,
      priority: 'medium',
      metadata: {
        payment_id: paymentId,
        user_id: userId,
        amount: paymentData.amount,
        refund_reason: refundReason,
        refunded_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  // ==================== PROVIDER EVENTS ====================

  async handleProviderVerified(eventData, options = {}) {
    const { providerId, verifiedBy, verificationNotes } = eventData;
    
    await createNotification({
      type: 'provider_verified',
      title: 'Profile Verified',
      message: 'Congratulations! Your service provider profile has been verified and approved. You can now start accepting bookings.',
      recipient_id: providerId,
      priority: 'high',
      metadata: {
        event_type: 'provider_verification',
        verified_by: verifiedBy,
        verification_notes: verificationNotes,
        verified_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  async handleProviderSuspended(eventData, options = {}) {
    const { providerId, suspendedBy, suspensionReason } = eventData;
    
    await createNotification({
      type: 'provider_suspended',
      title: 'Account Suspended',
      message: `Your account has been suspended. Reason: ${suspensionReason || 'Policy violation'}. Contact support for more information.`,
      recipient_id: providerId,
      priority: 'urgent',
      metadata: {
        event_type: 'provider_suspension',
        suspended_by: suspendedBy,
        suspension_reason: suspensionReason,
        suspended_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  async handleProviderReactivated(eventData, options = {}) {
    const { providerId, reactivatedBy } = eventData;
    
    await createNotification({
      type: 'provider_reactivated',
      title: 'Account Reactivated',
      message: 'Your account has been reactivated. You can now resume accepting bookings.',
      recipient_id: providerId,
      priority: 'high',
      metadata: {
        event_type: 'provider_reactivation',
        reactivated_by: reactivatedBy,
        reactivated_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  // ==================== SERVICE EVENTS ====================

  async handleServiceCreated(eventData, options = {}) {
    const { serviceId, serviceData, createdBy } = eventData;
    
    await this.notifyAdmins({
      type: 'new_service',
      title: 'New Service Created',
      message: `A new service "${serviceData.name}" has been created in category "${serviceData.category_name}"`,
      priority: 'low',
      metadata: {
        service_id: serviceId,
        service_name: serviceData.name,
        category_name: serviceData.category_name,
        created_by: createdBy,
        created_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  async handleServiceUpdated(eventData, options = {}) {
    const { serviceId, serviceData, updatedBy, changes } = eventData;
    
    await this.notifyAdmins({
      type: 'service_updated',
      title: 'Service Updated',
      message: `Service "${serviceData.name}" has been updated`,
      priority: 'low',
      metadata: {
        service_id: serviceId,
        service_name: serviceData.name,
        updated_by: updatedBy,
        changes: changes,
        updated_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  // ==================== TEAM EVENTS ====================

  async handleTeamCreated(eventData, options = {}) {
    const { teamId, teamName, createdBy } = eventData;
    
    await createNotification({
      type: 'team_created',
      title: 'Team Created',
      message: `Team "${teamName}" has been created successfully.`,
      recipient_id: createdBy,
      priority: 'medium',
      metadata: {
        team_id: teamId,
        team_name: teamName,
        created_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  async handleTeamMemberAdded(eventData, options = {}) {
    const { teamId, teamName, memberId, addedBy } = eventData;
    
    await createNotification({
      type: 'team_member_added',
      title: 'Added to Team',
      message: `You have been added to team "${teamName}"`,
      recipient_id: memberId,
      priority: 'medium',
      metadata: {
        team_id: teamId,
        team_name: teamName,
        added_by: addedBy,
        added_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  async handleTeamMemberRemoved(eventData, options = {}) {
    const { teamId, teamName, memberId, removedBy } = eventData;
    
    await createNotification({
      type: 'team_member_removed',
      title: 'Removed from Team',
      message: `You have been removed from team "${teamName}"`,
      recipient_id: memberId,
      priority: 'medium',
      metadata: {
        team_id: teamId,
        team_name: teamName,
        removed_by: removedBy,
        removed_at: new Date().toISOString()
      }
    });

    return { success: true };
  }

  // ==================== SYSTEM EVENTS ====================

  async handleMaintenanceScheduled(eventData, options = {}) {
    const { maintenanceDate, maintenanceDuration, affectedServices } = eventData;
    
    // Get all active users to notify
    const { data: users, error } = await supabase
      .from('users')
      .select('id')
      .eq('status', 'active');

    if (error || !users) {
      console.error('Error fetching users for maintenance notification:', error);
      return { success: false, error: error.message };
    }

    // Create notifications for all users
    const notifications = users.map(user => ({
      type: 'maintenance_scheduled',
      title: 'Scheduled Maintenance',
      message: `System maintenance is scheduled for ${maintenanceDate} for ${maintenanceDuration}. Some services may be temporarily unavailable.`,
      recipient_id: user.id,
      priority: 'medium',
      metadata: {
        maintenance_date: maintenanceDate,
        maintenance_duration: maintenanceDuration,
        affected_services: affectedServices,
        scheduled_at: new Date().toISOString()
      }
    }));

    // Insert all notifications
    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('Error inserting maintenance notifications:', insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true };
  }

  async handleSystemUpdate(eventData, options = {}) {
    const { updateVersion, updateFeatures, updateDate } = eventData;
    
    // Get all active users to notify
    const { data: users, error } = await supabase
      .from('users')
      .select('id')
      .eq('status', 'active');

    if (error || !users) {
      console.error('Error fetching users for system update notification:', error);
      return { success: false, error: error.message };
    }

    // Create notifications for all users
    const notifications = users.map(user => ({
      type: 'system_update',
      title: 'System Update Available',
      message: `Version ${updateVersion} is now available with new features: ${updateFeatures.join(', ')}`,
      recipient_id: user.id,
      priority: 'low',
      metadata: {
        update_version: updateVersion,
        update_features: updateFeatures,
        update_date: updateDate,
        notified_at: new Date().toISOString()
      }
    }));

    // Insert all notifications
    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('Error inserting system update notifications:', insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true };
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Notify all admin users about an event
   * @param {Object} notificationData - Notification data
   */
  async notifyAdmins(notificationData) {
    try {
      const { data: admins, error } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .eq('status', 'active');

      if (error || !admins || admins.length === 0) {
        console.log('No admin users found to notify');
        return { success: true };
      }

      const notifications = admins.map(admin => ({
        ...notificationData,
        recipient_id: admin.id,
        sender_id: null, // System notification
        related_entity_type: notificationData.type,
        related_entity_id: notificationData.metadata?.booking_id || 
                          notificationData.metadata?.user_id || 
                          notificationData.metadata?.service_id || 
                          notificationData.metadata?.payment_id
      }));

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (insertError) {
        console.error('Error notifying admins:', insertError);
        return { success: false, error: insertError.message };
      }

      console.log(`✅ Notified ${admins.length} admin(s) about: ${notificationData.type}`);
      return { success: true };
    } catch (error) {
      console.error('Error in notifyAdmins:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get notification statistics
   * @param {string} userId - User ID (optional)
   * @returns {Object} Notification statistics
   */
  async getNotificationStats(userId = null) {
    try {
      let query = supabase.from('notifications').select('type, status, priority');
      
      if (userId) {
        query = query.eq('recipient_id', userId);
      }

      const { data: notifications, error } = await query;

      if (error) {
        throw error;
      }

      const stats = {
        total: notifications.length,
        byType: {},
        byStatus: {},
        byPriority: {},
        unread: 0
      };

      notifications.forEach(notification => {
        // Count by type
        stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
        
        // Count by status
        stats.byStatus[notification.status] = (stats.byStatus[notification.status] || 0) + 1;
        
        // Count by priority
        stats.byPriority[notification.priority] = (stats.byPriority[notification.priority] || 0) + 1;
        
        // Count unread
        if (notification.status === 'unread') {
          stats.unread++;
        }
      });

      return { success: true, data: stats };
    } catch (error) {
      console.error('Error getting notification stats:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up old notifications
   * @param {number} daysOld - Number of days old notifications to clean up
   * @param {string} status - Status of notifications to clean up (optional)
   */
  async cleanupOldNotifications(daysOld = 30, status = null) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      let query = supabase
        .from('notifications')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (status) {
        query = query.eq('status', status);
      }

      const { error } = await query;

      if (error) {
        throw error;
      }

      console.log(`✅ Cleaned up notifications older than ${daysOld} days`);
      return { success: true };
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance
const notificationAutomation = new NotificationAutomation();

module.exports = {
  notificationAutomation,
  NotificationAutomation
};
