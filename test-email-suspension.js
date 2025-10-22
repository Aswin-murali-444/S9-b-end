const { sendSuspensionEmail, sendReactivationEmail } = require('./services/emailService');

async function testEmailFunctionality() {
  console.log('🧪 Testing Email Functionality...\n');

  // Test data
  const testUser = {
    to: 'test@example.com', // Replace with a real email for testing
    userName: 'John Doe',
    userEmail: 'test@example.com',
    reason: 'Violation of community guidelines - inappropriate behavior reported by multiple users.',
    isServiceProvider: true
  };

  try {
    console.log('📧 Testing Suspension Email...');
    const suspensionResult = await sendSuspensionEmail(testUser);
    console.log('Suspension Email Result:', suspensionResult);
    
    if (suspensionResult.sent) {
      console.log('✅ Suspension email sent successfully!');
    } else if (suspensionResult.skipped) {
      console.log('⚠️ Suspension email skipped:', suspensionResult.reason);
    }
  } catch (error) {
    console.error('❌ Suspension email failed:', error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  try {
    console.log('📧 Testing Reactivation Email...');
    const reactivationResult = await sendReactivationEmail({
      to: testUser.to,
      userName: testUser.userName,
      userEmail: testUser.userEmail,
      isServiceProvider: testUser.isServiceProvider
    });
    console.log('Reactivation Email Result:', reactivationResult);
    
    if (reactivationResult.sent) {
      console.log('✅ Reactivation email sent successfully!');
    } else if (reactivationResult.skipped) {
      console.log('⚠️ Reactivation email skipped:', reactivationResult.reason);
    }
  } catch (error) {
    console.error('❌ Reactivation email failed:', error.message);
  }

  console.log('\n🎉 Email testing completed!');
}

// Run the test
testEmailFunctionality().catch(console.error);
