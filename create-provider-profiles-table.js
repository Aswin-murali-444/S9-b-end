const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createProviderProfilesTable() {
  try {
    console.log('Creating provider_profiles table...');
    
    // Read the SQL file
    const sql = fs.readFileSync('provider-profiles-table.sql', 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('Error creating table:', error);
      return;
    }
    
    console.log('Table created successfully:', data);
    
    // Test the table
    const { data: testData, error: testError } = await supabase
      .from('provider_profiles')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.error('Error testing table:', testError);
    } else {
      console.log('Table test successful:', testData);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

createProviderProfilesTable();
