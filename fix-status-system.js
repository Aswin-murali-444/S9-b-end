const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read Supabase config from environment or use defaults
const supabaseUrl = process.env.SUPABASE_URL || 'https://zbscbvrklkntlbtefkgw.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY';

console.log('🔧 Fixing Provider Status System...');
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseKey);

if (!supabaseKey || supabaseKey === 'your-anon-key') {
  console.error('❌ Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
  console.log('You can set them in your .env file or run:');
  console.log('set SUPABASE_URL=your-url');
  console.log('set SUPABASE_ANON_KEY=your-key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Read the SQL script
const sqlScript = fs.readFileSync('fix-provider-status-system.sql', 'utf8');

console.log('📝 Executing SQL script...');

// Execute the SQL script using a simple query approach
// Split the script into individual statements
const statements = sqlScript
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to execute`);

async function executeStatements() {
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    if (statement.trim()) {
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.warn(`⚠️ Statement ${i + 1} warning:`, error.message);
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.warn(`⚠️ Statement ${i + 1} error:`, err.message);
      }
    }
  }
  
  console.log('🎉 SQL script execution completed!');
  console.log('The provider status system should now be fixed.');
}

executeStatements().catch(err => {
  console.error('💥 Error executing SQL script:', err);
});
