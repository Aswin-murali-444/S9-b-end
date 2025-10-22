const express = require('express');
const router = express.Router();
const UserService = require('../services/userService');
const { supabase } = require('../lib/supabase');
const { sendSuspensionEmail, sendReactivationEmail } = require('../services/emailService');

const userService = new UserService();

// Helper function to check if provider profile is complete
const checkProfileCompletion = (profile) => {
  const requiredFields = [
    'first_name', 'last_name', 'phone', 'address', 'city', 'state', 'pincode',
    'specialization', 'years_of_experience', 'hourly_rate'
  ];
  
  return requiredFields.every(field => {
    const value = profile[field];
    return value !== null && value !== undefined && value !== '';
  });
};

// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change password (verify current, set new)
router.post('/change-password', async (req, res) => {
  try {
    const { userId, email: emailFromBody, currentPassword, newPassword } = req.body || {};
    if ((!userId && !emailFromBody) || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'userId or email, currentPassword and newPassword are required' });
    }

    // Fetch user
    let { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password_hash, supabase_auth, auth_user_id')
      .eq(userId ? 'id' : 'email', userId || String(emailFromBody || '').toLowerCase())
      .single();
    if ((userError || !user) && !userId && emailFromBody) {
      // Try normalized email
      const normalized = String(emailFromBody).trim().toLowerCase();
      const resp = await supabase
        .from('users')
        .select('id, email, password_hash, supabase_auth, auth_user_id')
        .eq('email', normalized)
        .single();
      user = resp.data; userError = resp.error;
    }

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password (demo uses base64 encoding)
    const providedPlain = String(currentPassword || '').trim();
    const providedHash = Buffer.from(providedPlain).toString('base64');
    const storedHash = user.password_hash ? String(user.password_hash) : '';

    // If no password is set yet (legacy/seeded users) OR account is supabase-auth, allow setting directly
    let isMatch = false;
    if (!storedHash || user?.supabase_auth === true) {
      isMatch = true;
    } else {
      // Accept either base64 match or plain-text match after decoding stored value
      const decodedStored = (() => {
        try { return Buffer.from(storedHash, 'base64').toString(); } catch (_) { return null; }
      })();
      if (storedHash === providedHash || (decodedStored && decodedStored === providedPlain)) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Basic validation for new password strength (frontend already validates)
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Update password
    const newHash = Buffer.from(String(newPassword)).toString('base64');

    // If this is a Supabase-auth user, update the auth password first via admin API
    if (user?.supabase_auth === true && user?.auth_user_id) {
      const { error: adminUpdateError } = await supabase.auth.admin.updateUserById(user.auth_user_id, { password: String(newPassword) });
      if (adminUpdateError) {
        return res.status(500).json({ error: adminUpdateError.message || 'Failed to update Supabase auth password' });
      }
    }
    // First try by id (authoritative)
    let updated = false;
    if (user?.id) {
      const byId = await supabase
        .from('users')
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('id')
        .single();
      if (!byId.error && byId.data) {
        updated = true;
      }
    }
    // Fallback: try by email if not updated
    if (!updated && user?.email) {
      const byEmail = await supabase
        .from('users')
        .update({ password_hash: newHash, updated_at: new Date().toISOString() })
        .eq('email', user.email)
        .select('id')
        .single();
      if (byEmail.error) {
        return res.status(500).json({ error: byEmail.error.message || 'Failed to update password' });
      }
      updated = !!byEmail.data;
    }
    if (!updated) {
      return res.status(404).json({ error: 'Password not updated - user record not found' });
    }

    // Post-update verification: read back and ensure hash equals newHash
    const verify = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('id', user.id)
      .single();
    if (verify.error || !verify.data) {
      return res.status(500).json({ error: 'Failed to verify updated password' });
    }
    if (String(verify.data.password_hash || '') !== newHash) {
      return res.status(500).json({ error: 'Password hash mismatch after update' });
    }

    return res.json({ success: true, id: user.id, email: user.email });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: error.message || 'Failed to change password' });
  }
});

