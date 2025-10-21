const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🚀 Starting profile status migration to "active"...');
    
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'migrate-to-active-status.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Executing migration SQL...');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      
      // Try alternative approach - execute SQL directly
      console.log('🔄 Trying alternative approach...');
      
      // Split SQL into individual statements and execute them
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`Executing: ${statement.substring(0, 50)}...`);
          const { error: stmtError } = await supabase.rpc('exec_sql', {
            sql: statement + ';'
          });
          
          if (stmtError) {
            console.warn(`⚠️  Statement failed (may be expected): ${stmtError.message}`);
          }
        }
      }
    } else {
      console.log('✅ Migration completed successfully');
    }
    
    // Verify the migration
    console.log('🔍 Verifying migration...');
    
    // Check if 'active' status exists in the enum
    const { data: enumData, error: enumError } = await supabase
      .from('pg_enum')
      .select('enumlabel')
      .eq('enumtypid', '(SELECT oid FROM pg_type WHERE typname = \'profile_status\')');
    
    if (!enumError && enumData) {
      const statuses = enumData.map(row => row.enumlabel);
      console.log('📋 Available profile statuses:', statuses);
      
      if (statuses.includes('active')) {
        console.log('✅ "active" status successfully added to enum');
      } else {
        console.log('❌ "active" status not found in enum');
      }
    }
    
    console.log('🎉 Migration process completed!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. The backend code has been updated to set status to "active"');
    console.log('2. Restart your backend server to apply the changes');
    console.log('3. Test profile completion to verify the new status is set');
    
  } catch (error) {
    console.error('❌ Migration failed with error:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
