require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { supabase } = require('./lib/supabase');

// Import route modules
const categoriesRouter = require('./routes/categories');
const usersRouter = require('./routes/users');
const servicesRouter = require('./routes/services');
const bookingsRouter = require('./routes/bookings');
const paymentsRouter = require('./routes/payments');
const teamsRouter = require('./routes/teams');
const teamBookingsRouter = require('./routes/team-bookings');
const aadhaarRouter = require('./routes/aadhaar');
const cartWishlistRouter = require('./routes/cart-wishlist');
const aiAssistantRouter = require('./routes/ai-assistant');
const notificationsRouter = require('./routes/notifications');
const adminRouter = require('./routes/admin');

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
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '6mb' }));

// Test Supabase connection on startup
console.log('🔌 Initializing Supabase connection...');
console.log('🔌 SUPABASE_URL:', process.env.SUPABASE_URL ? 'Set' : 'NOT SET');
console.log('🔌 SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Set' : 'NOT SET');
console.log('🔌 SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'NOT SET');
console.log('🪪 AADHAAR_API_URL:', process.env.AADHAAR_API_URL ? 'Set' : 'NOT SET');
console.log('🪪 AADHAAR_API_KEY:', process.env.AADHAAR_API_KEY ? 'Set' : 'NOT SET');

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
  res.json({ 
    status: 'API is running 🚀', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
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
app.use('/bookings', bookingsRouter);
app.use('/payments', paymentsRouter);
app.use('/teams', teamsRouter);
app.use('/team-bookings', teamBookingsRouter);
app.use('/aadhaar', aadhaarRouter);
app.use('/cart-wishlist', cartWishlistRouter);
app.use('/ai-assistant', aiAssistantRouter);
app.use('/notifications', notificationsRouter);
app.use('/admin', adminRouter);

// Optional mirrors for dev proxies expecting /api prefix
app.use('/api/categories', categoriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/team-bookings', teamBookingsRouter);
app.use('/api/aadhaar', aadhaarRouter);
app.use('/api/cart-wishlist', cartWishlistRouter);
app.use('/api/ai-assistant', aiAssistantRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/admin', adminRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
}); 