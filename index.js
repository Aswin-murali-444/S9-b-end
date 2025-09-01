require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const UserService = require('./services/userService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Test Supabase connection on startup
console.log('🔌 Initializing Supabase connection...');
console.log('🔌 SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'NOT SET');
console.log('🔌 SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'NOT SET');

// Test connection
supabase.from('users').select('count').limit(1)
  .then(({ data, error }) => {
    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      console.error('❌ Please check your .env file and Supabase credentials');
    } else {
      console.log('✅ Supabase connection successful');
    }
  })
  .catch(err => {
    console.error('💥 Supabase connection error:', err.message);
  });

// Initialize User Service
const userService = new UserService();

app.get('/', (req, res) => {
  res.send('API is running 🚀');
});

// Test endpoint to check database connection and table structure
app.get('/test-db', async (req, res) => {
  try {
    console.log('🧪 Testing database connection...');
    console.log('🧪 SUPABASE_URL:', process.env.SUPABASE_URL);
    console.log('🧪 SUPABASE_ANON_KEY (first 20 chars):', process.env.SUPABASE_ANON_KEY ? process.env.SUPABASE_ANON_KEY.substring(0, 20) + '...' : 'NOT SET');
    
    // Test 1: Check if we can connect to Supabase
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    console.log('🔍 Test 1 - Connection test:', { testData, testError });
    
    // Test 2: Try to get table info (simplified)
    console.log('🔍 Test 2 - Table info: RPC not available, skipping');
    const tableInfo = null;
    const tableError = 'RPC not available';
    
    // Test 3: Try to select from users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(10);
    
    console.log('🔍 Test 3 - Users table test:', { 
      usersCount: users ? users.length : 0, 
      usersError,
      sampleUser: users && users.length > 0 ? users[0] : null,
      allUsers: users
    });
    
    // Test 4: Check if we can see the specific email
    const { data: specificUser, error: specificError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'aswinmurali444@gmail.com');
    
    console.log('🔍 Test 4 - Specific email test:', { 
      specificUser, 
      specificError,
      found: specificUser && specificUser.length > 0
    });
    
    res.json({
      connection: !testError ? 'OK' : 'FAILED',
      supabaseUrl: process.env.SUPABASE_URL,
      tableInfo: tableInfo || 'Not available',
      usersCount: users ? users.length : 0,
      sampleUser: users && users.length > 0 ? users[0] : null,
      specificEmailFound: specificUser && specificUser.length > 0,
      allUsers: users,
      errors: {
        test: testError,
        table: tableError,
        users: usersError,
        specific: specificError
      }
    });
  } catch (error) {
    console.error('💥 Test endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get('/users', async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Registration Endpoint with Role
app.post('/register', async (req, res) => {
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
});

// User Login Endpoint
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Get user by email
    const user = await userService.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Simple password check (in production, use bcrypt.compare)
    const password_hash = Buffer.from(password).toString('base64');
    if (user.password_hash !== password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
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
});

// Get User Profile with Role Details
app.get('/profile/:userId', async (req, res) => {
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
});

// Update User Profile
app.put('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const profileData = req.body;
    
    const result = await userService.updateUserProfile(userId, profileData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Role-Specific Details
app.put('/profile/:userId/role-details', async (req, res) => {
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
});

// Get Users by Role
app.get('/users/role/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const users = await userService.getUsersByRole(role);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Users by Status
app.get('/users/status/:status', async (req, res) => {
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
});

// Update User Status
app.put('/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await userService.updateUserStatus(userId, status);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify User Email
app.put('/users/:userId/verify-email', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await userService.verifyUserEmail(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get User Statistics
app.get('/users/stats', async (req, res) => {
  try {
    const stats = await userService.getUserStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Dashboard Route for User
app.get('/dashboard-route/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userService.getUserById(userId);
    const dashboardRoute = userService.getDashboardRoute(user.role);
    
    res.json({ dashboardRoute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if email exists
app.get('/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
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
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 