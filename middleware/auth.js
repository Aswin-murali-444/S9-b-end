const UserService = require('../services/userService');

// Initialize User Service
const userService = new UserService();

// User Registration Endpoint with Role
const registerUser = async (req, res) => {
  try {
    const { email, password, role, first_name, last_name, phone } = req.body;
    
    if (!email || !password || !role || !first_name || !last_name) {
      return res.status(400).json({ 
        error: 'Email, password, role, first_name, and last_name are required.' 
      });
    }

    // Validate role
    const validRoles = ['customer', 'service_provider', 'supervisor', 'driver', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role. Must be one of: customer, service_provider, supervisor, driver, admin' 
      });
    }

    // Hash password (in production, use bcrypt)
    const password_hash = Buffer.from(password).toString('base64'); // Simple encoding for demo

    // Create user using service
    const user = await userService.createUser({
      email,
      password_hash,
      role,
      first_name,
      last_name,
      phone
    });

    res.status(201).json({ 
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// User Login Endpoint
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Get user by email
    let user;
    try {
      user = await userService.getUserByEmail(email);
    } catch (e) {
      // Treat missing user or lookup errors as invalid credentials
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Simple password check (in production, use bcrypt.compare)
    const password_hash = Buffer.from(password).toString('base64');
    if (user.password_hash !== password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Block login if user status is not active
    if (user.status !== 'active') {
      const reason = user.status === 'suspended'
        ? 'Account is suspended'
        : user.status === 'inactive'
          ? 'Account is inactive'
          : user.status === 'pending_verification'
            ? 'Account pending verification'
            : 'Account status does not allow login';
      return res.status(403).json({ error: reason, status: user.status });
    }

    // Get dashboard route based on role
    const dashboardRoute = userService.getDashboardRoute(user.role);

    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status
      },
      dashboardRoute
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Check if email exists
const checkEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const { supabase } = require('../lib/supabase');
    
    console.log('🔍 Backend: Email check request for:', email);
    
    if (!email) {
      console.log('❌ Backend: No email parameter provided');
      return res.status(400).json({ 
        error: 'Email parameter is required',
        exists: false,
        message: 'Email parameter is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Backend: Invalid email format:', email);
      return res.status(400).json({ 
        error: 'Invalid email format',
        exists: false,
        message: 'Invalid email format'
      });
    }

    // Normalize email (lowercase and trim)
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if user exists in the users table
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email, role, status, supabase_auth, auth_user_id')
      .eq('email', normalizedEmail);
    
    if (userError) {
      console.error('❌ Backend: Database error:', userError);
      return res.status(500).json({ 
        error: 'Database error checking email',
        exists: false,
        message: 'Error checking email availability'
      });
    }
    
    // Check if any users were found
    const userExists = users && users.length > 0;
    const existingUser = userExists ? users[0] : null;
    
    console.log('✅ Backend: Email check result:', {
      email: normalizedEmail,
      exists: userExists,
      message: userExists ? 'Email already registered' : 'Email available',
      usersFound: users ? users.length : 0,
      existingUser: existingUser ? {
        id: existingUser.id,
        role: existingUser.role,
        status: existingUser.status,
        supabase_auth: existingUser.supabase_auth,
        auth_user_id: existingUser.auth_user_id
      } : null
    });
    
    if (userExists) {
      res.json({ 
        exists: true,
        message: 'Email already registered'
      });
    } else {
      res.json({ 
        exists: false,
        message: 'Email available'
      });
    }
  } catch (error) {
    console.error('💥 Backend: Unexpected error:', error);
    res.status(500).json({ 
      error: 'Unexpected error checking email availability',
      exists: false,
      message: 'Error checking email availability'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  checkEmail
};
