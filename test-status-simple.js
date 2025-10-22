const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://zbscbvrklkntlbtefkgw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔧 Testing Provider Status System...');

async function testStatusSystem() {
  try {
    // Test 1: Check if provider_profiles table exists and has status field
    console.log('1. Testing provider_profiles table...');
    try {
      const { data, error } = await supabase
        .from('provider_profiles')
        .select('provider_id, status')
        .limit(1);
      
      if (error) {
        console.log('❌ Provider profiles error:', error.message);
        if (error.message.includes('status')) {
          console.log('   → Status field does not exist in provider_profiles table');
        }
      } else {
        console.log('✅ Provider profiles table accessible, has status field');
      }
    } catch (err) {
      console.log('❌ Provider profiles error:', err.message);
    }

    // Test 2: Check service_provider_details table
    console.log('2. Testing service_provider_details table...');
    try {
      const { data, error } = await supabase
        .from('service_provider_details')
        .select('id, status')
        .limit(1);
      
      if (error) {
        console.log('❌ Service provider details error:', error.message);
      } else {
        console.log('✅ Service provider details table accessible');
        console.log('   Sample data:', data);
      }
    } catch (err) {
      console.log('❌ Service provider details error:', err.message);
    }

    // Test 3: Try to update a non-existent record (should not fail)
    console.log('3. Testing status update with non-existent ID...');
    try {
      const { data, error } = await supabase
        .from('service_provider_details')
        .update({ 
          status: 'pending_verification',
          updated_at: new Date().toISOString()
        })
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .select();
      
      if (error) {
        console.log('❌ Update test error:', error.message);
        if (error.message.includes('invalid input value for enum')) {
          console.log('   → Enum constraint issue detected');
        }
      } else {
        console.log('✅ Update test passed (no records updated, but no error)');
      }
    } catch (err) {
      console.log('❌ Update test error:', err.message);
    }

    console.log('🎉 Status system test completed!');
    console.log('The backend should handle these cases gracefully now.');

  } catch (error) {
    console.error('💥 Error:', error);
  }
}

testStatusSystem();
