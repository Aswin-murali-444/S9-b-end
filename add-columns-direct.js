require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addColumns() {
  try {
    console.log('Adding missing columns to service_provider_details table...');
    
    // Add hourly_rate column
    const { error: rateError } = await supabase
      .from('service_provider_details')
      .select('hourly_rate')
      .limit(1);
    
    if (rateError && rateError.code === '42703') {
      console.log('Adding hourly_rate column...');
      // We need to use raw SQL for DDL operations
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN hourly_rate decimal(10,2) DEFAULT 0.00;');
    } else {
      console.log('hourly_rate column already exists');
    }
    
    // Add experience_years column
    const { error: expError } = await supabase
      .from('service_provider_details')
      .select('experience_years')
      .limit(1);
    
    if (expError && expError.code === '42703') {
      console.log('Adding experience_years column...');
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN experience_years integer DEFAULT 0;');
    } else {
      console.log('experience_years column already exists');
    }
    
    // Add availability column
    const { error: availError } = await supabase
      .from('service_provider_details')
      .select('availability')
      .limit(1);
    
    if (availError && availError.code === '42703') {
      console.log('Adding availability column...');
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN availability jsonb DEFAULT \'{}\';');
    } else {
      console.log('availability column already exists');
    }
    
    console.log('\nIf any columns were missing, please run the SQL statements above in your Supabase SQL editor.');
    console.log('After adding the columns, you can test the rate fetch again.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

addColumns();

