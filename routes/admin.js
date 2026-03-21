const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { createNotification, notifyProviderLeaveDecision } = require('../services/notificationService');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Require admin secret for execute-sql (set ADMIN_SECRET_KEY in .env)
const requireAdminKey = (req, res, next) => {
  const key = process.env.ADMIN_SECRET_KEY;
  if (!key) {
    return res.status(503).json({ error: 'Execute-SQL not configured (ADMIN_SECRET_KEY missing)' });
  }
  const sent = req.headers['x-admin-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  if (sent !== key) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Execute SQL via mcp_execute_sql RPC (create tables, etc.) – no SQL Editor needed
router.post('/execute-sql', requireAdminKey, async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || typeof sql !== 'string' || !sql.trim()) {
      return res.status(400).json({ error: 'Body must include "sql": "<your SQL>"' });
    }
    const { data, error } = await supabase.rpc('mcp_execute_sql', { p_sql: sql.trim() });
    if (error) {
      console.error('execute-sql RPC error:', error.message);
      return res.status(400).json({
        error: error.message,
        hint: error.message.includes('function') || error.message.includes('does not exist')
          ? 'Run mcp-execute-any-sql.sql once in Supabase SQL Editor to create mcp_execute_sql'
          : undefined
      });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error('execute-sql error:', err);
    res.status(500).json({ error: err.message || 'Execute SQL failed' });
  }
});

// Approve or reject a provider wage increase request
router.post('/wage-requests/:requestId/decision', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { decision, adminUserId, comment, new_hourly_rate } = req.body || {};

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    const normalizedDecision = String(decision || '').toLowerCase();
    const isApprove = normalizedDecision === 'approve' || normalizedDecision === 'approved';
    const isReject = normalizedDecision === 'reject' || normalizedDecision === 'rejected';

    if (!isApprove && !isReject) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }

    // Resolve adminUserId (auth.users.id) to local users.id for FK safety
    let adminDbId = null;
    if (adminUserId) {
      try {
        const { data: adminRow, error: adminLookupError } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', adminUserId)
          .maybeSingle();

        if (adminLookupError) {
          console.warn('Failed to resolve admin auth_user_id to users.id:', adminLookupError.message || adminLookupError);
        } else if (adminRow && adminRow.id) {
          adminDbId = adminRow.id;
        }
      } catch (lookupErr) {
        console.warn('Error while resolving admin auth_user_id to users.id:', lookupErr);
      }
    }

    // Load wage request
    const { data: wageRequest, error: wageError } = await supabase
      .from('provider_wage_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (wageError) {
      console.error('Error fetching wage request:', wageError);
      return res.status(500).json({ error: 'Failed to load wage request' });
    }

    if (!wageRequest) {
      return res.status(404).json({ error: 'Wage request not found' });
    }

    if (wageRequest.status !== 'pending') {
      return res.status(400).json({ error: 'This wage request has already been processed' });
    }

    const providerId = wageRequest.provider_id;
    const currentRate = Number(wageRequest.current_hourly_rate) || 0;
    const requestedRate = Number(wageRequest.requested_hourly_rate) || 0;

    let finalRate = requestedRate;

    if (isApprove && new_hourly_rate !== undefined && new_hourly_rate !== null && new_hourly_rate !== '') {
      const parsed = parseFloat(new_hourly_rate);
      if (!parsed || !Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'new_hourly_rate must be a positive number when provided' });
      }
      finalRate = parsed;
    }

    if (isApprove && finalRate < currentRate) {
      return res.status(400).json({ error: 'New hourly rate cannot be lower than current rate' });
    }

    let updatedRequest = null;

    if (isApprove) {
      const nowIso = new Date().toISOString();

      // Update provider profile hourly_rate (provider_profiles)
      const { error: updateProfileError } = await supabase
        .from('provider_profiles')
        .update({
          hourly_rate: finalRate,
          updated_at: nowIso
        })
        .eq('provider_id', providerId);

      if (updateProfileError) {
        console.error('Error updating provider_profiles.hourly_rate:', updateProfileError);
        return res.status(500).json({ error: 'Failed to update provider profile hourly rate' });
      }

      // Also update service_provider_details basic_pay / hourly_rate so admin wage is consistent everywhere
      try {
        const { error: spUpdateError } = await supabase
          .from('service_provider_details')
          .update({
            basic_pay: finalRate,
            hourly_rate: finalRate,
            updated_at: nowIso
          })
          .eq('id', providerId);

        if (spUpdateError) {
          // Don't hard-fail if this table/columns are missing in some deployments
          console.warn('Warning: failed to update service_provider_details wages:', spUpdateError.message || spUpdateError);
        }
      } catch (spErr) {
        console.warn('Warning: exception while updating service_provider_details wages:', spErr);
      }

      // Mark wage request as approved
      const { data: reqData, error: reqUpdateError } = await supabase
        .from('provider_wage_requests')
        .update({
          status: 'approved',
          approved_hourly_rate: finalRate,
          admin_id: adminDbId,
          admin_comment: comment || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)
        .select()
        .single();

      if (reqUpdateError) {
        console.error('Error updating wage request status to approved:', reqUpdateError);
        return res.status(500).json({ error: 'Failed to update wage request status' });
      }

      updatedRequest = reqData;
    } else if (isReject) {
      // Mark wage request as rejected
      const { data: reqData, error: reqUpdateError } = await supabase
        .from('provider_wage_requests')
        .update({
          status: 'rejected',
          admin_id: adminDbId,
          admin_comment: comment || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)
        .select()
        .single();

      if (reqUpdateError) {
        console.error('Error updating wage request status to rejected:', reqUpdateError);
        return res.status(500).json({ error: 'Failed to update wage request status' });
      }

      updatedRequest = reqData;
    }

    // Dismiss all admin notifications for this wage request so banners disappear
    try {
      const nowIso = new Date().toISOString();
      const { error: notifUpdateError } = await supabase
        .from('notifications')
        .update({
          status: 'dismissed',
          dismissed_at: nowIso
        })
        .eq('type', 'wage_increase_request')
        .eq('metadata->>wage_request_id', requestId);

      if (notifUpdateError) {
        console.warn('Warning: failed to dismiss wage increase notifications:', notifUpdateError.message || notifUpdateError);
      }
    } catch (notifErr) {
      console.warn('Warning: exception while dismissing wage increase notifications:', notifErr);
    }

    // Resolve provider name for nicer notification
    let providerName = null;
    try {
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('id, email, user_profiles(first_name, last_name)')
        .eq('id', providerId)
        .maybeSingle();

      if (!userError && userRow) {
        const profilePart = Array.isArray(userRow.user_profiles)
          ? userRow.user_profiles[0]
          : userRow.user_profiles;
        const firstName = profilePart?.first_name || '';
        const lastName = profilePart?.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();
        providerName = fullName || userRow.email || null;
      }
    } catch (e) {
      console.warn('Unable to resolve provider display name for wage decision:', e);
    }

    // Notify provider about the decision
    try {
      const type = isApprove ? 'wage_request_approved' : 'wage_request_rejected';
      const title = isApprove ? 'Wage increase approved' : 'Wage increase rejected';
      const baseMessage = isApprove
        ? `Your wage increase request has been approved. Your new hourly rate is ₹${finalRate.toFixed(2)}.`
        : 'Your wage increase request has been reviewed and was not approved at this time.';

      const fullMessage = comment
        ? `${baseMessage} Admin comment: ${comment}`
        : baseMessage;

      await createNotification({
        type,
        title,
        message: fullMessage,
        recipient_id: providerId,
        sender_id: adminDbId || null,
        status: 'unread',
        priority: 'medium',
        metadata: {
          wage_request_id: requestId,
          provider_id: providerId,
          provider_name: providerName,
          decision: isApprove ? 'approved' : 'rejected',
          previous_hourly_rate: currentRate,
          requested_hourly_rate: requestedRate,
          new_hourly_rate: isApprove ? finalRate : currentRate,
          admin_comment: comment || null
        }
      });
    } catch (notifyError) {
      console.error('Failed to send wage decision notification to provider:', notifyError);
      // Do not fail the request because of notification issues
    }

    return res.json({
      success: true,
      message: isApprove ? 'Wage request approved and provider rate updated' : 'Wage request rejected',
      data: updatedRequest
    });
  } catch (err) {
    console.error('wage-requests decision error:', err);
    res.status(500).json({ error: err.message || 'Failed to process wage request decision' });
  }
});

