const { notificationAutomation } = require('../services/notificationAutomation');

/**
 * Notification Middleware
 * Automatically triggers notifications based on API responses
 * Integrates seamlessly with existing routes without breaking functionality
 */

class NotificationMiddleware {
  /**
   * Middleware to trigger notifications after successful operations
   * @param {string} eventType - Type of event to trigger
   * @param {Function} dataExtractor - Function to extract data from req/res
   * @param {Object} options - Additional options
   */
  static triggerNotification(eventType, dataExtractor, options = {}) {
    return async (req, res, next) => {
      // Store original res.json method
      const originalJson = res.json;
      
      // Override res.json to trigger notification after successful response
      res.json = function(data) {
        // Call original method first
        const result = originalJson.call(this, data);
        
        // Trigger notification asynchronously (don't wait for it)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const eventData = dataExtractor(req, res, data);
            if (eventData) {
              notificationAutomation.triggerNotification(eventType, eventData, options)
                .catch(error => {
                  console.error(`Failed to trigger notification for ${eventType}:`, error);
                });
            }
          } catch (error) {
            console.error(`Error extracting data for notification ${eventType}:`, error);
          }
        }
        
        return result;
      };
      
      next();
    };
  }

  /**
   * Middleware for booking-related notifications
   */
  static bookingNotifications() {
    return {
      // Booking created
      created: NotificationMiddleware.triggerNotification(
        'booking_created',
        (req, res, data) => {
          if (data.booking) {
            return {
              userId: data.booking.user_id,
              bookingId: data.booking.id,
              bookingData: {
                scheduled_date: data.booking.scheduled_date,
                scheduled_time: data.booking.scheduled_time,
                service_address: data.booking.service_address,
                total_amount: data.booking.total_amount
              }
            };
          }
          return null;
        }
      ),

      // Booking status updated
      statusUpdated: NotificationMiddleware.triggerNotification(
        'booking_status_updated',
        (req, res, data) => {
          if (data.booking) {
            const status = req.body.status;
            const eventType = this.getBookingEventType(status);
            
            return {
              userId: data.booking.user_id,
              providerId: data.booking.provider_id,
              bookingId: data.booking.id,
              bookingData: {
                scheduled_date: data.booking.scheduled_date,
                scheduled_time: data.booking.scheduled_time,
                service_address: data.booking.service_address,
                total_amount: data.booking.total_amount
              },
              newStatus: status
            };
          }
          return null;
        }
      ),

      // Booking assigned
      assigned: NotificationMiddleware.triggerNotification(
        'booking_assigned',
        (req, res, data) => {
          if (data.booking) {
            return {
              userId: data.booking.user_id,
              providerId: data.booking.provider_id,
              bookingId: data.booking.id,
              bookingData: {
                scheduled_date: data.booking.scheduled_date,
                scheduled_time: data.booking.scheduled_time,
                service_address: data.booking.service_address,
                total_amount: data.booking.total_amount
              }
            };
          }
          return null;
        }
      )
    };
  }

  /**
   * Middleware for payment-related notifications
   */
  static paymentNotifications() {
    return {
      // Payment success
      success: NotificationMiddleware.triggerNotification(
        'payment_success',
        (req, res, data) => {
          if (data.payment) {
            return {
              userId: data.payment.user_id,
              paymentId: data.payment.id,
              paymentData: {
                amount: data.payment.amount,
                booking_id: data.payment.booking_id,
                payment_method: data.payment.payment_method
              }
            };
          }
          return null;
        }
      ),

      // Payment failed
      failed: NotificationMiddleware.triggerNotification(
        'payment_failed',
        (req, res, data) => {
          if (data.error || res.statusCode >= 400) {
            return {
              userId: req.body.user_id || req.user?.id,
              paymentId: req.body.payment_id,
              paymentData: {
                amount: req.body.amount,
                booking_id: req.body.booking_id,
                payment_method: req.body.payment_method
              },
              failureReason: data.error || 'Payment processing failed'
            };
          }
          return null;
        }
      )
    };
  }

  /**
   * Middleware for user-related notifications
   */
  static userNotifications() {
    return {
      // User registered
      registered: NotificationMiddleware.triggerNotification(
        'user_registered',
        (req, res, data) => {
          if (data.user) {
            return {
              userId: data.user.id,
              userEmail: data.user.email,
              userName: data.user.name || data.user.first_name
            };
          }
          return null;
        }
      ),

      // Profile completed
      profileCompleted: NotificationMiddleware.triggerNotification(
        'profile_completed',
        (req, res, data) => {
          if (data.success) {
            const userId = req.user?.id || req.body.userId;
            return {
              userId: userId,
              profileType: req.body.profileType || 'user',
              providerId: req.body.profileType === 'provider' ? userId : null
            };
          }
          return null;
        }
      ),

      // Provider verified
      providerVerified: NotificationMiddleware.triggerNotification(
        'provider_verified',
        (req, res, data) => {
          if (data.success && req.body.status === 'verified') {
            return {
              providerId: req.params.userId || req.body.providerId,
              verifiedBy: req.user?.id,
              verificationNotes: req.body.notes
            };
          }
          return null;
        }
      )
    };
  }

  /**
   * Middleware for service-related notifications
   */
  static serviceNotifications() {
    return {
      // Service created
      created: NotificationMiddleware.triggerNotification(
        'service_created',
        (req, res, data) => {
          if (data.service) {
            return {
              serviceId: data.service.id,
              serviceData: {
                name: data.service.name,
                category_name: data.service.category_name
              },
              createdBy: req.user?.id
            };
          }
          return null;
        }
      ),

      // Service updated
      updated: NotificationMiddleware.triggerNotification(
        'service_updated',
        (req, res, data) => {
          if (data.service) {
            return {
              serviceId: data.service.id,
              serviceData: {
                name: data.service.name
              },
              updatedBy: req.user?.id,
              changes: Object.keys(req.body)
            };
          }
          return null;
        }
      )
    };
  }

  /**
   * Middleware for team-related notifications
   */
  static teamNotifications() {
    return {
      // Team created
      created: NotificationMiddleware.triggerNotification(
        'team_created',
        (req, res, data) => {
          if (data.team) {
            return {
              teamId: data.team.id,
              teamName: data.team.name,
              createdBy: req.user?.id
            };
          }
          return null;
        }
      ),

      // Team member added
      memberAdded: NotificationMiddleware.triggerNotification(
        'team_member_added',
        (req, res, data) => {
          if (data.success) {
            return {
              teamId: req.params.teamId,
              teamName: req.body.teamName,
              memberId: req.body.memberId,
              addedBy: req.user?.id
            };
          }
          return null;
        }
      ),

      // Team member removed
      memberRemoved: NotificationMiddleware.triggerNotification(
        'team_member_removed',
        (req, res, data) => {
          if (data.success) {
            return {
              teamId: req.params.teamId,
              teamName: req.body.teamName,
              memberId: req.params.memberId,
              removedBy: req.user?.id
            };
          }
          return null;
        }
      )
    };
  }

  /**
   * Helper method to get booking event type from status
   */
  static getBookingEventType(status) {
    const statusMap = {
      'assigned': 'booking_assigned',
      'confirmed': 'booking_confirmed',
      'in_progress': 'booking_started',
      'completed': 'booking_completed',
      'cancelled': 'booking_cancelled'
    };
    return statusMap[status] || 'booking_status_updated';
  }

  /**
   * Middleware to add notification stats to response
   */
  static addNotificationStats() {
    return async (req, res, next) => {
      const originalJson = res.json;
      
      res.json = async function(data) {
        try {
          // Add notification stats for user endpoints
          if (req.user?.id && (req.path.includes('/user/') || req.path.includes('/profile'))) {
            const stats = await notificationAutomation.getNotificationStats(req.user.id);
            if (stats.success) {
              data.notificationStats = stats.data;
            }
          }
        } catch (error) {
          console.error('Error adding notification stats:', error);
        }
        
        return originalJson.call(this, data);
      };
      
      next();
    };
  }

  /**
   * Middleware to clean up old notifications periodically
   */
  static cleanupNotifications(daysOld = 30) {
    return async (req, res, next) => {
      // Only run cleanup occasionally (1% chance)
      if (Math.random() < 0.01) {
        try {
          await notificationAutomation.cleanupOldNotifications(daysOld, 'read');
        } catch (error) {
          console.error('Error cleaning up notifications:', error);
        }
      }
      next();
    };
  }

  /**
   * Middleware for system-wide notifications
   */
  static systemNotifications() {
    return {
      // Maintenance scheduled
      maintenanceScheduled: NotificationMiddleware.triggerNotification(
        'maintenance_scheduled',
        (req, res, data) => {
          if (data.success) {
            return {
              maintenanceDate: req.body.maintenanceDate,
              maintenanceDuration: req.body.maintenanceDuration,
              affectedServices: req.body.affectedServices || []
            };
          }
          return null;
        }
      ),

      // System update
      systemUpdate: NotificationMiddleware.triggerNotification(
        'system_update',
        (req, res, data) => {
          if (data.success) {
            return {
              updateVersion: req.body.updateVersion,
              updateFeatures: req.body.updateFeatures || [],
              updateDate: req.body.updateDate
            };
          }
          return null;
        }
      )
    };
  }
}

module.exports = NotificationMiddleware;
