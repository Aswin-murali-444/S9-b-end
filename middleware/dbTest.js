const { supabase } = require('../lib/supabase');

// Test endpoint to check database connection and table structure
const testDatabase = async (req, res) => {
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
};

module.exports = {
  testDatabase
};