// Approve or reject a provider time off / leave request
router.post('/leave-requests/:leaveId/decision', async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { decision } = req.body || {};

    if (!leaveId) {
      return res.status(400).json({ error: 'leaveId is required' });
    }

    const normalizedDecision = String(decision || '').toLowerCase();
    const isApprove = normalizedDecision === 'approve' || normalizedDecision === 'approved';
    const isReject = normalizedDecision === 'reject' || normalizedDecision === 'rejected';

    if (!isApprove && !isReject) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }

    const { data: leaveRow, error: leaveError } = await supabase
      .from('provider_time_off')
      .select('*')
      .eq('id', leaveId)
      .single();

    if (leaveError) {
      console.error('Error fetching provider_time_off row:', leaveError);
      return res.status(500).json({ error: 'Failed to load leave request' });
    }

    if (!leaveRow) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    if (leaveRow.status !== 'pending') {
      return res.status(400).json({ error: 'This leave request has already been processed' });
    }

    const newStatus = isApprove ? 'approved' : 'rejected';

    const { data: updated, error: updateError } = await supabase
      .from('provider_time_off')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', leaveId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating provider_time_off status:', updateError);
      return res.status(500).json({ error: 'Failed to update leave request status' });
    }

    // Notify provider about the decision
    try {
      await notifyProviderLeaveDecision(leaveRow.provider_id, {
        start_date: leaveRow.start_date,
        end_date: leaveRow.end_date,
        status: newStatus
      });
    } catch (notifyErr) {
      console.warn('Failed to notify provider about leave decision:', notifyErr);
      // do not fail the response on notification error
    }

    return res.json({
      success: true,
      message: newStatus === 'approved' ? 'Leave request approved' : 'Leave request rejected',
      data: updated
    });
  } catch (err) {
    console.error('leave-requests decision error:', err);
    res.status(500).json({ error: err.message || 'Failed to process leave request decision' });
  }
});

