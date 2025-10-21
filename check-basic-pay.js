require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndAddBasicPay() {
  try {
    console.log('Checking service_provider_details table structure...');
    
    // First, let's see what columns actually exist
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'service_provider_details' })
      .catch(async () => {
        // Fallback: try to select from the table to see what columns exist
        const { error: selectError } = await supabase
          .from('service_provider_details')
          .select('*')
          .limit(1);
        
        if (selectError) {
          console.log('Error selecting from table:', selectError.message);
          return { data: null, error: selectError };
        }
        
        return { data: 'columns_exist', error: null };
      });
    
    console.log('Table structure check result:', { columns, columnsError });
    
    // Check if basic_pay column exists
    const { error: basicPayError } = await supabase
      .from('service_provider_details')
      .select('basic_pay')
      .limit(1);
    
    if (basicPayError && basicPayError.code === '42703') {
      console.log('basic_pay column does not exist, adding it...');
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN basic_pay decimal(10,2) DEFAULT 0.00;');
      console.log('COMMENT ON COLUMN public.service_provider_details.basic_pay IS \'Basic pay rate for the service provider\';');
    } else if (basicPayError) {
      console.log('Error checking basic_pay column:', basicPayError);
    } else {
      console.log('basic_pay column already exists');
    }
    
    // Also check for hourly_rate
    const { error: hourlyRateError } = await supabase
      .from('service_provider_details')
      .select('hourly_rate')
      .limit(1);
    
    if (hourlyRateError && hourlyRateError.code === '42703') {
      console.log('hourly_rate column does not exist, adding it...');
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN hourly_rate decimal(10,2) DEFAULT 0.00;');
    } else if (hourlyRateError) {
      console.log('Error checking hourly_rate column:', hourlyRateError);
    } else {
      console.log('hourly_rate column already exists');
    }
    
    // Test fetching data with basic_pay
    console.log('\nTesting data fetch with basic_pay...');
    const { data: testData, error: testError } = await supabase
      .from('service_provider_details')
      .select('id, basic_pay, hourly_rate, specialization')
      .limit(3);
    
    if (testError) {
      console.log('Error fetching test data:', testError);
    } else {
      console.log('Test data:', JSON.stringify(testData, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAndAddBasicPay();

