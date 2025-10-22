# Automated Notification System Implementation Guide

This guide explains how to implement the comprehensive automated notification system that integrates seamlessly with your existing S9 Mini2 application.

## 🎯 Overview

The automated notification system provides:
- **Automatic notifications** based on system actions (bookings, payments, profile updates, etc.)
- **Database triggers** for critical events
- **Middleware integration** for seamless route integration
- **Manual notification triggers** for special cases
- **Notification management** (mark as read, dismiss, cleanup)
- **Statistics and analytics** for notification performance

## 📁 Files Created

1. **`services/notificationAutomation.js`** - Core automation engine
2. **`middleware/notificationMiddleware.js`** - Middleware for route integration
3. **`routes/notificationIntegration.js`** - Example integration patterns
4. **Updated `services/notificationService.js`** - Enhanced notification service

## 🚀 Quick Start

### Step 1: Update Your Notification Table

Your existing notification table structure is already compatible! The system uses these fields:
- `recipient_id` (instead of `user_id`)
- `sender_id` (optional)
- `related_entity_type` and `related_entity_id` (for linking to bookings, payments, etc.)

### Step 2: Add Middleware to Your Routes

Add notification middleware to your existing routes:

```javascript
const NotificationMiddleware = require('../middleware/notificationMiddleware');

// For booking creation
router.post('/bookings', 
  NotificationMiddleware.bookingNotifications().created,
  async (req, res) => {
    // Your existing booking creation logic
  }
);

// For booking status updates
router.put('/bookings/:bookingId/status',
  NotificationMiddleware.bookingNotifications().statusUpdated,
  async (req, res) => {
    // Your existing status update logic
  }
);

// For user registration
router.post('/users/register',
  NotificationMiddleware.userNotifications().registered,
  async (req, res) => {
    // Your existing registration logic
  }
);
```

### Step 3: Manual Notification Triggers

For special cases or testing, trigger notifications manually:

```javascript
const { notificationAutomation } = require('../services/notificationAutomation');

// Trigger booking assignment notification
await notificationAutomation.triggerNotification('booking_assigned', {
  userId: 'user-uuid',
  providerId: 'provider-uuid',
  bookingId: 'booking-uuid',
  bookingData: {
    scheduled_date: '2024-01-15',
    scheduled_time: '10:00',
    service_address: '123 Main St',
    total_amount: 500
  }
});

// Trigger payment success notification
await notificationAutomation.triggerNotification('payment_success', {
  userId: 'user-uuid',
  paymentId: 'payment-uuid',
  paymentData: {
    amount: 500,
    booking_id: 'booking-uuid',
    payment_method: 'razorpay'
  }
});
```

## 🔧 Integration Examples

### Booking Routes Integration

```javascript
// In your bookings.js route file
const NotificationMiddleware = require('../middleware/notificationMiddleware');

// Add to booking creation
router.post('/', 
  NotificationMiddleware.bookingNotifications().created,
  async (req, res) => {
    // Your existing code...
  }
);

// Add to booking assignment
router.put('/:bookingId/assign',
  NotificationMiddleware.bookingNotifications().assigned,
  async (req, res) => {
    // Your existing code...
  }
);

// Add to status updates
router.put('/:bookingId/status',
  NotificationMiddleware.bookingNotifications().statusUpdated,
  async (req, res) => {
    // Your existing code...
  }
);
```

### User Routes Integration

```javascript
// In your users.js route file
const NotificationMiddleware = require('../middleware/notificationMiddleware');

// Add to user registration
router.post('/register',
  NotificationMiddleware.userNotifications().registered,
  async (req, res) => {
    // Your existing code...
  }
);

// Add to profile completion
router.post('/profile/complete',
  NotificationMiddleware.userNotifications().profileCompleted,
  async (req, res) => {
    // Your existing code...
  }
);
```

### Payment Routes Integration

```javascript
// In your payments.js route file
const NotificationMiddleware = require('../middleware/notificationMiddleware');

// Add to payment success
router.post('/confirm',
  NotificationMiddleware.paymentNotifications().success,
  async (req, res) => {
    // Your existing code...
  }
);
```

## 📊 Available Notification Types

### User Events
- `user_registered` - New user registration
- `profile_completed` - Profile completion
- `profile_updated` - Profile updates
- `provider_verified` - Provider verification
- `provider_suspended` - Provider suspension
- `provider_reactivated` - Provider reactivation

### Booking Events
- `booking_created` - New booking created
- `booking_assigned` - Provider assigned to booking
- `booking_confirmed` - Booking confirmed by provider
- `booking_started` - Service started
- `booking_completed` - Service completed
- `booking_cancelled` - Booking cancelled

### Payment Events
- `payment_success` - Payment successful
- `payment_failed` - Payment failed
- `payment_refunded` - Payment refunded

### Service Events
- `service_created` - New service created
- `service_updated` - Service updated

### Team Events
- `team_created` - Team created
- `team_member_added` - Member added to team
- `team_member_removed` - Member removed from team

### System Events
- `maintenance_scheduled` - System maintenance scheduled
- `system_update` - System update available

