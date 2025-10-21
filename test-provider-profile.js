// Test script to debug provider profile creation
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testProviderProfileCreation() {
  try {
    console.log('Testing provider profile creation...');
    
    // First, check if we have any service providers
    const { data: providers, error: providerError } = await supabase
      .from('service_provider_details')
      .select('id')
      .limit(1);
    
    if (providerError) {
      console.error('Error fetching service providers:', providerError);
      return;
    }
    
    if (!providers || providers.length === 0) {
      console.log('No service providers found. Creating a test one...');
      
      // Create a test service provider
      const { data: newProvider, error: createError } = await supabase
        .from('service_provider_details')
        .insert({
          specialization: 'Test Specialization',
          service_category_id: 1,
          service_id: 1,
          experience_years: 5,
          hourly_rate: 500
        })
        .select()
        .single();
      
      if (createError) {
        console.error('Error creating test provider:', createError);
        return;
      }
      
      console.log('Created test provider:', newProvider);
      providers.push(newProvider);
    }
    
    const testProviderId = providers[0].id;
    console.log('Using provider ID:', testProviderId);
    
    // Test data
    const testData = {
      provider_id: testProviderId,
      first_name: 'Test',
      last_name: 'User',
      phone: '9876543210',
      pincode: '123456',
      city: 'Test City',
      state: 'Test State',
      address: 'Test Address',
      bio: 'Test bio',
      qualifications: ['Test Qualification'],
      certifications: ['Test Certification'],
      languages: ['English', 'Hindi'],
      profile_photo_url: null,
      aadhaar_number: null,
      aadhaar_name: null,
      aadhaar_dob: null,
      aadhaar_gender: null,
      aadhaar_address: null
    };
    
    console.log('Test data:', testData);
    
    // Try to insert
    const { data: insertData, error: insertError } = await supabase
      .from('provider_profiles')
      .upsert(testData, {
        onConflict: 'provider_id'
      })
      .select();
    
    if (insertError) {
      console.error('Insert error:', insertError);
      console.error('Error details:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code
      });
    } else {
      console.log('Insert successful:', insertData);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

testProviderProfileCreation();
