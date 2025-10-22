const UserService = require('../services/userService');
const { supabase } = require('../lib/supabase');

// Initialize User Service
const userService = new UserService();

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get User Profile with Role Details
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const userData = await userService.getUserById(userId);
    
    // Get dashboard route
    const dashboardRoute = userService.getDashboardRoute(userData.role);
    
    res.json({
      ...userData,
      dashboardRoute
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update User Profile
const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const profileData = req.body;
    
    const result = await userService.updateUserProfile(userId, profileData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Role-Specific Details
const updateRoleDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, details } = req.body;
    
    if (!role || !details) {
      return res.status(400).json({ error: 'Role and details are required' });
    }

    const result = await userService.updateRoleDetails(userId, role, details);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Users by Role
const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const users = await userService.getUsersByRole(role);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Users by Status
const getUsersByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        user_profiles (*)
      `)
      .eq('status', status);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update User Status
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, reason = '' } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await userService.updateUserStatus(userId, status, reason);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify User Email
const verifyUserEmail = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await userService.verifyUserEmail(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get User Statistics
const getUserStats = async (req, res) => {
  try {
    const stats = await userService.getUserStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Dashboard Route for User
const getDashboardRoute = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userService.getUserById(userId);
    const dashboardRoute = userService.getDashboardRoute(user.role);
    
    res.json({ dashboardRoute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllUsers,
  getUserProfile,
  updateUserProfile,
  updateRoleDetails,
  getUsersByRole,
  getUsersByStatus,
  updateUserStatus,
  verifyUserEmail,
  getUserStats,
  getDashboardRoute
};