// Upload profile picture (general users)
router.post('/profile-picture-upload', async (req, res) => {
  try {
    const { fileName, fileType, base64, userId } = req.body || {};
    if (!fileName || !fileType || !base64) {
      return res.status(400).json({ error: 'fileName, fileType, base64 are required' });
    }
    if (!String(fileType).toLowerCase().startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed' });
    }
    const bucket = 'profile-pictures';
    const ext = (String(fileName).split('.').pop() || 'png').toLowerCase();
    const safeUser = (String(userId || '').trim() || 'anonymous')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || 'anonymous';
    const objectKey = `${safeUser}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: bucketInfo, error: getBucketError } = await supabase.storage.getBucket(bucket);
        if (getBucketError || !bucketInfo) {
          await supabase.storage.createBucket(bucket, { public: true });
        }
        await supabase.storage.updateBucket(bucket, { public: true });
      } catch (ensureError) {
        console.warn('⚠️ Could not ensure profile-pictures bucket exists/public:', ensureError?.message || ensureError);
      }
    }

    const buffer = Buffer.from(base64, 'base64');
    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectKey, buffer, { contentType: fileType, upsert: true, cacheControl: '3600' });
    if (uploadError) {
      const msg = (uploadError.message || '').toLowerCase();
      if (msg.includes('row-level security') || msg.includes('violates row-level security') || uploadError.statusCode === 401 || uploadError.statusCode === 403) {
        return res.status(403).json({ error: 'Permission denied by storage policies. Ensure service role key is configured and bucket policies allow upload.' });
      }
      return res.status(500).json({ error: uploadError.message || 'Upload failed' });
    }
    let publicUrl = null;
    try {
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectKey);
      publicUrl = publicData?.publicUrl || null;
    } catch (_) {}
    return res.json({ path: `${bucket}/${objectKey}`, publicUrl });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('row-level security') || message.includes('violates row-level security')) {
      return res.status(403).json({ error: 'Permission denied by storage policies. Configure RLS or use service role key.' });
    }
    res.status(500).json({ error: error.message || 'Upload error' });
  }
});

// Upload provider profile picture (for provider_img_profile bucket)
router.post('/provider/profile-picture-upload', async (req, res) => {
  try {
    const { fileName, fileType, base64, providerId } = req.body || {};
    if (!fileName || !fileType || !base64) {
      return res.status(400).json({ error: 'fileName, fileType, base64 are required' });
    }
    if (!String(fileType).toLowerCase().startsWith('image/')) {
      return res.status(400).json({ error: 'Only image uploads are allowed' });
    }
    const bucket = 'provider_img_profile';
    const ext = (String(fileName).split('.').pop() || 'png').toLowerCase();
    const safeProvider = (String(providerId || '').trim() || 'anonymous')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || 'anonymous';
    const objectKey = `${safeProvider}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { data: bucketInfo, error: getBucketError } = await supabase.storage.getBucket(bucket);
        if (getBucketError || !bucketInfo) {
          await supabase.storage.createBucket(bucket, { public: true });
        }
        await supabase.storage.updateBucket(bucket, { public: true });
      } catch (ensureError) {
        console.warn('⚠️ Could not ensure provider_img_profile bucket exists/public:', ensureError?.message || ensureError);
      }
    }

    const buffer = Buffer.from(base64, 'base64');
    const { error: uploadError } = await supabase.storage.from(bucket).upload(objectKey, buffer, { contentType: fileType, upsert: true, cacheControl: '3600' });
    if (uploadError) {
      const msg = (uploadError.message || '').toLowerCase();
      if (msg.includes('row-level security') || msg.includes('violates row-level security') || uploadError.statusCode === 401 || uploadError.statusCode === 403) {
        return res.status(403).json({ error: 'Permission denied by storage policies. Ensure service role key is configured and bucket policies allow upload.' });
      }
      return res.status(500).json({ error: uploadError.message || 'Upload failed' });
    }
    let publicUrl = null;
    try {
      const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(objectKey);
      publicUrl = publicData?.publicUrl || null;
    } catch (_) {}
    return res.json({ path: `${bucket}/${objectKey}`, publicUrl });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('row-level security') || message.includes('violates row-level security')) {
      return res.status(403).json({ error: 'Permission denied by storage policies. Configure RLS or use service role key.' });
    }
    res.status(500).json({ error: error.message || 'Upload error' });
  }
});

