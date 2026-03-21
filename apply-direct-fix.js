// Direct database fix script
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyDirectFix() {
  try {
    console.log('🔧 Applying direct fix to provider_profiles table...');
    
    // Step 1: Check current state
    console.log('\n--- Step 1: Checking current state ---');
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name, column_default, data_type')
      .eq('table_name', 'provider_profiles')
      .eq('table_schema', 'public')
      .eq('column_name', 'status');
    
    if (columnError) {
      console.log('❌ Could not check columns:', columnError.message);
    } else {
      console.log('Current status column info:', columns);
    }
    
    // Step 2: Try to create the enum
    console.log('\n--- Step 2: Creating enum ---');
    try {
      const { data: enumData, error: enumError } = await supabase.rpc('exec_sql', {
        sql: `DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_status') THEN
                CREATE TYPE public.profile_status AS ENUM (
                    'incomplete',
                    'pending', 
                    'active',
                    'verified',
                    'rejected',
                    'suspended'
                );
                RAISE NOTICE 'Created profile_status enum';
            ELSE
                RAISE NOTICE 'profile_status enum already exists';
            END IF;
        END $$;`
      });
      
      if (enumError) {
        console.log('❌ Enum creation error:', enumError.message);
      } else {
        console.log('✅ Enum creation result:', enumData);
      }
    } catch (execError) {
      console.log('❌ SQL execution not available:', execError.message);
    }
    
    // Step 3: Try to change the default value
    console.log('\n--- Step 3: Changing default value ---');
    try {
      const { data: defaultData, error: defaultError } = await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE public.provider_profiles ALTER COLUMN status SET DEFAULT 'incomplete';`
      });
      
      if (defaultError) {
        console.log('❌ Default change error:', defaultError.message);
      } else {
        console.log('✅ Default change result:', defaultData);
      }
    } catch (execError) {
      console.log('❌ SQL execution not available:', execError.message);
    }
    
    // Step 4: Test the fix
    console.log('\n--- Step 4: Testing the fix ---');
    const testData = {
      provider_id: '70a7a05b-0fd7-48a2-8649-f11e6d577c6d',
      first_name: 'Test',
      last_name: 'User',
      phone: '9876543210',
      pincode: '123456',
      city: 'Test City',
      state: 'Test State',
      address: 'Test Address',
      status: 'pending'
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('provider_profiles')
      .upsert(testData, {
        onConflict: 'provider_id'
      })
      .select();
    
    if (insertError) {
      console.log('❌ Test still failing:', insertError.message);
      console.log('\n🔧 MANUAL FIX REQUIRED:');
      console.log('The SQL execution through Supabase client is not working.');
      console.log('You need to run this SQL manually in your Supabase SQL Editor:');
      console.log('');
      console.log('-- Copy and paste this into Supabase SQL Editor:');
      console.log('ALTER TABLE public.provider_profiles ALTER COLUMN status SET DEFAULT \'incomplete\';');
      console.log('');
      console.log('Then test again with: node test-simple-fix.js');
    } else {
      console.log('✅ SUCCESS! The fix worked:', insertData);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

applyDirectFix();