// Get a single provider wage request (for admin dashboard UI)
router.get('/wage-requests/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    const { data, error } = await supabase
      .from('provider_wage_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching provider_wage_request:', error);
      return res.status(500).json({ error: 'Failed to fetch wage request' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Wage request not found' });
    }

    return res.json({ success: true, data });
  } catch (err) {
    console.error('Get wage-request error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch wage request' });
  }
});

// Get live activity feed for admin dashboard
router.get('/activity-feed', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Get recent activities from multiple sources
    const activities = [];
    
    // 1. Recent user registrations
    const { data: recentUsers, error: usersError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        role,
        status,
        created_at,
        user_profiles!inner(
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (!usersError && recentUsers) {
      recentUsers.forEach(user => {
        const userName = user.user_profiles 
          ? `${user.user_profiles.first_name || ''} ${user.user_profiles.last_name || ''}`.trim()
          : user.email;
        
        activities.push({
          id: `user-${user.id}`,
          type: 'user_registration',
          actor: 'System',
          actor_id: 'system',
          action: 'User account created',
          description: `${userName} (${user.email})`,
          details: {
            user_id: user.id,
            role: user.role,
            status: user.status
          },
          timestamp: user.created_at,
          status: 'info',
          icon: 'user-plus'
        });
      });
    }
    
    // 2. Recent booking activities (bookings use user_id, assigned_provider_id)
    const { data: recentBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_status,
        created_at,
        updated_at,
        user_id,
        assigned_provider_id,
        users!user_id(
          email,
          user_profiles(first_name, last_name)
        ),
        services(name)
      `)
      .order('updated_at', { ascending: false })
      .limit(15);
    
    if (!bookingsError && recentBookings) {
      recentBookings.forEach(booking => {
        const up = booking.users?.user_profiles;
        const profile = Array.isArray(up) ? up[0] : up;
        const customerName = profile
          ? `${(profile.first_name || '')} ${(profile.last_name || '')}`.trim()
          : booking.users?.email || 'Unknown Customer';
        const serviceName = booking.services?.name || 'Service';
        
        let action, description, status, icon;
        
        switch (booking.booking_status) {
          case 'confirmed':
            action = 'Booking confirmed';
            description = `${serviceName} for ${customerName}`;
            status = 'success';
            icon = 'check-circle';
            break;
          case 'assigned':
            action = 'Provider assigned';
            description = `${serviceName} for ${customerName}`;
            status = 'info';
            icon = 'user-check';
            break;
          case 'in_progress':
            action = 'Service started';
            description = `${serviceName} for ${customerName}`;
            status = 'info';
            icon = 'play-circle';
            break;
          case 'completed':
            action = 'Service completed';
            description = `${serviceName} for ${customerName}`;
            status = 'success';
            icon = 'check-circle';
            break;
          case 'cancelled':
            action = 'Booking cancelled';
            description = `${serviceName} for ${customerName}`;
            status = 'warning';
            icon = 'x-circle';
            break;
          default:
            action = 'Booking updated';
            description = `${serviceName} for ${customerName}`;
            status = 'info';
            icon = 'info';
        }
        
        activities.push({
          id: `booking-${booking.id}`,
          type: 'booking_update',
          actor: 'System',
          actor_id: booking.assigned_provider_id || 'system',
          action: action,
          description: description,
          details: {
            booking_id: booking.id,
            status: booking.booking_status,
            service_name: serviceName,
            user_id: booking.user_id
          },
          timestamp: booking.updated_at,
          status: status,
          icon: icon
        });
      });
    }
    
    // 3. Recent provider profile updates
    const { data: recentProfiles, error: profilesError } = await supabase
      .from('provider_profiles')
      .select(`
        provider_id,
        status,
        updated_at,
        users!provider_profiles_provider_id_fkey(
          email,
          user_profiles!inner(
            first_name,
            last_name
          )
        )
      `)
      .order('updated_at', { ascending: false })
      .limit(10);
    
    if (!profilesError && recentProfiles) {
      recentProfiles.forEach(profile => {
        const providerName = profile.users?.user_profiles 
          ? `${profile.users.user_profiles.first_name || ''} ${profile.users.user_profiles.last_name || ''}`.trim()
          : profile.users?.email || 'Unknown Provider';
        
        let action, description, status, icon;
        
        switch (profile.status) {
          case 'active':
            action = 'Profile activated';
            description = `${providerName} profile is now active`;
            status = 'success';
            icon = 'check-circle';
            break;
          case 'rejected':
            action = 'Profile rejected';
            description = `${providerName} profile was rejected`;
            status = 'warning';
            icon = 'x-circle';
            break;
          case 'suspended':
            action = 'Profile suspended';
            description = `${providerName} profile was suspended`;
            status = 'error';
            icon = 'alert-triangle';
            break;
          default:
            action = 'Profile updated';
            description = `${providerName} profile was updated`;
            status = 'info';
            icon = 'edit';
        }
        
        activities.push({
          id: `profile-${profile.provider_id}`,
          type: 'profile_update',
          actor: 'Admin',
          actor_id: 'admin',
          action: action,
          description: description,
          details: {
            provider_id: profile.provider_id,
            status: profile.status
          },
          timestamp: profile.updated_at,
          status: status,
          icon: icon
        });
      });
    }
    
    // 4. Recent login activities
    const { data: recentLogins, error: loginsError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        last_login_at,
        user_profiles!inner(
          first_name,
          last_name
        )
      `)
      .not('last_login_at', 'is', null)
      .order('last_login_at', { ascending: false })
      .limit(5);
    
    if (!loginsError && recentLogins) {
      recentLogins.forEach(user => {
        const userName = user.user_profiles 
          ? `${user.user_profiles.first_name || ''} ${user.user_profiles.last_name || ''}`.trim()
          : user.email;
        
        activities.push({
          id: `login-${user.id}`,
          type: 'user_login',
          actor: userName,
          actor_id: user.id,
          action: 'User logged in',
          description: `${userName} (${user.email})`,
          details: {
            user_id: user.id,
            email: user.email
          },
          timestamp: user.last_login_at,
          status: 'info',
          icon: 'log-in'
        });
      });
    }
    
    // 5. Security Alerts - Failed Login Attempts (Simulated for demo)
    // In a real implementation, you would query an audit_log table
    const securityAlerts = [
      {
        id: 'security-1',
        type: 'failed_login_attempts',
        actor: 'System',
        actor_id: 'system',
        action: 'Multiple failed login attempts detected',
        description: 'User account david.w@company.com has 5 failed login attempts',
        details: {
          user_email: 'david.w@company.com',
          attempt_count: 5,
          ip_address: '192.168.1.45',
          last_attempt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() // 3 hours ago
        },
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        status: 'warning',
        icon: 'shield-alert',
        severity: 'high',
        actionable: true
      },
      {
        id: 'security-2',
        type: 'account_locked',
        actor: 'System',
        actor_id: 'system',
        action: 'Account locked due to suspicious activity',
        description: 'User account jane.d@company.com has been automatically locked',
        details: {
          user_email: 'jane.d@company.com',
          lock_reason: 'Multiple failed login attempts',
          locked_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        },
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        status: 'error',
        icon: 'lock',
        severity: 'high',
        actionable: true
      }
    ];
    
    activities.push(...securityAlerts);
    
    // 6. Admin Actions - Recent status changes and verifications
    const { data: adminActions, error: adminActionsError } = await supabase
      .from('provider_profiles')
      .select(`
        provider_id,
        status,
        updated_at,
        users!provider_profiles_provider_id_fkey(
          email,
          user_profiles!inner(
            first_name,
            last_name
          )
        )
      `)
      .in('status', ['active', 'suspended', 'rejected'])
      .order('updated_at', { ascending: false })
      .limit(8);
    
    if (!adminActionsError && adminActions) {
      adminActions.forEach(profile => {
        const providerName = profile.users?.user_profiles 
          ? `${profile.users.user_profiles.first_name || ''} ${profile.users.user_profiles.last_name || ''}`.trim()
          : profile.users?.email || 'Unknown Provider';
        
        let action, description, status, icon, severity;
        
        switch (profile.status) {
          case 'active':
            action = 'Admin activated profile';
            description = `${providerName} profile is now active and can receive bookings`;
            status = 'success';
            icon = 'check-circle';
            severity = 'low';
            break;
          case 'rejected':
            action = 'Admin rejected profile';
            description = `${providerName} profile was rejected and needs revision`;
            status = 'warning';
            icon = 'x-circle';
            severity = 'medium';
            break;
          case 'suspended':
            action = 'Admin suspended profile';
            description = `${providerName} profile was suspended and cannot receive bookings`;
            status = 'error';
            icon = 'alert-triangle';
            severity = 'high';
            break;
        }
        
        activities.push({
          id: `admin-action-${profile.provider_id}`,
          type: 'admin_action',
          actor: 'Admin',
          actor_id: 'admin',
          action: action,
          description: description,
          details: {
            provider_id: profile.provider_id,
            provider_name: providerName,
            action_type: profile.status,
            admin_action: true
          },
          timestamp: profile.updated_at,
          status: status,
          icon: icon,
          severity: severity,
          actionable: true
        });
      });
    }
    
    // 7. System Health Events (Simulated for demo)
    const systemEvents = [
      {
        id: 'system-1',
        type: 'system_health',
        actor: 'System',
        actor_id: 'system',
        action: 'High CPU usage detected',
        description: 'Server CPU usage has reached 85% for the last 10 minutes',
        details: {
          metric: 'cpu_usage',
          value: 85,
          threshold: 80,
          duration: '10 minutes'
        },
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        status: 'warning',
        icon: 'cpu',
        severity: 'medium',
        actionable: true
      },
      {
        id: 'system-2',
        type: 'system_health',
        actor: 'System',
        actor_id: 'system',
        action: 'Database backup completed',
        description: 'Scheduled database backup completed successfully',
        details: {
          backup_size: '2.4 GB',
          duration: '15 minutes',
          status: 'completed'
        },
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        status: 'success',
        icon: 'database',
        severity: 'low',
        actionable: false
      }
    ];
    
    activities.push(...systemEvents);
    
    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit the results
    const limitedActivities = activities.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: limitedActivities,
      total: activities.length
    });
    
  } catch (error) {
    console.error('Admin activity feed error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch activity feed' 
    });
  }
});

