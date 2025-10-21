# Aadhaar Extraction Troubleshooting Guide

## Issue Identified
The Aadhaar extraction is not working. Based on the diagnostic tests, here are the potential issues and solutions:

## ✅ What's Working
- Environment variables are properly set
- AadhaarService is initialized correctly
- OpenRouter API is accessible
- Routes are registered in the server

## ❌ Potential Issues

### 1. Server Not Using Latest Code
**Problem**: The server might be running old code without the Aadhaar routes.

**Solution**: Restart the backend server
```bash
# Stop the current server (Ctrl+C in the terminal where it's running)
# Then restart:
cd S9-b-end
npm start
# or
node index.js
```

### 2. Route Registration Issue
**Problem**: The Aadhaar routes might not be properly registered.

**Solution**: Check the server startup logs for any errors.

### 3. Multer Configuration Issue
**Problem**: File upload middleware might not be working properly.

**Solution**: The multer configuration looks correct, but let's verify.

### 4. API Key Issues
**Problem**: OpenRouter API key might have insufficient credits or be invalid.

**Solution**: 
- Check your OpenRouter account balance
- Verify the API key is correct
- Test with a simple API call

## 🔧 Step-by-Step Fix

### Step 1: Restart the Server
1. Stop the current backend server (Ctrl+C)
2. Navigate to S9-b-end directory
3. Run: `node index.js`
4. Check for any startup errors

### Step 2: Test the Endpoint
1. Open browser developer tools
2. Go to the Profile Completion modal
3. Upload an Aadhaar image
4. Check the Network tab for API calls
5. Look for error messages in the console

### Step 3: Check Server Logs
Look for these log messages when testing:
- "Extracting Aadhaar details from front/back side"
- "Calling backend Aadhaar API"
- Any error messages

### Step 4: Manual API Test
Test the endpoint directly:
```bash
# Using curl (if available)
curl -X POST http://localhost:3001/api/aadhaar/extract \
  -F "image=@path/to/aadhaar-image.jpg" \
  -F "side=front"
```

## 🚨 Common Error Messages & Solutions

### "Payment required" or "Payment Required"
**Solution**: Add credits to your OpenRouter account

### "API request failed: 401" or "403"
**Solution**: Check your AADHAAR_API_KEY in .env file

### "No image provided"
**Solution**: Ensure the image is being uploaded correctly in the frontend

### "OpenRouter API error"
**Solution**: Check your internet connection and API key

## 🔍 Debug Steps

1. **Check Browser Console**: Look for JavaScript errors
2. **Check Network Tab**: See if the API call is being made
3. **Check Server Logs**: Look for backend errors
4. **Test with Sample Image**: Use a clear, readable Aadhaar image

## 📝 Testing Checklist

- [ ] Backend server is running on port 3001
- [ ] Environment variables are set
- [ ] OpenRouter API key has credits
- [ ] Image is being uploaded correctly
- [ ] No JavaScript errors in browser console
- [ ] API endpoint is accessible

## 🆘 If Still Not Working

1. **Check the exact error message** in browser console
2. **Verify the image format** (JPG, PNG)
3. **Test with a different Aadhaar image**
4. **Check OpenRouter account status**
5. **Restart both frontend and backend**

## 📞 Support

If the issue persists, provide:
1. Exact error message from browser console
2. Server logs when the error occurs
3. Screenshot of the Network tab showing the failed request
4. Details about the image being uploaded (format, size, quality)
