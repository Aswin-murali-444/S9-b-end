const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * Build HTML template for user suspension email
 */
function buildSuspensionEmailHtml({ 
  appName = 'Nexus', 
  userName = 'User', 
  userEmail, 
  reason = '', 
  isServiceProvider = false,
  supportEmail = 'support@nexus.com',
  contactUrl = ''
}) {
  const safeContactUrl = contactUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
  
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName} • Account Suspension Notice</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;line-height:1.6;color:#2c3e50;background:#f1f5f9;padding:20px}
      .email-container{max-width:600px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.08)}
      .header{background:linear-gradient(135deg,#dc2626,#b91c1c);padding:36px 28px;text-align:center;position:relative}
      .logo-text{color:#fff;font-size:26px;font-weight:700;margin-bottom:6px}
      .logo-subtitle{color:rgba(255,255,255,.9);font-size:14px}
      .content{padding:40px 34px;text-align:center}
      .warning-text{font-size:22px;font-weight:700;color:#dc2626;margin-bottom:12px}
      .description{font-size:15px;color:#64748b;margin-bottom:22px;text-align:left}
      .suspension-box{background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;text-align:left;margin:20px 0}
      .suspension-title{color:#dc2626;font-weight:600;font-size:16px;margin-bottom:10px}
      .suspension-details{color:#374151;font-size:14px;line-height:1.5}
      .reason-box{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:12px 0}
      .reason-label{color:#92400e;font-weight:600;font-size:13px;margin-bottom:4px}
      .reason-text{color:#92400e;font-size:14px}
      .provider-notice{background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;padding:12px;margin:12px 0}
      .provider-notice-title{color:#1e40af;font-weight:600;font-size:14px;margin-bottom:6px}
      .provider-notice-text{color:#1e40af;font-size:13px}
      .action-section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;text-align:left}
      .action-title{color:#1e293b;font-weight:600;font-size:16px;margin-bottom:10px}
      .action-list{color:#64748b;font-size:14px;line-height:1.6}
      .action-list li{margin-bottom:6px}
      .contact-button{display:inline-block;background:linear-gradient(135deg,#4f9cf9,#3b82f6);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:24px 0 8px 0;box-shadow:0 8px 25px rgba(79,156,249,.3)}
      .footer{background:#f8fafc;padding:22px 28px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px}
      .footer a{color:#4f9cf9;text-decoration:none}
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <div class="logo-text">${appName}</div>
        <div class="logo-subtitle">Account Suspension Notice</div>
      </div>
      <div class="content">
        <h1 class="warning-text">Account Suspended</h1>
        <p class="description">
          Dear <strong>${userName}</strong>,<br><br>
          We are writing to inform you that your account has been suspended due to a violation of our terms of service or platform policies.
        </p>
        
        <div class="suspension-box">
          <div class="suspension-title">Account Details</div>
          <div class="suspension-details">
            <strong>Email:</strong> ${userEmail}<br>
            <strong>Status:</strong> Suspended<br>
            <strong>Date:</strong> ${new Date().toLocaleDateString()}
          </div>
        </div>

        ${reason ? `
        <div class="reason-box">
          <div class="reason-label">Reason for Suspension:</div>
          <div class="reason-text">${reason}</div>
        </div>
        ` : ''}

        ${isServiceProvider ? `
        <div class="provider-notice">
          <div class="provider-notice-title">Service Provider Impact</div>
          <div class="provider-notice-text">
            As a service provider, this suspension affects your ability to:<br>
            • Receive new booking requests<br>
            • Access your provider dashboard<br>
            • Complete ongoing services<br>
            • Receive payments for services
          </div>
        </div>
        ` : ''}

        <div class="action-section">
          <div class="action-title">What This Means</div>
          <div class="action-list">
            <ul>
              <li>You will not be able to log in to your account</li>
              <li>All account access has been temporarily restricted</li>
              ${isServiceProvider ? '<li>Your service provider profile is inactive</li>' : ''}
              <li>Any ongoing bookings or services may be affected</li>
            </ul>
          </div>
        </div>

        <div class="action-section">
          <div class="action-title">Next Steps</div>
          <div class="action-list">
            <ul>
              <li>Review our terms of service and community guidelines</li>
              <li>If you believe this suspension is in error, contact our support team</li>
              <li>Provide any additional information that may help resolve this matter</li>
              <li>We will review your case and respond within 2-3 business days</li>
            </ul>
          </div>
        </div>

        <a href="${safeContactUrl}/contact" class="contact-button">Contact Support</a>
        
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:14px;margin:16px 0;font-size:13px;color:#92400e;text-align:left">
          <strong>Important:</strong> This suspension is temporary and can be lifted once the issue is resolved. We are committed to working with you to restore your account access.
        </div>
      </div>
      <div class="footer">
        <p>If you have any questions, please contact us at <a href="mailto:${supportEmail}">${supportEmail}</a></p>
        <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Send suspension email to user
 */
async function sendSuspensionEmail({ 
  to, 
  userName, 
  userEmail, 
  reason = '', 
  isServiceProvider = false 
}) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured, skipping email send');
    return { skipped: true, reason: 'No SendGrid API key' };
  }

  const from = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'no-reply@nexus.com';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@nexus.com';
  
  const html = buildSuspensionEmailHtml({
    appName: 'Nexus',
    userName,
    userEmail,
    reason,
    isServiceProvider,
    supportEmail,
    contactUrl: process.env.FRONTEND_URL
  });

  const textContent = `
Account Suspension Notice

Dear ${userName},

Your account has been suspended due to a violation of our terms of service.

Account Details:
- Email: ${userEmail}
- Status: Suspended
- Date: ${new Date().toLocaleDateString()}

${reason ? `Reason: ${reason}\n` : ''}

${isServiceProvider ? `
As a service provider, this suspension affects your ability to:
- Receive new booking requests
- Access your provider dashboard
- Complete ongoing services
- Receive payments for services

` : ''}

What This Means:
- You will not be able to log in to your account
- All account access has been temporarily restricted
${isServiceProvider ? '- Your service provider profile is inactive' : ''}
- Any ongoing bookings or services may be affected

Next Steps:
- Review our terms of service and community guidelines
- If you believe this suspension is in error, contact our support team
- Provide any additional information that may help resolve this matter
- We will review your case and respond within 2-3 business days

Contact Support: ${supportEmail}

This suspension is temporary and can be lifted once the issue is resolved.

© ${new Date().getFullYear()} Nexus. All rights reserved.
  `;

  const msg = {
    to,
    from,
    subject: `Account Suspension Notice - ${userName}`,
    text: textContent,
    html
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Suspension email sent to ${to}`);
    return { sent: true, messageId: msg.messageId };
  } catch (error) {
    console.error('❌ Failed to send suspension email:', error);
    return { sent: false, error: error.message };
  }
}

/**
 * Send account reactivation email
 */
async function sendReactivationEmail({ 
  to, 
  userName, 
  userEmail, 
  isServiceProvider = false 
}) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured, skipping email send');
    return { skipped: true, reason: 'No SendGrid API key' };
  }

  const from = process.env.SENDGRID_FROM_EMAIL || process.env.FROM_EMAIL || 'no-reply@nexus.com';
  const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  
  const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nexus • Account Reactivated</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;line-height:1.6;color:#2c3e50;background:#f1f5f9;padding:20px}
      .email-container{max-width:600px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.08)}
      .header{background:linear-gradient(135deg,#10b981,#059669);padding:36px 28px;text-align:center;position:relative}
      .logo-text{color:#fff;font-size:26px;font-weight:700;margin-bottom:6px}
      .logo-subtitle{color:rgba(255,255,255,.9);font-size:14px}
      .content{padding:40px 34px;text-align:center}
      .success-text{font-size:22px;font-weight:700;color:#10b981;margin-bottom:12px}
      .description{font-size:15px;color:#64748b;margin-bottom:22px;text-align:left}
      .reactivation-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:left;margin:20px 0}
      .reactivation-title{color:#10b981;font-weight:600;font-size:16px;margin-bottom:10px}
      .reactivation-details{color:#374151;font-size:14px;line-height:1.5}
      .login-button{display:inline-block;background:linear-gradient(135deg,#4f9cf9,#3b82f6);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:24px 0 8px 0;box-shadow:0 8px 25px rgba(79,156,249,.3)}
      .footer{background:#f8fafc;padding:22px 28px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px}
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <div class="logo-text">Nexus</div>
        <div class="logo-subtitle">Account Reactivated</div>
      </div>
      <div class="content">
        <h1 class="success-text">Account Reactivated</h1>
        <p class="description">
          Dear <strong>${userName}</strong>,<br><br>
          Great news! Your account has been reactivated and you can now access all features again.
        </p>
        
        <div class="reactivation-box">
          <div class="reactivation-title">Account Details</div>
          <div class="reactivation-details">
            <strong>Email:</strong> ${userEmail}<br>
            <strong>Status:</strong> Active<br>
            <strong>Reactivated:</strong> ${new Date().toLocaleDateString()}
          </div>
        </div>

        <p class="description">
          ${isServiceProvider ? 
            'As a service provider, you can now receive new bookings and access your provider dashboard.' : 
            'You can now log in and use all platform features.'
          }
        </p>

        <a href="${loginUrl}" class="login-button">Access Your Account</a>
        
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin:16px 0;font-size:13px;color:#059669;text-align:left">
          <strong>Welcome back!</strong> We appreciate your patience and look forward to continuing to serve you.
        </div>
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} Nexus. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;

  const textContent = `
Account Reactivated

Dear ${userName},

Great news! Your account has been reactivated and you can now access all features again.

Account Details:
- Email: ${userEmail}
- Status: Active
- Reactivated: ${new Date().toLocaleDateString()}

${isServiceProvider ? 
  'As a service provider, you can now receive new bookings and access your provider dashboard.' : 
  'You can now log in and use all platform features.'
}

Login: ${loginUrl}

Welcome back! We appreciate your patience and look forward to continuing to serve you.

© ${new Date().getFullYear()} Nexus. All rights reserved.
  `;

  const msg = {
    to,
    from,
    subject: `Account Reactivated - ${userName}`,
    text: textContent,
    html
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Reactivation email sent to ${to}`);
    return { sent: true, messageId: msg.messageId };
  } catch (error) {
    console.error('❌ Failed to send reactivation email:', error);
    return { sent: false, error: error.message };
  }
}

module.exports = {
  sendSuspensionEmail,
  sendReactivationEmail,
  buildSuspensionEmailHtml
};