// GET /admin/bookings – list all bookings with customer, service, who accepted, when
async function getAdminBookings(req, res) {
  try {
    const { limit = 200, status } = req.query;

    let query = supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        service_id,
        category_id,
        scheduled_date,
        scheduled_time,
        duration_minutes,
        service_address,
        service_city,
        service_state,
        service_country,
        service_postal_code,
        contact_phone,
        contact_email,
        emergency_contact_name,
        emergency_contact_phone,
        special_instructions,
        additional_requirements,
        preferred_provider_notes,
        base_price,
        service_fee,
        tax_amount,
        total_amount,
        offer_applied,
        offer_discount_amount,
        payment_method,
        payment_status,
        payment_transaction_id,
        booking_status,
        assigned_provider_id,
        provider_assigned_at,
        provider_confirmed_at,
        created_at,
        updated_at,
        confirmed_at,
        started_at,
        completed_at,
        cancelled_at,
        customer_rating,
        customer_feedback,
        provider_rating,
        provider_feedback,
        feedback_submitted_at,
        admin_notes,
        internal_status,
        priority_level,
        booking_source,
        ip_address,
        user_agent,
        referral_source,
        customer:users!user_id(
          id,
          email,
          user_profiles(first_name, last_name)
        ),
        services(id, name, service_type),
        service_categories!category_id(id, name),
        provider:users!assigned_provider_id(
          id,
          email,
          user_profiles(first_name, last_name)
        ),
        assigned_team_id,
        is_team_booking
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10) || 200);

    if (status && status !== 'all') {
      query = query.eq('booking_status', status);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error('Admin bookings fetch error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch bookings' });
    }

    // Fetch latest audit row per booking (who assigned, when) if table exists
    const bookingIds = (bookings || []).map(b => b.id);
    let auditMap = {};
    let teamAssignmentMap = {};
    if (bookingIds.length > 0) {
      // Latest provider assign audit per booking
      const { data: auditRows } = await supabase
        .from('booking_assign_audit')
        .select('booking_id, assigned_provider_id, assigned_at, notes')
        .in('booking_id', bookingIds)
        .order('assigned_at', { ascending: false });
      (auditRows || []).forEach(row => {
        if (!auditMap[row.booking_id]) auditMap[row.booking_id] = row;
      });

      // Latest team assignment per booking (so admin can see if team declined/cancelled etc.)
      try {
        const { data: teamRows } = await supabase
          .from('team_assignments')
          .select('id, booking_id, assignment_status, notes, assigned_at')
          .in('booking_id', bookingIds)
          .order('assigned_at', { ascending: false });

        (teamRows || []).forEach(row => {
          if (!teamAssignmentMap[row.booking_id]) {
            teamAssignmentMap[row.booking_id] = row;
          }
        });
      } catch (e) {
        // team_assignments table might not exist in some environments; fail soft
        console.warn('Admin bookings: team_assignments lookup failed or missing:', e.message);
      }
    }

    const list = (bookings || []).map(b => {
      const customer = b.customer;
      const provider = b.provider;
      const custProfile = Array.isArray(customer?.user_profiles) ? customer?.user_profiles?.[0] : customer?.user_profiles;
      const provProfile = Array.isArray(provider?.user_profiles) ? provider?.user_profiles?.[0] : provider?.user_profiles;
      const customerName = custProfile
        ? `${(custProfile.first_name || '')} ${(custProfile.last_name || '')}`.trim()
        : customer?.email || '—';
      const providerName = provProfile
        ? `${(provProfile.first_name || '')} ${(provProfile.last_name || '')}`.trim()
        : provider?.email || '—';
      const audit = auditMap[b.id];
      const teamAssign = teamAssignmentMap[b.id];
      const category = Array.isArray(b.service_categories) ? b.service_categories[0] : b.service_categories;
      return {
        ...b,
        category_name: category?.name || '—',
        customer_name: customerName || '—',
        customer_email: customer?.email || '—',
        service_name: b.services?.name || '—',
        service_type: b.services?.service_type || null,
        provider_name: providerName || '—',
        provider_email: provider?.email || null,
        audit_assigned_at: audit?.assigned_at || null,
        audit_notes: audit?.notes || null,
        team_assignment_status: teamAssign?.assignment_status || null,
        team_assignment_notes: teamAssign?.notes || null,
        team_assignment_id: teamAssign?.id || null,
        team_assignment_assigned_at: teamAssign?.assigned_at || null
      };
    });

    res.json({ success: true, data: list });
  } catch (err) {
    console.error('Admin bookings error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch bookings' });
  }
}

