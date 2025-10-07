require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { supabase } = require('./lib/supabase');

// Import route modules
const categoriesRouter = require('./routes/categories');
const usersRouter = require('./routes/users');
const servicesRouter = require('./routes/services');

// Import middleware modules
const { getSystemMetrics } = require('./middleware/systemMetrics');
const { testDatabase } = require('./middleware/dbTest');
const { registerUser, loginUser, checkEmail } = require('./middleware/auth');
const { 
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
} = require('./middleware/userManagement');
const { uploadProfilePicture } = require('./middleware/profileUpload');
const { createServiceProvider, updateServiceProviderDetails, listServiceProviders } = require('./middleware/providerAdmin');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '6mb' }));

// Test Supabase connection on startup
console.log('🔌 Initializing Supabase connection...');
console.log('🔌 SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'NOT SET');
console.log('🔌 SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'NOT SET');
console.log('🔌 SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'NOT SET');

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

// Basic routes
app.get('/', (req, res) => {
  res.send('API is running 🚀');
});

// System metrics
app.get('/system/metrics', getSystemMetrics);

// Database testing
app.get('/test-db', testDatabase);

// Authentication routes
app.post('/register', registerUser);
app.post('/login', loginUser);
app.get('/check-email/:email', checkEmail);

// User management routes
app.get('/users', getAllUsers);
app.get('/profile/:userId', getUserProfile);
app.put('/profile/:userId', updateUserProfile);
app.put('/profile/:userId/role-details', updateRoleDetails);
app.get('/users/role/:role', getUsersByRole);
app.get('/users/status/:status', getUsersByStatus);
app.put('/users/:userId/status', updateUserStatus);
app.put('/users/:userId/verify-email', verifyUserEmail);
app.get('/users/stats', getUserStats);
app.get('/dashboard-route/:userId', getDashboardRoute);

// Profile picture upload
app.post('/users/profile-picture-upload', uploadProfilePicture);

// Provider admin endpoints
app.post('/admin/providers', createServiceProvider);
app.put('/admin/providers/:userId', updateServiceProviderDetails);
app.get('/admin/providers', listServiceProviders);

// Optional: Mirror under /api for dev proxies that expect /api prefix
app.post('/api/admin/providers', createServiceProvider);
app.put('/api/admin/providers/:userId', updateServiceProviderDetails);
app.get('/api/admin/providers', listServiceProviders);

// Mount modular routers
app.use('/categories', categoriesRouter);
app.use('/users', usersRouter);
app.use('/services', servicesRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 