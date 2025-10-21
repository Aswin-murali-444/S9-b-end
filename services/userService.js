const { createClient } = require('@supabase/supabase-js');

class UserService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  // Get user by ID with all related information
  async getUserById(userId) {
    try {
      // Get basic user info
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw userError;

      // Get user profile
      const { data: profile, error: profileError } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      // Get role-specific details based on user role
      let roleDetails = null;
      switch (user.role) {
        case 'customer':
          const { data: customerData } = await this.supabase
            .from('customer_details')
            .select('*')
            .eq('id', userId)
            .single();
          roleDetails = customerData;
          break;

        case 'service_provider':
          const { data: providerData } = await this.supabase
            .from('service_provider_details')
            .select('*')
            .eq('id', userId)
            .single();

          // Enrich with readable names for category and service
          if (providerData) {
            let serviceCategoryName = null;
            let serviceName = null;
            // Also read normalized experience from provider_profile_view where years_of_experience
            // comes from provider_profiles (preferred over service_provider_details)
            let normalizedExperienceYears = providerData?.experience_years ?? 0;
            try {
              const { data: profileView } = await this.supabase
                .from('provider_profile_view')
                .select('years_of_experience, spd_experience_years')
                .eq('provider_id', userId)
                .single();
              if (profileView) {
                normalizedExperienceYears = (profileView.years_of_experience ?? profileView.spd_experience_years ?? normalizedExperienceYears);
              }
            } catch (_) {}
            try {
              if (providerData.service_category_id) {
                const { data: cat } = await this.supabase
                  .from('service_categories')
                  .select('id,name')
                  .eq('id', providerData.service_category_id)
                  .single();
                serviceCategoryName = cat?.name || null;
              }
            } catch (_) {}
            try {
              if (providerData.service_id) {
                const { data: svc } = await this.supabase
                  .from('services')
                  .select('id,name')
                  .eq('id', providerData.service_id)
                  .single();
                serviceName = svc?.name || null;
              }
            } catch (_) {}

            roleDetails = {
              ...providerData,
              experience_years: normalizedExperienceYears,
              service_category_name: serviceCategoryName,
              service_name: serviceName
            };
          } else {
            roleDetails = providerData;
          }
          break;



        case 'driver':
          const { data: driverData } = await this.supabase
            .from('driver_details')
            .select('*')
            .eq('id', userId)
            .single();
          roleDetails = driverData;
          break;
      }

      return {
        ...user,
        profile: profile || {},
        roleDetails: roleDetails || {}
      };
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  // Get user by email
  async getUserByEmail(email) {
    try {
      const { data: user, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error) {
        // PGRST116 means no rows returned
        if (error.code === 'PGRST116') {
          throw new Error('User not found - PGRST116');
        }
        throw error;
      }
      return user;
    } catch (error) {
      throw new Error(`Failed to get user by email: ${error.message}`);
    }
  }

  // Create new user with role
  async createUser(userData) {
    try {
      const { email, password_hash, role, first_name, last_name, phone } = userData;

      // Start a transaction
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .insert({
          email,
          password_hash,
          role,
          status: 'pending_verification'
        })
        .select()
        .single();

      if (userError) throw userError;

      // Create user profile
      const { error: profileError } = await this.supabase
        .from('user_profiles')
        .insert({
          id: user.id,
          first_name,
          last_name,
          phone
        });

      if (profileError) throw profileError;

      // Create role-specific details table entry
      let roleDetailsError = null;
      switch (role) {
        case 'customer':
          const { error: customerError } = await this.supabase
            .from('customer_details')
            .insert({ id: user.id });
          roleDetailsError = customerError;
          break;

        case 'service_provider':
          const { error: providerError } = await this.supabase
            .from('service_provider_details')
            .insert({ id: user.id });
          roleDetailsError = providerError;
          break;



        case 'driver':
          const { error: driverError } = await this.supabase
            .from('driver_details')
            .insert({ id: user.id });
          roleDetailsError = driverError;
          break;
      }

      if (roleDetailsError) throw roleDetailsError;

      return user;
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  // Update user profile
  async updateUserProfile(userId, profileData) {
    try {
      const { error } = await this.supabase
        .from('user_profiles')
        .upsert({
          id: userId,
          ...profileData,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }
  }

  // Update role-specific details
  async updateRoleDetails(userId, role, detailsData) {
    try {
      let tableName = '';
      switch (role) {
        case 'customer':
          tableName = 'customer_details';
          break;
        case 'service_provider':
          tableName = 'service_provider_details';
          break;

        case 'driver':
          tableName = 'driver_details';
          break;
        default:
          throw new Error('Invalid role');
      }

      const { error } = await this.supabase
        .from(tableName)
        .upsert({
          id: userId,
          ...detailsData,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update role details: ${error.message}`);
    }
  }

  // Get dashboard route based on user role
  getDashboardRoute(userRole) {
    const dashboardRoutes = {
      customer: '/dashboard/customer',
      service_provider: '/dashboard/provider',
      supervisor: '/dashboard/supervisor',
      driver: '/dashboard/driver',
      admin: '/dashboard/admin'
    };

    // Instead of fallback to /dashboard, redirect to home
    return dashboardRoutes[userRole] || '/';
  }

  // Get all users by role
  async getUsersByRole(role) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select(`
          *,
          user_profiles (*)
        `)
        .eq('role', role);
        // Removed .eq('status', 'active') to show all users regardless of status

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Failed to get users by role: ${error.message}`);
    }
  }

  // Get all users regardless of status
  async getAllUsers() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select(`
          *,
          user_profiles (*)
        `);

      if (error) throw error;
      return data;
    } catch (error) {
      throw new Error(`Failed to get all users: ${error.message}`);
    }
  }

  // Update user status
  async updateUserStatus(userId, status) {
    try {
      const { error } = await this.supabase
        .from('users')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update user status: ${error.message}`);
    }
  }

  // Verify user email
  async verifyUserEmail(userId) {
    try {
      const { error } = await this.supabase
        .from('users')
        .update({ 
          email_verified: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to verify email: ${error.message}`);
    }
  }

  // Get user statistics
  async getUserStats() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('role, status')
        .eq('status', 'active');

      if (error) throw error;

      const stats = {
        total: data.length,
        customers: data.filter(u => u.role === 'customer').length,
        serviceProviders: data.filter(u => u.role === 'service_provider').length,
        supervisors: data.filter(u => u.role === 'supervisor').length,
        admins: data.filter(u => u.role === 'admin').length,
        drivers: data.filter(u => u.role === 'driver').length
      };

      return stats;
    } catch (error) {
      throw new Error(`Failed to get user stats: ${error.message}`);
    }
  }
}

module.exports = UserService;