router.get('/bookings', getAdminBookings);

// GET /admin/rating-summary – overall ratings summary for dashboard
router.get('/rating-summary', async (req, res) => {
  try {
    // Prefer aggregated ratings stored on services table if available
    const { data: services, error: svcError } = await supabase
      .from('services')
      .select('rating, review_count')
      .gt('review_count', 0);

    let averageRating = 0;
    let totalReviews = 0;

    if (!svcError && Array.isArray(services) && services.length > 0) {
      let weightedSum = 0;
      services.forEach((s) => {
        const r = Number(s.rating) || 0;
        const c = Number(s.review_count) || 0;
        if (c > 0 && r > 0) {
          weightedSum += r * c;
          totalReviews += c;
        }
      });
      if (totalReviews > 0) {
        averageRating = Math.round((weightedSum / totalReviews) * 10) / 10;
      }
    } else {
      // Fallback: calculate directly from service_reviews if services table not populated
      const { data: rows, error: revError, count } = await supabase
        .from('service_reviews')
        .select('rating', { count: 'exact' });
      if (!revError && Array.isArray(rows) && (count || 0) > 0) {
        const sum = rows.reduce((acc, r) => acc + (r.rating || 0), 0);
        averageRating = Math.round((sum / count) * 10) / 10;
        totalReviews = count;
      }
    }

    return res.json({
      success: true,
      data: {
        average_rating: averageRating,
        total_reviews: totalReviews
      }
    });
  } catch (err) {
    console.error('Admin rating-summary error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch rating summary' });
  }
});

