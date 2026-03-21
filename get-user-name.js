const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://zbscbvrklkntlbtefkgw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY';

const supabase = createClient(supabaseUrl, supabaseKey);

const userId = '8de729fd-9d43-4657-8ae0-76fa928fc222';
const email = 'deepamurali456@gmail.com';

console.log('🔍 Fetching user name...\n');

async function getUserName() {
  try {
    // Query user with profile information
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        user_profiles (
          first_name,
          last_name,
          phone
        )
      `)
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ Error fetching user:', userError);
      return;
    }

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    const profile = user.user_profiles?.[0] || user.user_profiles || {};
    const firstName = profile.first_name || '';
    const lastName = profile.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Not set in profile';

    console.log('✅ User Information:');
    console.log('═'.repeat(60));
    console.log(`Email: ${user.email}`);
    console.log(`User ID: ${userId}`);
    console.log(`First Name: ${firstName || 'Not set'}`);
    console.log(`Last Name: ${lastName || 'Not set'}`);
    console.log(`Full Name: ${fullName}`);
    console.log(`Phone: ${profile.phone || 'Not set'}`);
    console.log('═'.repeat(60));

    // Also check if there's any name in service_provider_details
    const { data: spDetails, error: spError } = await supabase
      .from('service_provider_details')
      .select('specialization, service_category_id')
      .eq('user_id', userId)
      .single();

    if (!spError && spDetails) {
      console.log(`\nService Provider Details:`);
      console.log(`Specialization: ${spDetails.specialization || 'Not set'}`);
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

getUserName();