// Complete service provider profile (NEW - for provider_profiles table)
router.post('/profile/complete-provider', async (req, res) => {
  try {
    const profileData = req.body;
    
    console.log('=== PROFILE COMPLETION REQUEST ===');
    console.log('Received data:', JSON.stringify(profileData, null, 2));
    
    // Validate required fields
    const requiredFields = ['provider_id', 'first_name', 'last_name', 'phone', 'pincode', 'city', 'state', 'address'];
    const missingFields = requiredFields.filter(field => {
      const value = profileData[field];
      return !value || (typeof value === 'string' && value.trim() === '');
    });
    
    if (missingFields.length > 0) {
      console.log('Missing required fields:', missingFields);
      console.log('Field values:', requiredFields.map(field => ({ [field]: profileData[field] })));
      return res.status(400).json({ 
        error: 'Missing required fields', 
        missingFields,
        fieldValues: requiredFields.reduce((acc, field) => {
          acc[field] = profileData[field];
          return acc;
        }, {})
      });
    }

    const providerId = profileData.provider_id;
    
    // Validate that the provider_id exists in service_provider_details
    const { data: spData, error: spCheckError } = await supabase
      .from('service_provider_details')
      .select('id')
      .eq('id', providerId)
      .single();

    if (spCheckError || !spData) {
      console.error('Service provider not found:', spCheckError);
      console.error('Provider ID being checked:', providerId);
      return res.status(404).json({ error: 'Service provider not found' });
    }

    console.log('Service provider found:', spData);

    // Check if provider_profiles table exists and is accessible
    const { data: tableCheck, error: tableError } = await supabase
      .from('provider_profiles')
      .select('*')
      .limit(1);

    if (tableError) {
      console.error('Provider profiles table error:', tableError);
      
      // If table doesn't exist, provide helpful error message
      if (tableError.message && tableError.message.includes('relation "provider_profiles" does not exist')) {
        return res.status(500).json({ 
          error: 'Provider profiles table not found',
          details: 'The provider_profiles table needs to be created. Please run the SQL file: provider-profiles-table.sql',
          solution: 'Execute the SQL commands in provider-profiles-table.sql in your Supabase SQL editor'
        });
      }
      
      return res.status(500).json({ 
        error: 'Database table not accessible',
        details: tableError.message 
      });
    }

    console.log('Table check successful, table exists and is accessible');

        // Enhanced function to convert date format
        const convertDateFormat = (dateString) => {
          if (!dateString) return null;
          
          // Clean the date string
          const cleanDate = dateString.toString().trim();
          
          // Handle different date formats
          const dateFormats = [
            // DD/MM/YYYY formats
            { pattern: /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/, isDDMMYYYY: true },
            // YYYY/MM/DD formats  
            { pattern: /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/, isDDMMYYYY: false },
            // DD MM YYYY formats (with spaces)
            { pattern: /^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/, isDDMMYYYY: true },
            // YYYY MM DD formats (with spaces)
            { pattern: /^(\d{4})\s+(\d{1,2})\s+(\d{1,2})$/, isDDMMYYYY: false }
          ];
          
          for (const format of dateFormats) {
            const match = cleanDate.match(format.pattern);
            if (match) {
              let day, month, year;
              
              if (format.isDDMMYYYY) {
                [, day, month, year] = match;
              } else {
                [, year, month, day] = match;
              }
              
              // Validate the date
              const dayNum = parseInt(day, 10);
              const monthNum = parseInt(month, 10);
              const yearNum = parseInt(year, 10);
              
              // Basic validation
              if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
                // Create date object and validate it's a real date
                const date = new Date(yearNum, monthNum - 1, dayNum);
                if (date.getFullYear() === yearNum && date.getMonth() === monthNum - 1 && date.getDate() === dayNum) {
                  return `${yearNum}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                }
              }
            }
          }
          
          // Try to parse as-is first (for already formatted dates)
          try {
            const date = new Date(cleanDate);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          } catch (e) {
            console.warn('Could not parse date:', cleanDate);
          }
          
          return null;
        };

        // Prepare profile data for insertion
        const profileInsertData = {
          provider_id: providerId,
          first_name: profileData.first_name,
          last_name: profileData.last_name,
          phone: profileData.phone,
          pincode: profileData.pincode,
          city: profileData.city,
          state: profileData.state,
          address: profileData.address,
          location_latitude: profileData.location_latitude || null,
          location_longitude: profileData.location_longitude || null,
          bio: profileData.bio || null,
          qualifications: profileData.qualifications || [],
          certifications: profileData.certifications || [],
          languages: profileData.languages || [],
          profile_photo_url: profileData.profile_photo_url || null,
          aadhaar_number: profileData.aadhaar_number || null,
          aadhaar_name: profileData.aadhaar_name || null,
          aadhaar_dob: convertDateFormat(profileData.aadhaar_dob),
          aadhaar_gender: profileData.aadhaar_gender || null,
          aadhaar_address: profileData.aadhaar_address || null,
          hourly_rate: profileData.hourly_rate ? parseFloat(profileData.hourly_rate) : null,
          years_of_experience: profileData.years_of_experience ? parseInt(profileData.years_of_experience) : null,
          status: 'active' // Set status to active when profile is completed
        };

        // Debug: Log the converted date
        console.log('Original aadhaar_dob:', profileData.aadhaar_dob);
        console.log('Converted aadhaar_dob:', profileInsertData.aadhaar_dob);

    // Insert or update provider profile
    console.log('Attempting to upsert profile data:', profileInsertData);
    
    const { data: upsertData, error: profileError } = await supabase
      .from('provider_profiles')
      .upsert(profileInsertData, {
        onConflict: 'provider_id'
      })
      .select();

    if (profileError) {
      console.error('Provider profile upsert error:', profileError);
      console.error('Error details:', {
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
        code: profileError.code
      });
      return res.status(500).json({ 
        error: 'Failed to save provider profile',
        details: profileError.message 
      });
    }

    console.log('Profile upsert successful:', upsertData);

    res.json({ 
      success: true, 
      message: 'Provider profile completed successfully',
      data: {
        provider_id: providerId,
        first_name: profileData.first_name,
        last_name: profileData.last_name
      }
    });

  } catch (error) {
    console.error('Provider profile completion error:', error);
    res.status(500).json({ error: error.message || 'Provider profile completion failed' });
  }
});

// Get provider profile
router.get('/profile/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    console.log('Fetching provider profile for:', providerId);
    
    // First, try to get data from provider_profile_view if it exists
    let profileData = null;
    let profileError = null;
    
    try {
      const { data, error } = await supabase
        .from('provider_profile_view')
        .select('*')
        .eq('provider_id', providerId)
        .single();
      
      profileData = data;
      profileError = error;
    } catch (viewError) {
      console.log('provider_profile_view not available, trying direct table queries');
      profileError = viewError;
    }

    // If view doesn't exist or fails, get data directly from tables
    if (profileError || !profileData) {
      console.log('Fetching data directly from tables...');
      
      // Get service provider details
      const { data: spdData, error: spdError } = await supabase
        .from('service_provider_details')
        .select('*')
        .eq('id', providerId)
        .single();

      // Get provider profile data
      const { data: ppData, error: ppError } = await supabase
        .from('provider_profiles')
        .select('*')
        .eq('provider_id', providerId)
        .single();

      // If no service provider details found, return a basic profile structure
      if (spdError || !spdData) {
        console.log('No service provider details found, returning basic profile structure');
        profileData = {
          provider_id: providerId,
          specialization: null,
          service_category_id: null,
          service_id: null,
          experience_years: 0,
          hourly_rate: 0,
          status: 'incomplete',
          ...(ppData || {}) // Add provider profile data if it exists
        };
      } else {
        // Combine the data
        profileData = {
          provider_id: providerId,
          specialization: spdData.specialization,
          service_category_id: spdData.service_category_id,
          service_id: spdData.service_id,
          experience_years: spdData.experience_years,
          hourly_rate: spdData.hourly_rate || spdData.basic_pay,
          status: spdData.status,
          ...(ppData || {}) // Add provider profile data if it exists
        };
      }
    }

    if (!profileData) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    // Get the email from the users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('id', providerId)
      .single();

    if (userError) {
      console.error('Get user email error:', userError);
      // Don't fail the request, just log the error
    }

    // Get service category name
    let serviceCategoryName = null;
    if (profileData.service_category_id) {
      const { data: categoryData, error: categoryError } = await supabase
        .from('service_categories')
        .select('name')
        .eq('id', profileData.service_category_id)
        .single();
      
      if (!categoryError && categoryData) {
        serviceCategoryName = categoryData.name;
      }
    }

    // Get service name
    let serviceName = null;
    if (profileData.service_id) {
      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('name')
        .eq('id', profileData.service_id)
        .single();
      
      if (!serviceError && serviceData) {
        serviceName = serviceData.name;
      }
    }

    // Combine the data
    const combinedData = {
      ...profileData,
      email: userData?.email || null,
      service_category_name: serviceCategoryName,
      service_name: serviceName,
      // Normalize experience field for frontend
      years_of_experience: profileData.experience_years || profileData.years_of_experience || 0,
      // Ensure we have the basic fields
      first_name: profileData.first_name || '',
      last_name: profileData.last_name || '',
      phone: profileData.phone || '',
      city: profileData.city || '',
      state: profileData.state || '',
      pincode: profileData.pincode || '',
      address: profileData.address || '',
      specialization: profileData.specialization || '',
      hourly_rate: profileData.hourly_rate || profileData.basic_pay || 0,
      status: profileData.status || 'active',
      is_verified: profileData.is_verified || false,
      profile_status: profileData.profile_status || 'active'
    };

    console.log('Returning provider profile data:', combinedData);
    res.json({ success: true, data: combinedData });

  } catch (error) {
    console.error('Get provider profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch provider profile' });
  }
});

// Update provider profile (editable fields)
router.put('/profile/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    const updateData = req.body;
    
    console.log('Updating provider profile:', providerId, updateData);
    
    // Validate that the provider profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('provider_profiles')
      .select('provider_id, status')
      .eq('provider_id', providerId)
      .single();

    if (checkError || !existingProfile) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }

    // Allow updates if status is 'active' or 'pending_verification'
    if (existingProfile.status !== 'active' && existingProfile.status !== 'pending_verification') {
      return res.status(403).json({ 
        error: 'Profile is not active. Complete your profile first.',
        currentStatus: existingProfile.status
      });
    }

    // Prepare update data (only allow certain fields to be updated)
    const allowedFields = [
      'first_name', 'last_name', 'phone', 'bio', 'qualifications', 
      'certifications', 'languages', 'hourly_rate', 'years_of_experience',
      'pincode', 'city', 'state', 'address', 'location_latitude', 'location_longitude'
    ];
    
    const filteredUpdateData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        filteredUpdateData[field] = updateData[field];
      }
    });

    // Add updated_at timestamp
    filteredUpdateData.updated_at = new Date().toISOString();

    // Update the profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('provider_profiles')
      .update(filteredUpdateData)
      .eq('provider_id', providerId)
      .select()
      .single();

    if (updateError) {
      console.error('Update provider profile error:', updateError);
      return res.status(500).json({ error: 'Failed to update provider profile' });
    }

    // Check if profile is now complete and should be set to pending_verification
    const isProfileComplete = checkProfileCompletion(updatedProfile);
    
    if (isProfileComplete && existingProfile.status === 'incomplete') {
      // Update status to pending_verification
      const { error: statusUpdateError } = await supabase
        .from('provider_profiles')
        .update({ 
          status: 'pending_verification',
          updated_at: new Date().toISOString()
        })
        .eq('provider_id', providerId);
      
      if (statusUpdateError) {
        console.warn('Failed to update status to pending_verification:', statusUpdateError);
      } else {
        console.log('Profile completed, status updated to pending_verification');
      }
    }

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      data: updatedProfile
    });

  } catch (error) {
    console.error('Update provider profile error:', error);
    res.status(500).json({ error: error.message || 'Failed to update provider profile' });
  }
});

// Complete service provider profile (OLD - for user_profiles table)
router.post('/profile/complete', async (req, res) => {
  try {
    const profileData = req.body;
    
    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'phone', 'specialization', 'service_category_id', 'service_id', 'experience_years', 'hourly_rate', 'address', 'city', 'state', 'pincode'];
    const missingFields = requiredFields.filter(field => !profileData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        missingFields 
      });
    }

    // Get user ID from auth (you might need to implement proper auth middleware)
    const userId = req.user?.id || req.body.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    // Update user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        phone: profileData.phone,
        address: profileData.address,
        city: profileData.city,
        state: profileData.state,
        pincode: profileData.pincode,
        bio: profileData.bio || null,
        qualifications: profileData.qualifications || null,
        certifications: profileData.certifications || null,
        languages: profileData.languages || [],
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('Profile update error:', profileError);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    // Update or create service provider details
    const { error: spError } = await supabase
      .from('service_provider_details')
      .upsert({
        id: userId,
        specialization: profileData.specialization,
        service_category_id: profileData.service_category_id,
        service_id: profileData.service_id,
        status: 'active', // Move from pending_verification to active
        experience_years: parseInt(profileData.experience_years) || 0,
        basic_pay: parseFloat(profileData.basic_pay || profileData.hourly_rate) || 0, // Use basic_pay field
        availability: profileData.availability || {},
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (spError) {
      console.error('Service provider details update error:', spError);
      return res.status(500).json({ error: 'Failed to update service provider details' });
    }

    // Update user status to active
    const { error: userError } = await supabase
      .from('users')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (userError) {
      console.error('User status update error:', userError);
      return res.status(500).json({ error: 'Failed to update user status' });
    }

    res.json({ 
      success: true, 
      message: 'Profile completed successfully',
      status: 'active'
    });

  } catch (error) {
    console.error('Profile completion error:', error);
    res.status(500).json({ error: error.message || 'Profile completion failed' });
  }
});

// Update provider profile status (Admin function)
router.put('/admin/profile/:providerId/status', async (req, res) => {
  try {
    const { providerId } = req.params;
    const { status, reason } = req.body;
    
    console.log('Received status update request:', {
      providerId,
      status,
      reason,
      statusType: typeof status
    });
    
    // Safety check: if frontend sends pending_verification, convert to pending
    if (status === 'pending_verification') {
      console.log('Converting pending_verification to pending');
      status = 'pending';
    }
    
    // Validate status - use correct enum values from provider_profiles table schema
    const validStatuses = ['incomplete', 'pending', 'active', 'verified', 'rejected', 'suspended'];
    if (!validStatuses.includes(status)) {
      console.error('Invalid status received:', { status, validStatuses });
      return res.status(400).json({ 
        error: 'Invalid status', 
        validStatuses,
        received: status
      });
    }
    
    // Map status values to match service_provider_details enum
    let mappedStatus = status;
    if (status === 'pending') {
      mappedStatus = 'pending_verification';
    } else if (status === 'verified') {
      mappedStatus = 'active';
    } else if (status === 'rejected') {
      mappedStatus = 'inactive';
    } else if (status === 'active') {
      mappedStatus = 'active';
    } else if (status === 'suspended') {
      mappedStatus = 'suspended';
    }
    
    console.log('Status mapping:', { original: status, mapped: mappedStatus });
    
    // Update both tables - try provider_profiles first, then service_provider_details
    let providerUpdateSuccess = false;
    let serviceProviderUpdateSuccess = false;
    
    // Try to update provider_profiles table
    try {
      console.log('Attempting to update provider_profiles with status:', status);
      const { data: updateData, error: updateError } = await supabase
        .from('provider_profiles')
        .update({ 
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('provider_id', providerId)
        .select();
      
      if (updateError) {
        console.warn('Provider profiles update failed:', updateError.message);
        console.warn('Update error details:', updateError);
      } else {
        console.log('Successfully updated provider_profiles status:', updateData);
        providerUpdateSuccess = true;
      }
    } catch (error) {
      console.warn('Provider profiles update error:', error.message);
    }
    
    // Try to update service_provider_details table
    try {
      const { data: updateDetailsData, error: updateDetailsError } = await supabase
        .from('service_provider_details')
        .update({ 
          status: mappedStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', providerId)
        .select();
      
      if (updateDetailsError) {
        console.warn('Service provider details update failed:', updateDetailsError.message);
      } else {
        console.log('Successfully updated service_provider_details status:', updateDetailsData);
        serviceProviderUpdateSuccess = true;
      }
    } catch (error) {
      console.warn('Service provider details update error:', error.message);
    }
    
    // If at least one update succeeded, consider it a success
    if (providerUpdateSuccess || serviceProviderUpdateSuccess) {
      console.log('Status update completed successfully');
    } else {
      console.error('Both updates failed');
      return res.status(500).json({ 
        error: 'Failed to update profile status in both tables',
        details: 'Check database schema and permissions'
      });
    }

    // Send email notification for status changes (optional, don't fail if this fails)
    try {
      // Get user details for email
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          role,
          status,
          user_profiles!inner(
            first_name,
            last_name
          )
        `)
        .eq('id', providerId)
        .single();

      if (!userError && userData) {
        const userName = userData.user_profiles 
          ? `${userData.user_profiles.first_name || ''} ${userData.user_profiles.last_name || ''}`.trim()
          : userData.email;

        if (status === 'suspended') {
          await sendSuspensionEmail({
            to: userData.email,
            userName: userName || userData.email,
            userEmail: userData.email,
            reason: reason,
            isServiceProvider: true
          });
          console.log(`✅ Provider suspension email sent to ${userData.email}`);
        } else if (status === 'active') {
          await sendReactivationEmail({
            to: userData.email,
            userName: userName || userData.email,
            userEmail: userData.email,
            isServiceProvider: true
          });
          console.log(`✅ Provider reactivation email sent to ${userData.email}`);
        }
      }
    } catch (emailError) {
      // Don't fail the request if email fails
      console.warn('⚠️ Failed to send provider status change email:', emailError.message);
    }
    
    // Log status change if reason provided (optional, don't fail if this fails)
    try {
      if (reason) {
        const { error: logError } = await supabase
          .from('profile_status_log')
          .insert({
            provider_id: providerId,
            new_status: status,
            reason: reason
          });
        
        if (logError) {
          console.warn('Failed to log status change:', logError);
        }
      }
    } catch (logError) {
      console.warn('Failed to log status change:', logError.message);
    }
    
    res.json({ 
      success: true, 
      message: 'Profile status updated successfully',
      data: {
        provider_id: providerId,
        new_status: status,
        reason: reason || null
      }
    });
    
  } catch (error) {
    console.error('Profile status update error:', error);
    res.status(500).json({ error: error.message || 'Profile status update failed' });
  }
});

// Get provider profile status
router.get('/profile/:providerId/status', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data: profileData, error: profileError } = await supabase
      .from('provider_profiles')
      .select('provider_id, status, created_at, updated_at')
      .eq('provider_id', providerId)
      .single();
    
    if (profileError || !profileData) {
      return res.status(404).json({ error: 'Provider profile not found' });
    }
    
    // Get recent status changes
    const { data: statusLog, error: logError } = await supabase
      .from('profile_status_log')
      .select('old_status, new_status, reason, created_at')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    res.json({ 
      success: true,
      data: {
        provider_id: providerId,
        status: profileData.status,
        created_at: profileData.created_at,
        updated_at: profileData.updated_at,
        status_history: statusLog || []
      }
    });
    
  } catch (error) {
    console.error('Get profile status error:', error);
    res.status(500).json({ error: error.message || 'Failed to get profile status' });
  }
});

// Get service provider details from service_provider_details table
router.get('/service-provider-details/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const { data: detailsData, error } = await supabase
      .from('service_provider_details')
      .select('*')
      .eq('id', providerId)
      .single();
    
    if (error) {
      // If no service provider details found, return null
      return res.json({ 
        success: true, 
        data: null 
      });
    }
    
    res.json({ 
      success: true, 
      data: detailsData 
    });
    
  } catch (error) {
    console.error('Get service provider details error:', error);
    res.status(500).json({ error: error.message || 'Failed to get service provider details' });
  }
});

module.exports = router;


