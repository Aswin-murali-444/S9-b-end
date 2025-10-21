require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndAddBasicPay() {
  try {
    console.log('Checking service_provider_details table for basic_pay field...');
    
    // Check if basic_pay column exists
    const { error: basicPayError } = await supabase
      .from('service_provider_details')
      .select('basic_pay')
      .limit(1);
    
    if (basicPayError && basicPayError.code === '42703') {
      console.log('❌ basic_pay column does not exist');
      console.log('\n📝 Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN basic_pay decimal(10,2) DEFAULT 0.00;');
      console.log('COMMENT ON COLUMN public.service_provider_details.basic_pay IS \'Basic pay rate for the service provider\';');
      console.log('\nAfter adding the column, run this script again to test.');
    } else if (basicPayError) {
      console.log('❌ Error checking basic_pay column:', basicPayError.message);
    } else {
      console.log('✅ basic_pay column exists');
      
      // Test fetching data with basic_pay
      console.log('\n📊 Testing data fetch with basic_pay...');
      const { data: testData, error: testError } = await supabase
        .from('service_provider_details')
        .select('id, basic_pay, specialization')
        .limit(3);
      
      if (testError) {
        console.log('❌ Error fetching test data:', testError.message);
      } else {
        console.log('✅ Test data fetched successfully:');
        console.log(JSON.stringify(testData, null, 2));
      }
    }
    
    // Also check for hourly_rate
    console.log('\n🔍 Checking hourly_rate field...');
    const { error: hourlyRateError } = await supabase
      .from('service_provider_details')
      .select('hourly_rate')
      .limit(1);
    
    if (hourlyRateError && hourlyRateError.code === '42703') {
      console.log('❌ hourly_rate column does not exist');
      console.log('📝 Please also add this column:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN hourly_rate decimal(10,2) DEFAULT 0.00;');
    } else if (hourlyRateError) {
      console.log('❌ Error checking hourly_rate column:', hourlyRateError.message);
    } else {
      console.log('✅ hourly_rate column exists');
    }
    
  } catch (error) {
    console.error('❌ Script error:', error.message);
  }
}

checkAndAddBasicPay();

