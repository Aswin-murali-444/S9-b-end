require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  try {
    console.log('Adding experience_years column...');
    const { error: expError } = await supabase
      .from('service_provider_details')
      .select('experience_years')
      .limit(1);
    
    if (expError && expError.code === 'PGRST116') {
      console.log('Column experience_years does not exist, adding it...');
      // We'll need to run this through the Supabase dashboard or SQL editor
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN experience_years integer DEFAULT 0;');
    } else {
      console.log('experience_years column already exists');
    }

    console.log('Adding hourly_rate column...');
    const { error: rateError } = await supabase
      .from('service_provider_details')
      .select('hourly_rate')
      .limit(1);
    
    if (rateError && rateError.code === 'PGRST116') {
      console.log('Column hourly_rate does not exist, adding it...');
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN hourly_rate decimal(10,2) DEFAULT 0.00;');
    } else {
      console.log('hourly_rate column already exists');
    }

    console.log('Adding availability column...');
    const { error: availError } = await supabase
      .from('service_provider_details')
      .select('availability')
      .limit(1);
    
    if (availError && availError.code === 'PGRST116') {
      console.log('Column availability does not exist, adding it...');
      console.log('Please run this SQL in your Supabase SQL editor:');
      console.log('ALTER TABLE public.service_provider_details ADD COLUMN availability jsonb DEFAULT \'{}\';');
    } else {
      console.log('availability column already exists');
    }

    console.log('Migration check completed!');
    console.log('If any columns were missing, please run the SQL statements above in your Supabase SQL editor.');
    
  } catch (error) {
    console.error('Migration check failed:', error);
  }
}

runMigration();

