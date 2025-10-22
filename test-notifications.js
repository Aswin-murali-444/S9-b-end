const { createBookingNotification, createPaymentNotification, createReminderNotification } = require('./services/notificationService');

async function testNotifications() {
  console.log('Testing notification system...\n');

  // Test booking notification
  console.log('1. Testing booking assignment notification...');
  const bookingResult = await createBookingNotification(
    'test-user-id',
    'test-booking-id',
    'assigned',
    {
      scheduled_date: '2024-01-15',
      scheduled_time: '10:00 AM',
      service_address: '123 Main St, City',
      total_amount: 1500
    }
  );
  console.log('Booking notification result:', bookingResult.success ? 'SUCCESS' : 'FAILED');
  if (!bookingResult.success) {
    console.log('Error:', bookingResult.error);
  }

  // Test payment notification
  console.log('\n2. Testing payment success notification...');
  const paymentResult = await createPaymentNotification(
    'test-user-id',
    'test-payment-id',
    'success',
    {
      amount: 1500,
      booking_id: 'test-booking-id',
      payment_method: 'UPI'
    }
  );
  console.log('Payment notification result:', paymentResult.success ? 'SUCCESS' : 'FAILED');
  if (!paymentResult.success) {
    console.log('Error:', paymentResult.error);
  }

  // Test reminder notification
  console.log('\n3. Testing reminder notification...');
  const reminderResult = await createReminderNotification(
    'test-user-id',
    'Service Reminder',
    'Your service is scheduled for tomorrow at 10:00 AM. Please be ready!',
    {
      booking_id: 'test-booking-id',
      scheduled_date: '2024-01-15',
      scheduled_time: '10:00 AM'
    }
  );
  console.log('Reminder notification result:', reminderResult.success ? 'SUCCESS' : 'FAILED');
  if (!reminderResult.success) {
    console.log('Error:', reminderResult.error);
  }

  console.log('\nNotification testing completed!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testNotifications().catch(console.error);
}

module.exports = { testNotifications };
