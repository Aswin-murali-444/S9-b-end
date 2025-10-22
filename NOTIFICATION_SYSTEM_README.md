# Notification System Implementation

This document describes the comprehensive notification system implemented for the S9 Mini2 application.

## Overview

The notification system provides real-time updates to users about various events in the application, including:
- Service provider assignments
- Booking confirmations and status changes
- Payment notifications
- Service reminders
- Promotional messages

## Backend Implementation

### Database Schema

The notifications are stored in a `notifications` table with the following structure:

```sql
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE
);
```

### API Endpoints

#### User Notifications
- `GET /notifications/user/:userId` - Get notifications for a specific user
- `GET /notifications/user/:userId/unread-count` - Get unread count for a user
- `PUT /notifications/user/:userId/:notificationId/read` - Mark notification as read
- `PUT /notifications/user/:userId/mark-all-read` - Mark all notifications as read

#### Admin Notifications
- `GET /notifications` - Get all notifications (admin)
- `GET /notifications/unread-count` - Get total unread count
- `PUT /notifications/:notificationId/read` - Mark notification as read (admin)
- `PUT /notifications/mark-all-read` - Mark all notifications as read (admin)
- `PUT /notifications/:notificationId/dismiss` - Dismiss notification

#### Provider Notifications
- `GET /notifications/provider/:providerId` - Get notifications for a provider

### Notification Service

The `notificationService.js` provides utility functions for creating different types of notifications:

```javascript
const { 
  createNotification,
  createBookingNotification,
  createPaymentNotification,
  createPromotionalNotification,
  createReminderNotification 
} = require('./services/notificationService');

// Create a booking notification
await createBookingNotification(userId, bookingId, 'assigned', bookingData);

// Create a payment notification
await createPaymentNotification(userId, paymentId, 'success', paymentData);
```

### Automatic Notifications

The system automatically creates notifications for:

1. **Booking Events**:
   - When a service provider is assigned to a booking
   - When a booking is confirmed by the provider
   - When a service starts
   - When a service is completed
   - When a booking is cancelled

2. **Payment Events**:
   - Successful payments
   - Failed payments
   - Refunds

3. **Profile Events**:
   - Provider profile completion
   - Verification status changes

## Frontend Implementation

### Notification Hook

The `useNotifications` hook provides a comprehensive interface for managing notifications:

```javascript
import { useNotifications } from '../hooks/useNotifications';

const {
  notifications,
  unreadCount,
  loading,
  error,
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  addNotification,
  getNotificationIcon,
  getNotificationColor
} = useNotifications();
```

### Features

1. **Real-time Updates**: Notifications are fetched every 30 seconds
2. **Unread Count**: Shows the number of unread notifications
3. **Interactive**: Click to mark notifications as read
4. **Visual Indicators**: Different icons and colors for different notification types
5. **Priority-based Styling**: Urgent notifications are highlighted

### Notification Types and Icons

| Type | Icon | Description |
|------|------|-------------|
| booking_assigned | 👨‍🔧 | Service provider assigned |
| booking_confirmed | ✅ | Booking confirmed |
| service_started | 🚀 | Service started |
| service_completed | 🎉 | Service completed |
| booking_cancelled | ❌ | Booking cancelled |
| payment_success | 💳 | Payment successful |
| payment_failed | ⚠️ | Payment failed |
| reminder | ⏰ | Service reminder |
| promotion | 🎁 | Promotional message |

### UI Components

The notification system includes:

1. **Notification Bell**: Shows unread count badge
2. **Dropdown Menu**: Displays recent notifications
3. **Mark as Read**: Individual and bulk actions
4. **Visual Indicators**: Unread notifications have colored indicators
5. **Responsive Design**: Works on all screen sizes

## Usage Examples

### Creating Notifications from Backend

```javascript
// In your route handler
const { createBookingNotification } = require('../services/notificationService');

// When a booking is assigned
await createBookingNotification(
  booking.user_id,
  booking.id,
  'assigned',
  {
    scheduled_date: booking.scheduled_date,
    scheduled_time: booking.scheduled_time,
    service_address: booking.service_address,
    total_amount: booking.total_amount
  }
);
```

### Using Notifications in Frontend

```javascript
// In your React component
const { notifications, unreadCount, markAsRead } = useNotifications();

// Display notification count
{unreadCount > 0 && (
  <span className="notification-badge">{unreadCount}</span>
)}

// Mark notification as read when clicked
<div onClick={() => markAsRead(notification.id)}>
  {notification.title}
</div>
```

## Testing

Run the notification test script:

```bash
node test-notifications.js
```

This will test creating different types of notifications and verify the system is working correctly.

## Future Enhancements

1. **Push Notifications**: Browser push notifications for urgent messages
2. **Email Notifications**: Email alerts for important events
3. **SMS Notifications**: SMS alerts for critical updates
4. **Notification Preferences**: User-configurable notification settings
5. **Real-time WebSocket**: Instant notifications without polling
6. **Notification Templates**: Customizable notification templates

## Troubleshooting

### Common Issues

1. **Notifications not appearing**: Check if the user_id is correct and the notification was created successfully
2. **Unread count not updating**: Verify the API endpoints are working and the frontend is polling correctly
3. **Performance issues**: Consider implementing pagination for users with many notifications

### Debugging

Enable debug logging in the notification service:

```javascript
console.log('Notification created:', notificationData);
```

Check the database directly:

```sql
SELECT * FROM notifications WHERE user_id = 'your-user-id' ORDER BY created_at DESC;
```

## Security Considerations

1. **User Isolation**: Users can only see their own notifications
2. **Input Validation**: All notification data is validated before creation
3. **Rate Limiting**: Consider implementing rate limiting for notification creation
4. **Data Privacy**: Sensitive information should not be included in notification messages

This notification system provides a robust foundation for keeping users informed about important events in the application while maintaining good performance and user experience.