## 🎛️ Advanced Features

### Notification Statistics

```javascript
const { getNotificationStats } = require('../services/notificationService');

// Get user notification statistics
const stats = await getNotificationStats(userId);
console.log(stats.data);
// {
//   total: 25,
//   unread: 5,
//   byType: { 'booking_assigned': 3, 'payment_success': 2 },
//   byStatus: { 'unread': 5, 'read': 20 },
//   byPriority: { 'high': 2, 'medium': 15, 'low': 8 },
//   recent: [...]
// }
```

### Notification Management

```javascript
const { 
  markAsRead, 
  markAllAsRead, 
  dismissNotification 
} = require('../services/notificationService');

// Mark single notification as read
await markAsRead(notificationId, userId);

// Mark all notifications as read
await markAllAsRead(userId);

// Dismiss notification
await dismissNotification(notificationId, userId);
```

### Cleanup Old Notifications

```javascript
const { notificationAutomation } = require('../services/notificationAutomation');

// Clean up read notifications older than 30 days
await notificationAutomation.cleanupOldNotifications(30, 'read');

// Clean up all notifications older than 90 days
await notificationAutomation.cleanupOldNotifications(90);
```

## 🔄 Database Triggers (Already Implemented)

Your existing database triggers are already set up and will continue to work:

1. **Provider Profile Completion** - Notifies admins when profiles are completed
2. **Provider Status Changes** - Notifies providers when verification status changes
3. **Booking Updates** - Notifies users when booking status changes

## 🧪 Testing the System

### Test Individual Notifications

```javascript
// Test booking notification
const result = await notificationAutomation.triggerNotification('booking_created', {
  userId: 'test-user-id',
  bookingId: 'test-booking-id',
  bookingData: {
    scheduled_date: '2024-01-15',
    scheduled_time: '10:00',
    service_address: 'Test Address',
    total_amount: 500
  }
});

console.log(result);
```

### Test Middleware Integration

```javascript
// Add to any route for testing
router.post('/test-notification', 
  NotificationMiddleware.triggerNotification('test_event', (req, res, data) => {
    return { testData: 'test' };
  }),
  async (req, res) => {
    res.json({ success: true, message: 'Test notification triggered' });
  }
);
```

## 📈 Monitoring and Analytics

### Get System-wide Statistics

```javascript
const { notificationAutomation } = require('../services/notificationAutomation');

// Get stats for all users
const stats = await notificationAutomation.getNotificationStats();
console.log('System notification stats:', stats.data);
```

### Monitor Notification Performance

```javascript
// Add to your admin dashboard
router.get('/admin/notifications/analytics', async (req, res) => {
  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('type, status, priority, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    if (error) throw error;

    const analytics = {
      total: notifications.length,
      byType: {},
      byStatus: {},
      byPriority: {},
      daily: {}
    };

    notifications.forEach(notification => {
      // Count by type
      analytics.byType[notification.type] = (analytics.byType[notification.type] || 0) + 1;
      
      // Count by status
      analytics.byStatus[notification.status] = (analytics.byStatus[notification.status] || 0) + 1;
      
      // Count by priority
      analytics.byPriority[notification.priority] = (analytics.byPriority[notification.priority] || 0) + 1;
      
      // Count by day
      const day = notification.created_at.split('T')[0];
      analytics.daily[day] = (analytics.daily[day] || 0) + 1;
    });

    res.json({ success: true, analytics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## 🚨 Important Notes

1. **Non-Breaking**: The system integrates with your existing code without breaking anything
2. **Backward Compatible**: All existing notification functionality continues to work
3. **Performance**: Notifications are triggered asynchronously to avoid blocking requests
4. **Error Handling**: Notification failures don't affect your main application flow
5. **Scalable**: The system can handle high volumes of notifications efficiently

## 🔧 Customization

### Custom Notification Types

```javascript
// Add custom event handler
notificationAutomation.eventHandlers.set('custom_event', async (eventData, options) => {
  await createNotification({
    type: 'custom_notification',
    title: 'Custom Event',
    message: 'This is a custom notification',
    recipient_id: eventData.userId,
    priority: 'medium',
    metadata: eventData
  });
  
  return { success: true };
});

// Trigger custom notification
await notificationAutomation.triggerNotification('custom_event', {
  userId: 'user-id',
  customData: 'value'
});
```

### Custom Middleware

```javascript
// Create custom middleware for specific needs
const customNotificationMiddleware = NotificationMiddleware.triggerNotification(
  'custom_event',
  (req, res, data) => {
    // Extract custom data from request/response
    return {
      userId: req.user.id,
      customField: req.body.customField
    };
  },
  { priority: 'high' }
);
```

## 🎉 You're All Set!

Your automated notification system is now ready to use. The system will automatically:

- ✅ Send notifications when users register
- ✅ Notify about booking status changes
- ✅ Alert about payment success/failure
- ✅ Inform about profile completions
- ✅ Manage notification states (read/unread/dismissed)
- ✅ Provide analytics and statistics
- ✅ Clean up old notifications automatically

The system integrates seamlessly with your existing codebase and provides a robust foundation for all your notification needs!
