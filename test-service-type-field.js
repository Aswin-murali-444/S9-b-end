const { supabase } = require('./lib/supabase');

async function testServiceTypeField() {
  try {
    console.log('Testing service type field functionality...\n');

    // Test 1: Fetch services to see if service_type field is included
    console.log('1. Fetching services to check service_type field...');
    const { data: services, error: fetchError } = await supabase
      .from('services')
      .select('id, name, service_type, active')
      .limit(5);

    if (fetchError) {
      console.error('❌ Error fetching services:', fetchError);
      return;
    }

    console.log('✅ Services fetched successfully:');
    services.forEach(service => {
      console.log(`   - ${service.name}: ${service.service_type || 'NULL'} (${service.active ? 'Active' : 'Inactive'})`);
    });

    // Test 2: Try to create a new service with service_type
    console.log('\n2. Testing service creation with service_type...');
    const testService = {
      category_id: services[0]?.category_id || 'test-category-id',
      name: 'Test Group Service',
      description: 'A test service for group bookings',
      duration: '2 hours',
      price: 100.00,
      service_type: 'group',
      active: true
    };

    const { data: newService, error: createError } = await supabase
      .from('services')
      .insert(testService)
      .select('id, name, service_type')
      .single();

    if (createError) {
      console.log('⚠️  Service creation test failed (expected if category_id is invalid):', createError.message);
    } else {
      console.log('✅ Service created successfully:', newService);
      
      // Clean up test service
      await supabase.from('services').delete().eq('id', newService.id);
      console.log('✅ Test service cleaned up');
    }

    // Test 3: Check if we can filter by service_type
    console.log('\n3. Testing service_type filtering...');
    const { data: individualServices, error: individualError } = await supabase
      .from('services')
      .select('id, name, service_type')
      .eq('service_type', 'individual')
      .limit(3);

    if (individualError) {
      console.error('❌ Error filtering individual services:', individualError);
    } else {
      console.log('✅ Individual services found:', individualServices.length);
      individualServices.forEach(service => {
        console.log(`   - ${service.name}: ${service.service_type}`);
      });
    }

    console.log('\n🎉 Service type field testing completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testServiceTypeField();
