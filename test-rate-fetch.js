require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRateFetch() {
  try {
    console.log('Testing rate fetch from service_provider_details table...');
    
    // Test fetching service provider details
    const { data: spData, error: spError } = await supabase
      .from('service_provider_details')
      .select('id, hourly_rate, experience_years, service_category_id, service_id')
      .limit(5);
    
    if (spError) {
      console.error('Error fetching service provider details:', spError);
      return;
    }
    
    console.log('Service Provider Details:');
    console.log(JSON.stringify(spData, null, 2));
    
    // Test fetching services with prices
    const { data: servicesData, error: servicesError } = await supabase
      .from('services')
      .select('id, name, price, offer_price')
      .limit(5);
    
    if (servicesError) {
      console.error('Error fetching services:', servicesError);
      return;
    }
    
    console.log('\nServices with Prices:');
    console.log(JSON.stringify(servicesData, null, 2));
    
    // Test a specific user's profile data
    if (spData && spData.length > 0) {
      const userId = spData[0].id;
      console.log(`\nTesting profile fetch for user: ${userId}`);
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          role,
          user_profiles!inner(
            first_name,
            last_name,
            phone
          ),
          service_provider_details!inner(
            hourly_rate,
            experience_years,
            service_category_id,
            service_id
          )
        `)
        .eq('id', userId)
        .single();
      
      if (userError) {
        console.error('Error fetching user profile:', userError);
      } else {
        console.log('User Profile with Service Provider Details:');
        console.log(JSON.stringify(userData, null, 2));
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRateFetch();