// GET /admin/allocations – unified view of individual and team assignments
router.get('/allocations', async (req, res) => {
  try {
    const { limit = 200 } = req.query;

    // 1) Base bookings with core info + customer + provider + service
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_status,
        scheduled_date,
        scheduled_time,
        service_address,
        created_at,
        internal_status,
        user_id,
        service_id,
        category_id,
        assigned_provider_id,
        assigned_team_id,
        provider_assigned_at,
        provider_confirmed_at,
        customer:users!user_id(
          id,
          email,
          user_profiles(first_name, last_name)
        ),
        provider:users!assigned_provider_id(
          id,
          email,
          user_profiles(first_name, last_name)
        ),
        services(id, name, service_type)
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10) || 200);

    if (bookingsError) {
      console.error('Admin allocations: bookings fetch error:', bookingsError);
      return res.status(500).json({ error: bookingsError.message || 'Failed to fetch bookings for allocations' });
    }

    const bookingIds = (bookings || []).map(b => b.id);
    const allocations = [];

    let teamAssignmentMap = {};
    let acceptanceByAssignment = {};

    if (bookingIds.length > 0) {
      // 2) Latest team assignment per booking (if any)
      try {
        const { data: teamRows } = await supabase
          .from('team_assignments')
          .select(`
            id,
            booking_id,
            team_id,
            assignment_status,
            assigned_at,
            notes,
            teams (
              id,
              name
            )
          `)
          .in('booking_id', bookingIds)
          .order('assigned_at', { ascending: false });

        (teamRows || []).forEach(row => {
          if (!teamAssignmentMap[row.booking_id]) {
            teamAssignmentMap[row.booking_id] = row;
          }
        });

        const assignmentIds = Object.values(teamAssignmentMap).map(r => r.id);
        if (assignmentIds.length > 0) {
          const { data: accRows } = await supabase
            .from('team_assignment_acceptances')
            .select('team_assignment_id, status')
            .in('team_assignment_id', assignmentIds);

          (accRows || []).forEach(row => {
            const key = row.team_assignment_id;
            if (!acceptanceByAssignment[key]) {
              acceptanceByAssignment[key] = { accepted: 0, declined: 0, pending: 0 };
            }
            const status = row.status || 'pending';
            if (status === 'accepted') acceptanceByAssignment[key].accepted += 1;
            else if (status === 'declined') acceptanceByAssignment[key].declined += 1;
            else acceptanceByAssignment[key].pending += 1;
          });
        }
      } catch (e) {
        console.warn('Admin allocations: team_assignments/acceptances lookup failed:', e.message);
      }
    }

    // 3) Build unified allocation rows
    (bookings || []).forEach(b => {
      const customer = b.customer;
      const provider = b.provider;
      const service = b.services;
      const custProfileRaw = customer?.user_profiles;
      const custProfile = Array.isArray(custProfileRaw) ? custProfileRaw[0] : custProfileRaw;
      const provProfileRaw = provider?.user_profiles;
      const provProfile = Array.isArray(provProfileRaw) ? provProfileRaw[0] : provProfileRaw;

      const customerName = custProfile
        ? `${(custProfile.first_name || '').trim()} ${(custProfile.last_name || '').trim()}`.trim()
        : customer?.email || '—';
      const providerName = provProfile
        ? `${(provProfile.first_name || '').trim()} ${(provProfile.last_name || '').trim()}`.trim()
        : provider?.email || null;

      const teamAssign = teamAssignmentMap[b.id];
      const teamName = teamAssign?.teams?.name || null;
      const acceptSummary = teamAssign ? (acceptanceByAssignment[teamAssign.id] || { accepted: 0, declined: 0, pending: 0 }) : null;

      // Determine allocation type
      let allocationType = 'unassigned';
      if (teamAssign) allocationType = 'team';
      else if (b.assigned_provider_id) allocationType = 'individual';

      allocations.push({
        booking_id: b.id,
        booking_status: b.booking_status,
        scheduled_date: b.scheduled_date,
        scheduled_time: b.scheduled_time,
        service_name: service?.name || '—',
        service_type: service?.service_type || null,
        customer_name: customerName || '—',
        customer_email: customer?.email || null,
        service_address: b.service_address || '—',
        allocation_type: allocationType,
        individual: allocationType === 'individual' ? {
          provider_id: b.assigned_provider_id,
          provider_name: providerName || '—',
          provider_email: provider?.email || null,
          assigned_at: b.provider_assigned_at,
          confirmed_at: b.provider_confirmed_at
        } : null,
        team: allocationType === 'team' ? {
          assignment_id: teamAssign?.id || null,
          team_id: teamAssign?.team_id || null,
          team_name: teamName || '—',
          assignment_status: teamAssign?.assignment_status || null,
          assigned_at: teamAssign?.assigned_at || null,
          notes: teamAssign?.notes || null,
          responses: acceptSummary || { accepted: 0, declined: 0, pending: 0 }
        } : null
      });
    });

    res.json({
      success: true,
      data: allocations
    });
  } catch (err) {
    console.error('Admin allocations error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch allocations' });
  }
});

