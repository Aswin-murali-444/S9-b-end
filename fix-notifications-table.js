const { supabase } = require('./lib/supabase');

async function checkAndCreateNotificationsTable() {
  console.log('Checking notifications table...\n');

  try {
    // First, try to query the notifications table to see if it exists
    console.log('1. Testing notifications table access...');
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ Notifications table error:', error.message);
      
      if (error.code === 'PGRST116' || error.message.includes('relation "notifications" does not exist')) {
        console.log('📝 Notifications table does not exist. Creating it...');
        
        // Create the notifications table
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS notifications (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
            admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed')),
            priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            read_at TIMESTAMP WITH TIME ZONE,
            dismissed_at TIMESTAMP WITH TIME ZONE
          );
        `;

        const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
        
        if (createError) {
          console.log('❌ Failed to create notifications table:', createError.message);
          return false;
        }

        console.log('✅ Notifications table created successfully');

        // Create indexes
        const indexesSQL = `
          CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
          CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
          CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
          CREATE INDEX IF NOT EXISTS idx_notifications_provider_id ON notifications(provider_id);
        `;

        const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexesSQL });
        
        if (indexError) {
          console.log('⚠️ Failed to create indexes:', indexError.message);
        } else {
          console.log('✅ Indexes created successfully');
        }

        // Test the table again
        const { data: testData, error: testError } = await supabase
          .from('notifications')
          .select('*')
          .limit(1);

        if (testError) {
          console.log('❌ Table creation verification failed:', testError.message);
          return false;
        }

        console.log('✅ Notifications table verified and working');
        return true;
      } else {
        console.log('❌ Unexpected error:', error.message);
        return false;
      }
    } else {
      console.log('✅ Notifications table exists and is accessible');
      console.log(`📊 Found ${data?.length || 0} existing notifications`);
      return true;
    }

  } catch (error) {
    console.error('❌ Error checking notifications table:', error.message);
    return false;
  }
}

async function createTestNotification() {
  console.log('\n2. Creating test notification...');
  
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        type: 'test_notification',
        title: 'Test Notification',
        message: 'This is a test notification to verify the system works',
        user_id: 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8', // Use the actual user ID from the error
        status: 'unread',
        priority: 'medium',
        metadata: {
          test: true,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      console.log('❌ Failed to create test notification:', error.message);
      return false;
    }

    console.log('✅ Test notification created with ID:', data.id);
    
    // Clean up test notification
    await supabase
      .from('notifications')
      .delete()
      .eq('id', data.id);
    
    console.log('🧹 Test notification cleaned up');
    return true;

  } catch (error) {
    console.error('❌ Error creating test notification:', error.message);
    return false;
  }
}

async function testNotificationQueries() {
  console.log('\n3. Testing notification queries...');
  
  const testUserId = 'ddb8bbd1-c8b9-4652-ac43-30c14aecb0d8';
  
  try {
    // Test user notifications query
    console.log('Testing user notifications query...');
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (notificationsError) {
      console.log('❌ User notifications query error:', notificationsError.message);
      return false;
    }

    console.log('✅ User notifications query successful, found:', notifications?.length || 0, 'notifications');

    // Test unread count query
    console.log('Testing unread count query...');
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', testUserId)
      .eq('status', 'unread');

    if (countError) {
      console.log('❌ Unread count query error:', countError.message);
      return false;
    }

    console.log('✅ Unread count query successful, count:', count || 0);
    return true;

  } catch (error) {
    console.error('❌ Error testing queries:', error.message);
    return false;
  }
}

async function main() {
  console.log('🔧 Notification System Diagnostic Tool\n');
  
  const tableExists = await checkAndCreateNotificationsTable();
  if (!tableExists) {
    console.log('\n❌ Failed to set up notifications table');
    return;
  }

  const testCreated = await createTestNotification();
  if (!testCreated) {
    console.log('\n❌ Failed to create test notification');
    return;
  }

  const queriesWork = await testNotificationQueries();
  if (!queriesWork) {
    console.log('\n❌ Failed to test notification queries');
    return;
  }

  console.log('\n🎉 All notification system tests passed!');
  console.log('The notification system should now work properly.');
}

// Run the diagnostic if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { checkAndCreateNotificationsTable, createTestNotification, testNotificationQueries };
