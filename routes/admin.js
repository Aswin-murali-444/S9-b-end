const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    
    // 2. Recent booking activities
    const { data: recentBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        created_at,
        updated_at,
        service_provider_id,
        customer_id,
        service_name,
        users!bookings_customer_id_fkey(
          email,
          user_profiles!inner(
            first_name,
            last_name
          )
        )
      `)
      .order('updated_at', { ascending: false })
      .limit(15);
    
    if (!bookingsError && recentBookings) {
      recentBookings.forEach(booking => {
        const customerName = booking.users?.user_profiles 
          ? `${booking.users.user_profiles.first_name || ''} ${booking.users.user_profiles.last_name || ''}`.trim()
          : booking.users?.email || 'Unknown Customer';
        
        let action, description, status, icon;
        
        switch (booking.status) {
          case 'confirmed':
            action = 'Booking confirmed';
            description = `${booking.service_name} for ${customerName}`;
            status = 'success';
            icon = 'check-circle';
            break;
          case 'in_progress':
            action = 'Service started';
            description = `${booking.service_name} for ${customerName}`;
            status = 'info';
            icon = 'play-circle';
            break;
          case 'completed':
            action = 'Service completed';
            description = `${booking.service_name} for ${customerName}`;
            status = 'success';
            icon = 'check-circle';
            break;
          case 'cancelled':
            action = 'Booking cancelled';
            description = `${booking.service_name} for ${customerName}`;
            status = 'warning';
            icon = 'x-circle';
            break;
          default:
            action = 'Booking updated';
            description = `${booking.service_name} for ${customerName}`;
            status = 'info';
            icon = 'info';
        }
        
        activities.push({
          id: `booking-${booking.id}`,
          type: 'booking_update',
          actor: 'Service Provider',
          actor_id: booking.service_provider_id,
          action: action,
          description: description,
          details: {
            booking_id: booking.id,
            status: booking.status,
            service_name: booking.service_name,
            customer_id: booking.customer_id
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

module.exports = router;
