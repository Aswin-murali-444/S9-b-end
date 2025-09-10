const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testUserStatusUpdate() {
  try {
    console.log('🔍 Testing user status update functionality...');
    
    // Get a user to test with
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, email, status')
      .limit(1);
    
    if (fetchError || !users || users.length === 0) {
      console.error('❌ No users found:', fetchError?.message);
      return;
    }
    
    const testUser = users[0];
    console.log(`📋 Testing with user: ${testUser.email} (ID: ${testUser.id})`);
    console.log(`BEFORE - Status: ${testUser.status}`);
    
    // Test direct database update
    console.log('\n🔄 Testing direct database update...');
    const { data: updateData, error: updateError } = await supabase
      .from('users')
      .update({ status: 'suspended' })
      .eq('id', testUser.id)
      .select('id, email, status, updated_at')
      .single();
    
    if (updateError) {
      console.error('❌ Direct update error:', updateError);
    } else {
      console.log('✅ Direct update successful:', updateData);
    }
    
    // Check the user again
    console.log('\n🔍 Checking user after update...');
    const { data: checkData, error: checkError } = await supabase
      .from('users')
      .select('id, email, status, updated_at')
      .eq('id', testUser.id)
      .single();
    
    if (checkError) {
      console.error('❌ Check error:', checkError);
    } else {
      console.log('✅ User after update:', checkData);
    }
    
    // Test API endpoint
    console.log('\n🌐 Testing API endpoint...');
    const response = await fetch(`http://localhost:3001/users/${testUser.id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'active' })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ API endpoint response:', result);
    } else {
      console.error('❌ API endpoint error:', result);
    }
    
    // Final check
    console.log('\n🔍 Final check...');
    const { data: finalData, error: finalError } = await supabase
      .from('users')
      .select('id, email, status, updated_at')
      .eq('id', testUser.id)
      .single();
    
    if (finalError) {
      console.error('❌ Final check error:', finalError);
    } else {
      console.log('✅ Final user status:', finalData);
    }
    
  } catch (error) {
    console.error('❌ Error testing user status update:', error.message);
  }
}

testUserStatusUpdate();
