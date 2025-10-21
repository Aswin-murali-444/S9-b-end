// Profile Completion Modal API Integration Example
// This shows how to call the new /users/profile/complete-provider endpoint

// Example data structure that matches the Profile Completion modal fields
const profileCompletionData = {
  // Required fields
  provider_id: "uuid-of-service-provider-details-record", // This should be the user's ID who is a service provider
  first_name: "John",
  last_name: "Doe", 
  phone: "+91-9876543210",
  pincode: "400001",
  city: "Mumbai",
  state: "Maharashtra",
  address: "123 Main Street, Apartment 4B",
  
  // Optional location coordinates (if using "Use Current Location")
  location_latitude: 19.0760,
  location_longitude: 72.8777,
  
  // Professional Information
  bio: "Experienced professional with 5+ years in home maintenance services",
  qualifications: ["Bachelor's in Engineering", "Certified Electrician"],
  certifications: ["OSHA Safety Certification", "Advanced Plumbing Course"],
  languages: ["English", "Hindi", "Marathi"],
  
  // Documents & Verification (Aadhaar extracted data only - NO images)
  profile_photo_url: "https://your-supabase-url.com/storage/v1/object/public/provider_img_profile/user123.jpg",
  aadhaar_number: "123456789012",
  aadhaar_name: "John Doe",
  aadhaar_dob: "1990-01-15",
  aadhaar_gender: "Male",
  aadhaar_address: "123 Main Street, Mumbai, Maharashtra 400001"
};

// Function to upload provider profile picture
async function uploadProviderProfilePicture(file, providerId) {
  try {
    // Convert file to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const response = await fetch('/users/provider/profile-picture-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authentication headers if needed
        // 'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        base64: base64,
        providerId: providerId
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('Profile picture uploaded successfully:', result);
      return { success: true, publicUrl: result.publicUrl };
    } else {
      console.error('Profile picture upload failed:', result);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Network error:', error);
    return { success: false, error: 'Network error occurred' };
  }
}

// Function to submit profile completion data
async function submitProfileCompletion(profileData) {
  try {
    const response = await fetch('/users/profile/complete-provider', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authentication headers if needed
        // 'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(profileData)
    });

    const result = await response.json();

    if (response.ok) {
      console.log('Profile completed successfully:', result);
      return { success: true, data: result };
    } else {
      console.error('Profile completion failed:', result);
      return { success: false, error: result.error, missingFields: result.missingFields };
    }
  } catch (error) {
    console.error('Network error:', error);
    return { success: false, error: 'Network error occurred' };
  }
}

// Function to get provider profile data
async function getProviderProfile(providerId) {
  try {
    const response = await fetch(`/users/profile/provider/${providerId}`);
    const result = await response.json();

    if (response.ok) {
      console.log('Provider profile retrieved:', result);
      return { success: true, data: result.data };
    } else {
      console.error('Failed to get provider profile:', result);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('Network error:', error);
    return { success: false, error: 'Network error occurred' };
  }
}

// Usage example in your Profile Completion modal
async function handleProfileSubmit(formData, profilePhotoFile) {
  // Validate required fields
  const requiredFields = ['provider_id', 'first_name', 'last_name', 'phone', 'pincode', 'city', 'state', 'address'];
  const missingFields = requiredFields.filter(field => !formData[field]);
  
  if (missingFields.length > 0) {
    alert(`Missing required fields: ${missingFields.join(', ')}`);
    return;
  }

  // Show loading state
  setLoading(true);
  
  try {
    let profilePhotoUrl = null;
    
    // Upload profile photo if provided
    if (profilePhotoFile) {
      const uploadResult = await uploadProviderProfilePicture(profilePhotoFile, formData.provider_id);
      if (uploadResult.success) {
        profilePhotoUrl = uploadResult.publicUrl;
        formData.profile_photo_url = profilePhotoUrl;
      } else {
        alert(`Profile photo upload failed: ${uploadResult.error}`);
        return;
      }
    }

    // Submit profile data
    const result = await submitProfileCompletion(formData);
    
    if (result.success) {
      // Success - close modal, show success message
      alert('Profile completed successfully!');
      closeModal();
      // Optionally refresh data or redirect
    } else {
      // Error - show error message
      alert(`Error: ${result.error}`);
      if (result.missingFields) {
        console.log('Missing fields:', result.missingFields);
      }
    }
  } catch (error) {
    alert('An unexpected error occurred');
    console.error('Unexpected error:', error);
  } finally {
    setLoading(false);
  }
}

// Example of how to structure the form data from your modal
function collectFormData() {
  return {
    // Get provider_id from current user context
    provider_id: getCurrentUserId(), // You need to implement this
    
    // Personal Information
    first_name: document.getElementById('first_name').value,
    last_name: document.getElementById('last_name').value,
    phone: document.getElementById('phone').value,
    
    // Location Information
    pincode: document.getElementById('pincode').value,
    city: document.getElementById('city').value,
    state: document.getElementById('state').value,
    address: document.getElementById('address').value,
    location_latitude: currentLocation?.latitude || null,
    location_longitude: currentLocation?.longitude || null,
    
    // Professional Information
    bio: document.getElementById('bio').value,
    qualifications: getSelectedQualifications(), // Array of selected qualifications
    certifications: getSelectedCertifications(), // Array of selected certifications
    languages: getSelectedLanguages(), // Array of selected languages
    
    // Documents & Verification
    profile_photo_url: uploadedProfilePhotoUrl, // URL after upload
    aadhaar_number: extractedAadhaarData?.aadhaar_number || null,
    aadhaar_name: extractedAadhaarData?.name || null,
    aadhaar_dob: extractedAadhaarData?.date_of_birth || null,
    aadhaar_gender: extractedAadhaarData?.gender || null,
    aadhaar_address: extractedAadhaarData?.address || null
  };
}

// Export for use in your React/Vue components
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    submitProfileCompletion,
    getProviderProfile,
    handleProfileSubmit,
    collectFormData
  };
}
