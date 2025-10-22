# Backend Environment Configuration Guide

## Required Environment Variables

Create a `.env` file in the `S9-b-end` directory with the following variables:

```env
# Supabase Configuration
SUPABASE_URL=https://zbscbvrklkntlbtefkgw.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Configuration
JWT_SECRET=zyrxI/zivjSgRBXi0YsE7noWYTaUHBgCFS1tn8kkOvMo+1q2Jaic/tHuTnnBEri6So+7vw/FebFN2vEFCsFP6g==

# Aadhaar API Configuration
AADHAAR_API_URL=https://api.aadhaar.com/v1
AADHAAR_API_KEY=your_aadhaar_api_key_here

# Email Configuration (SendGrid)
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=noreply@nexus.com

# Payment Configuration (Razorpay)
RAZORPAY_KEY_ID=your_razorpay_key_id_here
RAZORPAY_KEY_SECRET=your_razorpay_key_secret_here

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_number_here

# AI Assistant Configuration
OPENAI_API_KEY=your_openai_api_key_here

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Database Configuration
DB_CONNECTION_POOL_SIZE=10
DB_CONNECTION_TIMEOUT=30000

# Security Configuration
BCRYPT_ROUNDS=12
SESSION_SECRET=your_session_secret_here

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

## Setup Instructions

1. **Create the .env file:**
   ```bash
   cd S9-b-end
   touch .env
   ```

2. **Copy the configuration above into your .env file**

3. **Update the placeholder values:**
   - Replace `your_service_role_key_here` with your actual Supabase service role key
   - Replace `your_aadhaar_api_key_here` with your Aadhaar API key
   - Replace `your_sendgrid_api_key_here` with your SendGrid API key
   - Replace `your_razorpay_key_id_here` and `your_razorpay_key_secret_here` with your Razorpay credentials
   - Replace `your_twilio_account_sid_here`, `your_twilio_auth_token_here`, and `your_twilio_phone_number_here` with your Twilio credentials
   - Replace `your_openai_api_key_here` with your OpenAI API key
   - Replace `your_session_secret_here` with a secure random string

4. **Create necessary directories:**
   ```bash
   mkdir -p uploads
   mkdir -p logs
   ```

## Environment Variable Descriptions

- **SUPABASE_URL**: Your Supabase project URL
- **SUPABASE_ANON_KEY**: Your Supabase anonymous key (already provided)
- **SUPABASE_SERVICE_ROLE_KEY**: Your Supabase service role key for admin operations
- **PORT**: Server port (default: 3001)
- **NODE_ENV**: Environment mode (development/production)
- **JWT_SECRET**: Secret key for JWT token signing
- **AADHAAR_API_URL**: Aadhaar verification API endpoint
- **AADHAAR_API_KEY**: Aadhaar API authentication key
- **SENDGRID_API_KEY**: SendGrid API key for email services
- **FROM_EMAIL**: Default sender email address
- **RAZORPAY_KEY_ID**: Razorpay public key
- **RAZORPAY_KEY_SECRET**: Razorpay secret key
- **TWILIO_ACCOUNT_SID**: Twilio account SID
- **TWILIO_AUTH_TOKEN**: Twilio authentication token
- **TWILIO_PHONE_NUMBER**: Twilio phone number for SMS
- **OPENAI_API_KEY**: OpenAI API key for AI assistant features
- **MAX_FILE_SIZE**: Maximum file upload size in bytes (10MB)
- **UPLOAD_PATH**: Directory for file uploads
- **BCRYPT_ROUNDS**: Number of rounds for password hashing
- **SESSION_SECRET**: Secret for session management
- **ALLOWED_ORIGINS**: Comma-separated list of allowed CORS origins
- **LOG_LEVEL**: Logging level (error, warn, info, debug)
- **LOG_FILE**: Path to log file

## Security Notes

- Never commit the `.env` file to version control
- Use strong, unique values for all secret keys
- Rotate API keys regularly
- Use environment-specific values for production
