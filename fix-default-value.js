// Fix the default value for provider_profiles status column
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixDefaultValue() {
  try {
    console.log('Fixing default value for provider_profiles status column...');
    
    // The issue is that the status column has a default value of 'pending_verification'
    // but the enum only allows: 'incomplete', 'pending', 'active', 'verified', 'rejected', 'suspended'
    
    // We need to change the default to 'incomplete' which is a valid enum value
    
    const fixDefaultSQL = `
      ALTER TABLE public.provider_profiles 
      ALTER COLUMN status SET DEFAULT 'incomplete';
    `;
    
    console.log('Executing SQL to fix default value...');
    console.log('SQL:', fixDefaultSQL);
    
    // Try to execute the SQL
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql: fixDefaultSQL });
      if (error) {
        console.log('SQL execution error:', error.message);
        console.log('This might be expected if the function doesn\'t exist');
      } else {
        console.log('SQL executed successfully:', data);
      }
    } catch (execError) {
      console.log('SQL execution failed:', execError.message);
      console.log('This is expected - Supabase doesn\'t allow direct SQL execution');
    }
    
    // Test the fix by trying to insert without status
    console.log('\nTesting the fix...');
    const testData = {
      provider_id: '70a7a05b-0fd7-48a2-8649-f11e6d577c6d',
      first_name: 'Test',
      last_name: 'User',
      phone: '9876543210',
      pincode: '123456',
      city: 'Test City',
      state: 'Test State',
      address: 'Test Address'
      // No status field - should use default
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('provider_profiles')
      .upsert(testData, {
        onConflict: 'provider_id'
      })
      .select();
    
    if (insertError) {
      console.log('❌ Still failing:', insertError.message);
      console.log('\n🔧 Manual fix required:');
      console.log('You need to run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.provider_profiles ALTER COLUMN status SET DEFAULT \'incomplete\';');
    } else {
      console.log('✅ SUCCESS! The fix worked:', insertData);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

fixDefaultValue();
