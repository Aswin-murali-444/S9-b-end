// Fix the profile_status enum issue
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixEnumIssue() {
  try {
    console.log('Fixing profile_status enum issue...');
    
    // First, let's check if the table exists and what columns it has
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, column_default')
      .eq('table_name', 'provider_profiles')
      .eq('table_schema', 'public');
    
    if (columnError) {
      console.error('Error fetching columns:', columnError);
      return;
    }
    
    console.log('Table columns:', columns);
    
    // Check if the enum exists
    const { data: enumTypes, error: enumError } = await supabase
      .from('pg_type')
      .select('typname, typtype')
      .eq('typname', 'profile_status');
    
    if (enumError) {
      console.error('Error fetching enum types:', enumError);
      return;
    }
    
    console.log('Enum types:', enumTypes);
    
    // Try to drop and recreate the enum
    console.log('Attempting to fix enum...');
    
    // First, try to alter the column to use text temporarily
    const alterToText = `
      ALTER TABLE public.provider_profiles 
      ALTER COLUMN status TYPE text;
    `;
    
    // Then recreate the enum
    const createEnum = `
      DROP TYPE IF EXISTS public.profile_status CASCADE;
      CREATE TYPE public.profile_status AS ENUM (
        'incomplete',
        'pending', 
        'active',
        'verified',
        'rejected',
        'suspended'
      );
    `;
    
    // Then alter the column back to use the enum
    const alterToEnum = `
      ALTER TABLE public.provider_profiles 
      ALTER COLUMN status TYPE public.profile_status 
      USING status::public.profile_status;
    `;
    
    // Set default value
    const setDefault = `
      ALTER TABLE public.provider_profiles 
      ALTER COLUMN status SET DEFAULT 'incomplete';
    `;
    
    console.log('Executing SQL fixes...');
    
    // Execute the fixes step by step
    try {
      // Step 1: Alter to text
      console.log('Step 1: Converting column to text...');
      const { error: step1Error } = await supabase.rpc('exec_sql', { sql: alterToText });
      if (step1Error) {
        console.log('Step 1 error (might be expected):', step1Error.message);
      }
      
      // Step 2: Create enum
      console.log('Step 2: Creating enum...');
      const { error: step2Error } = await supabase.rpc('exec_sql', { sql: createEnum });
      if (step2Error) {
        console.log('Step 2 error:', step2Error.message);
      }
      
      // Step 3: Alter back to enum
      console.log('Step 3: Converting column back to enum...');
      const { error: step3Error } = await supabase.rpc('exec_sql', { sql: alterToEnum });
      if (step3Error) {
        console.log('Step 3 error:', step3Error.message);
      }
      
      // Step 4: Set default
      console.log('Step 4: Setting default value...');
      const { error: step4Error } = await supabase.rpc('exec_sql', { sql: setDefault });
      if (step4Error) {
        console.log('Step 4 error:', step4Error.message);
      }
      
    } catch (execError) {
      console.log('SQL execution error:', execError.message);
    }
    
    // Test the fix
    console.log('Testing the fix...');
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
      console.error('Insert test failed:', insertError);
    } else {
      console.log('Insert test successful:', insertData);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

fixEnumIssue();
