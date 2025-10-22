# Render Deployment Guide for S9 Backend

## Prerequisites
1. Render account (free tier available)
2. GitHub repository with your backend code
3. All environment variables ready

## Deployment Steps

### 1. Connect GitHub Repository
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select your repository containing the S9-b-end folder

### 2. Configure Service Settings
- **Name**: `s9-backend` (or your preferred name)
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free (or upgrade as needed)

### 3. Environment Variables
Set these in your Render dashboard under "Environment":

#### Required Variables:
```
NODE_ENV=production
PORT=10000
SUPABASE_URL=https://zbscbvrklkntlbtefkgw.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
JWT_SECRET=zyrxI/zivjSgRBXi0YsE7noWYTaUHBgCFS1tn8kkOvMo+1q2Jaic/tHuTnnBEri6So+7vw/FebFN2vEFCsFP6g==
```

#### Optional Variables (add as needed):
```
SENDGRID_API_KEY=your_sendgrid_api_key_here
RAZORPAY_KEY_ID=your_razorpay_key_id_here
RAZORPAY_KEY_SECRET=your_razorpay_key_secret_here
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_number_here
OPENAI_API_KEY=your_openai_api_key_here
AADHAAR_API_KEY=your_aadhaar_api_key_here
```

### 4. Deploy
1. Click "Create Web Service"
2. Render will automatically build and deploy your service
3. Your backend will be available at: `https://your-service-name.onrender.com`

## Important Notes

### Port Configuration
- Render uses port 10000 by default
- Your app should use `process.env.PORT || 3001` (which you already have)

### CORS Configuration
Update your CORS settings in `index.js` to include your Render URL:
```javascript
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'http://127.0.0.1:5173',
    'https://your-frontend-domain.com'  // Add your frontend URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
```

### Environment Variables Security
- Never commit sensitive keys to GitHub
- Use Render's environment variable settings
- Keep your `.env` file local only

## Testing Your Deployment
Once deployed, test these endpoints:
- `GET https://your-service-name.onrender.com/` - Health check
- `GET https://your-service-name.onrender.com/health` - Detailed health info
- `GET https://your-service-name.onrender.com/api/users` - Test API endpoint

## Troubleshooting
1. **Build fails**: Check that all dependencies are in package.json
2. **Runtime errors**: Check Render logs in the dashboard
3. **Environment variables**: Ensure all required vars are set
4. **CORS issues**: Update CORS configuration for your frontend domain

## MCP Integration
To connect your MCP to Render, you'll need:
1. Your Render service URL
2. Any API keys or authentication tokens
3. Update your MCP configuration accordingly
