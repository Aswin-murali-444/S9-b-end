const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const { supabase } = require('../lib/supabase');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function generateTempPassword() {
  const part = crypto.randomBytes(6).toString('base64url');
  return `Sp@${part}${Math.floor(100 + Math.random() * 900)}`;
}

function buildCredentialsEmailHtml({ appName = 'Nexus', fullName = 'Service Provider', email, password, loginUrl }) {
  const safeLogin = loginUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appName} • Your Account Credentials</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;line-height:1.6;color:#2c3e50;background:#f1f5f9;padding:20px}.email-container{max-width:600px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.08)}.header{background:linear-gradient(135deg,#4f9cf9,#3b82f6);padding:36px 28px;text-align:center;position:relative}.logo-text{color:#fff;font-size:26px;font-weight:700;margin-bottom:6px}.logo-subtitle{color:rgba(255,255,255,.9);font-size:14px}.content{padding:40px 34px;text-align:center}.welcome-text{font-size:22px;font-weight:700;color:#2c3e50;margin-bottom:12px}.description{font-size:15px;color:#64748b;margin-bottom:22px}.cred-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:left}.cred-row{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px dashed #e5e7eb}.cred-row:last-child{border-bottom:none}.label{color:#64748b;font-size:13px}.value{font-weight:600;color:#1f2937}.login-button{display:inline-block;background:linear-gradient(135deg,#4f9cf9,#3b82f6);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:24px 0 8px 0;box-shadow:0 8px 25px rgba(79,156,249,.3)}.security-note{background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:14px;margin:16px 0;font-size:13px;color:#92400e;text-align:left}.footer{background:#f8fafc;padding:22px 28px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px}
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <div class="logo-text">${appName}</div>
        <div class="logo-subtitle">Service Provider Credentials</div>
      </div>
      <div class="content">
        <h1 class="welcome-text">Welcome${fullName ? `, ${fullName}` : ''}! 🎉</h1>
        <p class="description">Your account has been created by the admin. Use the credentials below to log in and then change your password.</p>
        <div class="cred-box">
          <div class="cred-row"><span class="label">Email</span><span class="value">${email}</span></div>
          <div class="cred-row"><span class="label">Temporary Password</span><span class="value">${password}</span></div>
        </div>
        <a href="${safeLogin}" class="login-button">Go to Dashboard</a>
        <div class="security-note"><strong>Security tip:</strong> Please sign in and change your password immediately. Do not share these credentials with anyone.</div>
      </div>
      <div class="footer">© ${new Date().getFullYear()} ${appName}. All rights reserved.</div>
    </div>
  </body>
  </html>`;
}

async function sendProviderCredentialsEmail({ to, email, password, fullName }) {
  if (!process.env.SENDGRID_API_KEY) return { skipped: true };
  const from = process.env.SENDGRID_FROM_EMAIL || 'no-reply@example.com';
  const html = buildCredentialsEmailHtml({
    appName: 'Nexus',
    fullName,
    email,
    password,
    loginUrl: process.env.FRONTEND_URL
  });
  const msg = {
    to,
    from,
    subject: 'Your Service Provider Credentials',
    text: `Welcome! Your account has been created. Email: ${email} Password: ${password}. Login: ${process.env.FRONTEND_URL || 'http://localhost:5173'}. Please change your password after login.`,
    html
  };
  await sgMail.send(msg);
  return { sent: true };
}

// Admin endpoint: create service provider and email credentials
const createServiceProvider = async (req, res) => {
  try {
    const { email, full_name, phone, specialization, service_category_id, service_id, notes, sendEmail = true } = req.body || {};

    if (!email || !full_name) {
      return res.status(400).json({ error: 'email and full_name are required' });
    }

    // Split full name into first and last name
    const nameParts = full_name.trim().split(' ');
    const first_name = nameParts[0] || '';
    const last_name = nameParts.slice(1).join(' ') || '';

    // Check if email already exists (Auth and app users table)
    const normalizedEmail = String(email).toLowerCase().trim();
    let authUserExists = false;
    try {
      const { data: authLookup } = await supabase.auth.admin.getUserByEmail(normalizedEmail);
      authUserExists = Boolean(authLookup?.user);
    } catch (_) {}
    const { data: existing, error: existErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existErr) return res.status(500).json({ error: existErr.message });
    if (existing || authUserExists) return res.status(409).json({ error: 'Email already registered' });

    // Auto-generate secure password
    const passwordPlain = generateTempPassword();

    // Create Supabase Auth user (preferred)
    let authUserId = null;
    try {
      const { data: createdAuth, error: authErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: passwordPlain,
        email_confirm: true,
        user_metadata: { role: 'service_provider', first_name, last_name, phone }
      });
      if (authErr) throw authErr;
      authUserId = createdAuth?.user?.id || null;
    } catch (authCreateErr) {
      console.warn('Auth create failed, falling back to app users table only:', authCreateErr?.message || authCreateErr);
    }

    // Create application user row (id links to auth user when available)
    const appUserInsert = {
      email: normalizedEmail,
      role: 'service_provider',
      status: 'pending_verification',
      // keep legacy column satisfied for NOT NULL constraint
      password_hash: Buffer.from(passwordPlain).toString('base64')
    };
    if (authUserId) appUserInsert.id = authUserId;
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert(appUserInsert)
      .select()
      .single();
    if (userError) return res.status(500).json({ error: userError.message });

    // Profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({ id: user.id, first_name, last_name, phone: phone || null });
    if (profileError) return res.status(500).json({ error: profileError.message });

    // Provider details
    const detailsPayload = {
      id: user.id,
      specialization: specialization || null,
      service_category_id: service_category_id || null,
      service_id: service_id || null,
      status: 'pending_verification',
      created_by_admin: true,
      notes: notes || null
    };
    const { error: providerError } = await supabase
      .from('service_provider_details')
      .insert(detailsPayload);
    if (providerError) return res.status(500).json({ error: providerError.message });

    // Send credentials email if requested
    let emailResult = { skipped: !sendEmail };
    let emailError = null;
    if (sendEmail) {
      try {
        emailResult = await sendProviderCredentialsEmail({ to: email, email, password: passwordPlain, fullName: full_name });
      } catch (mailErr) {
        // Do not fail user creation if email fails
        console.warn('Email send failed:', mailErr?.message || mailErr);
        emailError = mailErr?.message || 'Email send failed';
      }
    }

    return res.status(201).json({
      message: 'Service provider created',
      user: { id: user.id, email: user.email, role: 'service_provider', status: 'pending_verification' },
      emailSent: Boolean(emailResult?.sent),
      emailSkipped: Boolean(emailResult?.skipped),
      emailError
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update provider details
const updateServiceProviderDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { specialization, service_category_id, service_id, status, notes } = req.body || {};

    const update = {};
    if (typeof specialization !== 'undefined') update.specialization = specialization;
    if (typeof service_category_id !== 'undefined') update.service_category_id = service_category_id;
    if (typeof service_id !== 'undefined') update.service_id = service_id;
    if (typeof status !== 'undefined') update.status = status;
    if (typeof notes !== 'undefined') update.notes = notes;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('service_provider_details')
      .update(update)
      .eq('id', userId)
      .select('*')
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// List providers with profile and details
const listServiceProviders = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`id, email, role, status, created_at,
               user_profiles(first_name, last_name, phone),
               service_provider_details(specialization, service_category_id, service_id, status, created_at, updated_at)`) 
      .eq('role', 'service_provider')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ providers: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createServiceProvider,
  updateServiceProviderDetails,
  listServiceProviders
};


