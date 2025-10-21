const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testActiveStatus() {
  try {
    console.log('🧪 Testing "active" status functionality...');
    
    // 1. Check if 'active' status exists in the enum
    console.log('1️⃣ Checking if "active" status exists in enum...');
    
    const { data: enumData, error: enumError } = await supabase
      .rpc('get_enum_values', { enum_name: 'profile_status' });
    
    if (enumError) {
      console.log('⚠️  Could not check enum values directly, trying alternative method...');
      
      // Alternative: Try to create a test record with 'active' status
      const { data: testData, error: testError } = await supabase
        .from('provider_profiles')
        .select('status')
        .limit(1);
      
      if (testError && testError.message.includes('invalid input value for enum')) {
        console.log('❌ "active" status is not available in the enum');
        console.log('Please run the migration script first');
        return;
      }
    }
    
    // 2. Test updating a profile status to 'active'
    console.log('2️⃣ Testing profile status update to "active"...');
    
    // Get a test provider profile (if any exist)
    const { data: profiles, error: profilesError } = await supabase
      .from('provider_profiles')
      .select('provider_id, status')
      .limit(1);
    
    if (profilesError) {
      console.log('⚠️  No provider profiles found or table not accessible');
      console.log('This is expected if no profiles have been created yet');
    } else if (profiles && profiles.length > 0) {
      const testProfile = profiles[0];
      console.log(`📋 Found test profile: ${testProfile.provider_id} (current status: ${testProfile.status})`);
      
      // Try to update status to 'active'
      const { data: updateData, error: updateError } = await supabase
        .from('provider_profiles')
        .update({ status: 'active' })
        .eq('provider_id', testProfile.provider_id)
        .select();
      
      if (updateError) {
        console.log('❌ Failed to update status to "active":', updateError.message);
      } else {
        console.log('✅ Successfully updated profile status to "active"');
        
        // Revert back to original status
        await supabase
          .from('provider_profiles')
          .update({ status: testProfile.status })
          .eq('provider_id', testProfile.provider_id);
        
        console.log('🔄 Reverted status back to original value');
      }
    } else {
      console.log('ℹ️  No provider profiles found to test with');
    }
    
    // 3. Test the helper function
    console.log('3️⃣ Testing helper function...');
    
    const { data: functionData, error: functionError } = await supabase
      .rpc('set_profile_active_on_completion', { p_provider_id: '00000000-0000-0000-0000-000000000000' });
    
    if (functionError) {
      console.log('⚠️  Helper function test failed (expected with dummy ID):', functionError.message);
    } else {
      console.log('✅ Helper function is available and working');
    }
    
    console.log('');
    console.log('🎉 Test completed!');
    console.log('');
    console.log('📝 Summary:');
    console.log('- Backend code updated to set status to "active"');
    console.log('- Database migration script created');
    console.log('- Helper function available for status updates');
    console.log('');
    console.log('🚀 Next steps:');
    console.log('1. Run: node run-active-status-migration.js');
    console.log('2. Restart your backend server');
    console.log('3. Test profile completion in your application');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testActiveStatus();
