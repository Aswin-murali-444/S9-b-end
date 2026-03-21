// Check if there's a default value causing the issue
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDefaultValue() {
  try {
    console.log('Checking for default value issue...');
    
    // Try to insert without specifying status at all
    const testData = {
      provider_id: '70a7a05b-0fd7-48a2-8649-f11e6d577c6d',
      first_name: 'Test',
      last_name: 'User',
      phone: '9876543210',
      pincode: '123456',
      city: 'Test City',
      state: 'Test State',
      address: 'Test Address'
      // No status field at all
    };
    
    console.log('Test data (no status):', testData);
    
    const { data: insertData, error: insertError } = await supabase
      .from('provider_profiles')
      .upsert(testData, {
        onConflict: 'provider_id'
      })
      .select();
    
    if (insertError) {
      console.log('❌ FAILED (no status):', insertError.message);
      
      // The error message might give us a clue about what's happening
      if (insertError.message.includes('pending_verification')) {
        console.log('🔍 The error mentions "pending_verification" even though we didn\'t specify any status!');
        console.log('This suggests there\'s a default value or constraint that\'s setting the status to "pending_verification"');
      }
    } else {
      console.log('✅ SUCCESS (no status):', insertData);
    }
    
    // Try to explicitly set status to null
    console.log('\n--- Testing with explicit null status ---');
    const testDataNull = {
      ...testData,
      status: null
    };
    
    const { data: insertDataNull, error: insertErrorNull } = await supabase
      .from('provider_profiles')
      .upsert(testDataNull, {
        onConflict: 'provider_id'
      })
      .select();
    
    if (insertErrorNull) {
      console.log('❌ FAILED (null status):', insertErrorNull.message);
    } else {
      console.log('✅ SUCCESS (null status):', insertDataNull);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

checkDefaultValue();
