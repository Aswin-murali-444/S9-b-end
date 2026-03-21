const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read the SQL file
const sqlContent = fs.readFileSync('./enhanced-team-booking-integration.sql', 'utf8');

// Supabase configuration (you'll need to update these with your actual values)
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeSQL() {
  try {
    console.log('Executing team booking integration SQL...');
    
    // Split SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        if (error) {
          console.error('Error executing statement:', error);
        } else {
          console.log('Statement executed successfully');
        }
      }
    }
    
    console.log('Team booking integration completed!');
  } catch (error) {
    console.error('Error executing SQL:', error);
  }
}

executeSQL();