// GET /admin/billing-summary – money from customers and to workers
router.get('/billing-summary', async (req, res) => {
  try {
    const { limit = 200 } = req.query;
    const limitInt = parseInt(limit, 10) || 200;

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        assigned_provider_id,
        booking_status,
        payment_status,
        payment_method,
        payment_transaction_id,
        created_at,
        completed_at,
        base_price,
        service_fee,
        tax_amount,
        total_amount,
        services(id, name),
        customer:users!user_id(
          id,
          email,
          user_profiles(first_name, last_name)
        ),
        provider:users!assigned_provider_id(
          id,
          email,
          user_profiles(first_name, last_name)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limitInt);

    if (error) {
      console.error('Admin billing-summary: bookings fetch error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch billing summary' });
    }

    const customerPayments = [];
    let providerPayouts = [];
    const transactions = [];

    (bookings || []).forEach((b) => {
      const serviceName = b.services?.name || '—';
      const custProfileRaw = b.customer?.user_profiles;
      const custProfile = Array.isArray(custProfileRaw) ? custProfileRaw[0] : custProfileRaw;
      const customerName = custProfile
        ? `${(custProfile.first_name || '').trim()} ${(custProfile.last_name || '').trim()}`.trim()
        : b.customer?.email || '—';
      const provProfileRaw = b.provider?.user_profiles;
      const provProfile = Array.isArray(provProfileRaw) ? provProfileRaw[0] : provProfileRaw;
      const providerName = provProfile
        ? `${(provProfile.first_name || '').trim()} ${(provProfile.last_name || '').trim()}`.trim()
        : b.provider?.email || null;

      const base = Number(b.base_price) || 0;
      const fee = Number(b.service_fee) || 0;
      const tax = Number(b.tax_amount) || 0;
      const total = Number(b.total_amount) || 0;

      // Money collected from customers: any booking with a non-pending payment status
      if (b.payment_status && b.payment_status !== 'pending') {
        customerPayments.push({
          booking_id: b.id,
          customer_name: customerName,
          service_name: serviceName,
          total_amount: total,
          base_price: base,
          service_fee: fee,
          tax_amount: tax,
          payment_status: b.payment_status,
          payment_method: b.payment_method,
          transaction_id: b.payment_transaction_id,
          created_at: b.created_at
        });

        transactions.push({
          id: b.payment_transaction_id || b.id,
          type: 'payment',
          ref: serviceName,
          amount: total,
          status: b.payment_status,
          method: b.payment_method,
          created_at: b.created_at
        });
      }

      // (Legacy fallback for worker money when booking_worker_payouts is not available)
      if (b.booking_status === 'completed' && b.assigned_provider_id) {
        providerPayouts.push({
          id: b.id,
          booking_id: b.id,
          provider: providerName || '—',
          amount: base || total, // treat base_price as provider share
          status: b.payment_status === 'completed' ? 'earned' : 'pending',
          date: b.completed_at || b.created_at,
          service_name: serviceName
        });
      }
    });

    // Prefer the dedicated booking_worker_payouts table for worker payments,
    // but gracefully fall back to the legacy booking-based view if needed.
    try {
      const { data: payoutRows, error: payoutErr } = await supabase
        .from('booking_worker_payouts')
        .select(`
          id,
          booking_id,
          worker_id,
          total_amount,
          company_commission_amount,
          worker_payout_amount,
          payout_status,
          payout_method,
          payout_reference,
          paid_at,
          worker:users!worker_id (
            id,
            email,
            user_profiles (
              first_name,
              last_name
            ),
            service_provider_details (
              upi_id,
              bank_account_number,
              bank_ifsc,
              bank_name,
              account_holder_name,
              payout_preference
            )
          )
        `)
        .order('paid_at', { ascending: false })
        .limit(limitInt);

      if (!payoutErr && Array.isArray(payoutRows) && payoutRows.length > 0) {
        providerPayouts = payoutRows.map((p) => {
          const profileRaw = p.worker?.user_profiles;
          const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
          const workerName = profile
            ? `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim()
            : p.worker?.email || '—';

          const bank = p.worker?.service_provider_details || {};

          return {
            id: p.id,
            booking_id: p.booking_id,
            worker_id: p.worker_id,
            provider: workerName,
            amount: Number(p.worker_payout_amount) || 0,
            status: p.payout_status || 'paid',
            date: p.paid_at || null,
            method: p.payout_method || (bank.payout_preference || 'auto'),
            payout_reference: p.payout_reference || null,
            upi_id: bank.upi_id || null,
            bank_account_number: bank.bank_account_number || null,
            bank_ifsc: bank.bank_ifsc || null,
            bank_name: bank.bank_name || null,
            account_holder_name: bank.account_holder_name || null,
            payout_preference: bank.payout_preference || null
          };
        });
      } else if (payoutErr) {
        console.warn('Admin billing-summary: booking_worker_payouts fetch error (falling back to bookings):', payoutErr.message || payoutErr);
      }
    } catch (payoutEx) {
      console.warn('Admin billing-summary: exception while fetching booking_worker_payouts (falling back to bookings):', payoutEx);
    }

    return res.json({
      success: true,
      data: {
        // Use snake_case keys expected by frontend, but map from our camelCase variables
        customer_payments: customerPayments,
        provider_payouts: providerPayouts,
        transactions
      }
    });
  } catch (err) {
    console.error('Admin billing-summary error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch billing summary' });
  }
});

// GET /admin/provider-time-off – list providers currently or soon on leave
router.get('/provider-time-off', async (req, res) => {
  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const { data, error } = await supabase
      .from('provider_time_off')
      .select(`
        id,
        provider_id,
        start_date,
        end_date,
        status,
        reason,
        created_at,
        updated_at,
        users:provider_id (
          email,
          user_profiles(first_name, last_name, phone)
        )
      `)
      .neq('status', 'cancelled')
      .neq('status', 'rejected')
      .gte('end_date', todayStr)
      .order('start_date', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Admin provider-time-off fetch error:', error);
      return res.status(500).json({ error: error.message || 'Failed to fetch provider time off' });
    }

    const list = (data || []).map((row) => {
      const up = row.users?.user_profiles;
      const profile = Array.isArray(up) ? up[0] : up;
      const first = profile?.first_name || '';
      const last = profile?.last_name || '';
      const fullName = `${first} ${last}`.trim();
      return {
        id: row.id,
        provider_id: row.provider_id,
        provider_name: fullName || row.users?.email || 'Service provider',
        email: row.users?.email || null,
        phone: profile?.phone || null,
        start_date: row.start_date,
        end_date: row.end_date,
        status: row.status,
        reason: row.reason,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });

    return res.json({
      success: true,
      data: list
    });
  } catch (err) {
    console.error('Admin provider-time-off error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch provider time off' });
  }
});

// GET /admin/provider-availability – flattened availability rows for providers (next 7 days, from weekly pattern)
router.get('/provider-availability', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const max = new Date(today);
    max.setDate(max.getDate() + 7);

    const { data: spRows, error: spError } = await supabase
      .from('service_provider_details')
      .select('id, availability');

    if (spError) {
      console.error('Admin provider-availability: service_provider_details fetch error:', spError);
      return res.status(500).json({ error: spError.message || 'Failed to fetch provider availability' });
    }

    const providerIds = (spRows || [])
      .map((row) => row.id)
      .filter(Boolean);

    let userById = {};
    if (providerIds.length > 0) {
      const { data: userRows, error: usersError } = await supabase
        .from('users')
        .select('id, email, user_profiles(first_name, last_name, phone)')
        .in('id', providerIds);

      if (usersError) {
        console.warn('Admin provider-availability: users fetch error:', usersError.message);
      } else {
        userById = (userRows || []).reduce((acc, u) => {
          const up = Array.isArray(u.user_profiles) ? u.user_profiles[0] : u.user_profiles;
          const first = up?.first_name || '';
          const last = up?.last_name || '';
          const fullName = `${first} ${last}`.trim();
          acc[u.id] = {
            provider_name: fullName || u.email || 'Service provider',
            email: u.email || null,
            phone: up?.phone || null
          };
          return acc;
        }, {});
      }
    }

    const availabilityRows = [];
    const dayIndex = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };

    (spRows || []).forEach((row) => {
      const providerId = row.id;
      const meta = userById[providerId] || {};
      const availability = row.availability || {};

      Object.entries(availability).forEach(([dayKey, schedule]) => {
        if (!schedule || schedule.available === false) return;
        const targetIndex = dayIndex[dayKey];
        if (targetIndex === undefined) return;

        // Project this weekly pattern into the coming 7 days
        for (let offset = 0; offset <= 6; offset++) {
          const d = new Date(today);
          d.setDate(today.getDate() + offset);
          if (d > max) break;
          if (d.getDay() !== targetIndex) continue;
          const dateStr = d.toISOString().slice(0, 10);

          availabilityRows.push({
            id: `${providerId}-${dayKey}-${dateStr}`,
            provider_id: providerId,
            provider_name: meta.provider_name || 'Service provider',
            email: meta.email || null,
            phone: meta.phone || null,
            day: dayKey,
            date: dateStr,
            start: schedule.start || '08:00',
            end: schedule.end || '17:00'
          });
        }
      });
    });

    // Sort by date then provider name
    availabilityRows.sort((a, b) => {
      if (a.date === b.date) {
        return (a.provider_name || '').localeCompare(b.provider_name || '');
      }
      return a.date < b.date ? -1 : 1;
    });

    return res.json({
      success: true,
      data: availabilityRows
    });
  } catch (err) {
    console.error('Admin provider-availability error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch provider availability' });
  }
});

module.exports = router;
module.exports.getAdminBookings = getAdminBookings;
