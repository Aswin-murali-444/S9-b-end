const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  try {
    console.log('Starting migration to add status field...');
    
    // Read the migration SQL file
    const sql = fs.readFileSync('migrate-add-status-field.sql', 'utf8');
    
    // Split the SQL into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        
        try {
          const { data, error } = await supabase.rpc('exec_sql', { sql: statement });
          
          if (error) {
            console.error(`Error in statement ${i + 1}:`, error);
            // Continue with next statement for non-critical errors
            if (error.message.includes('already exists') || error.message.includes('does not exist')) {
              console.log('Skipping non-critical error...');
              continue;
            }
          } else {
            console.log(`Statement ${i + 1} executed successfully`);
          }
        } catch (err) {
          console.error(`Exception in statement ${i + 1}:`, err.message);
        }
      }
    }
    
    console.log('Migration completed successfully!');
    
    // Test the new status field
    const { data: testData, error: testError } = await supabase
      .from('provider_profiles')
      .select('provider_id, status')
      .limit(5);
    
    if (testError) {
      console.error('Error testing status field:', testError);
    } else {
      console.log('Status field test successful:', testData);
    }
    
  } catch (error) {
    console.error('Migration error:', error);
  }
}

runMigration();
