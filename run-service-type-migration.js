const { supabase } = require('./lib/supabase');

async function addServiceTypeField() {
  try {
    console.log('Adding service_type field to services table...');
    
    // Add the service_type column to the services table
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE services 
        ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) DEFAULT 'individual' CHECK (service_type IN ('individual', 'group'));
      `
    });

    if (alterError) {
      console.error('Error adding service_type column:', alterError);
      return;
    }

    // Add comment to explain the field
    const { error: commentError } = await supabase.rpc('exec_sql', {
      sql: `
        COMMENT ON COLUMN services.service_type IS 'Defines whether the service is for individual customers or group bookings';
      `
    });

    if (commentError) {
      console.warn('Warning: Could not add comment:', commentError.message);
    }

    // Create index for better performance when filtering by service type
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_services_service_type ON services(service_type);
      `
    });

    if (indexError) {
      console.warn('Warning: Could not create index:', indexError.message);
    }

    // Update existing services to have 'individual' as default
    const { error: updateError } = await supabase
      .from('services')
      .update({ service_type: 'individual' })
      .is('service_type', null);

    if (updateError) {
      console.error('Error updating existing services:', updateError);
      return;
    }

    // Make the column NOT NULL after setting defaults
    const { error: notNullError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE services ALTER COLUMN service_type SET NOT NULL;
      `
    });

    if (notNullError) {
      console.error('Error setting NOT NULL constraint:', notNullError);
      return;
    }

    console.log('✅ Service type field added successfully!');
    console.log('✅ All existing services set to "individual" type');
    console.log('✅ Index created for better performance');
    console.log('✅ Column set to NOT NULL');

    // Verify the changes
    const { data: services, error: fetchError } = await supabase
      .from('services')
      .select('id, name, service_type')
      .limit(5);

    if (fetchError) {
      console.error('Error fetching services for verification:', fetchError);
      return;
    }

    console.log('\n📋 Sample services with service_type:');
    services.forEach(service => {
      console.log(`- ${service.name}: ${service.service_type}`);
    });

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
addServiceTypeField();
