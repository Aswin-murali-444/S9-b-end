const { supabase } = require('./lib/supabase');

async function checkBookingsTableStructure() {
  console.log('🔍 Checking bookings table structure...\n');

  try {
    // Get a sample booking to see the actual columns
    const { data: sampleBooking, error } = await supabase
      .from('bookings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      console.log('❌ Error fetching sample booking:', error.message);
      return;
    }

    console.log('📋 Bookings table columns:');
    Object.keys(sampleBooking).forEach(column => {
      console.log(`   - ${column}: ${typeof sampleBooking[column]}`);
    });

    console.log('\n📊 Sample booking data:');
    console.log(JSON.stringify(sampleBooking, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the check
checkBookingsTableStructure().catch(console.error);
