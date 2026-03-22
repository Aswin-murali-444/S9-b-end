# Backend Environment Configuration Guide

## Required Environment Variables

Create a `.env` file in the `S9-b-end` directory with the following variables:

```env
# Supabase Configuration
SUPABASE_URL=https://zbscbvrklkntlbtefkgw.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY
# Required for server-side reads (recommendations, admin). Anon key + RLS often exposes only 1–2 rows.
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Configuration
JWT_SECRET=zyrxI/zivjSgRBXi0YsE7noWYTaUHBgCFS1tn8kkOvMo+1q2Jaic/tHuTnnBEri6So+7vw/FebFN2vEFCsFP6g==

# Aadhaar Extraction (uses OpenRouter AI vision models)
AADHAAR_API_PROVIDER=openrouter
AADHAAR_API_KEY=your_openrouter_api_key_here
# Vision model for document extraction (use a vision-capable model, not image-generation)
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
OPENROUTER_SITE_URL=http://localhost:3001
OPENROUTER_APP_NAME=S9-Aadhaar-Extractor

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

# ML service (Python) — recommendations / ranking (hosted must use a public URL, not localhost)
# ML_SERVICE_URL=https://your-ml-service.example.com
# ML_SERVICE_TIMEOUT_MS=15000

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Database Configuration
DB_CONNECTION_POOL_SIZE=10
DB_CONNECTION_TIMEOUT=30000

# Security Configuration
BCRYPT_ROUNDS=12
SESSION_SECRET=your_session_secret_here

# Admin SQL execution (for run-sql script – create tables without SQL Editor)
ADMIN_SECRET_KEY=your_admin_secret_here

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
- **AADHAAR_API_KEY**: OpenRouter API key (same as sk-or-v1-...) for Aadhaar image extraction
- **OPENROUTER_MODEL**: Vision model for extraction. Use `google/gemini-2.0-flash-exp:free` for free vision; avoid image-generation models like gemini-3-pro-image-preview
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

## Optional: daily weather / seasonal scores

Used by `npm run refresh-seasonal-scores` (writes `service_seasonal_scores` in Supabase). Same Supabase vars as above.

- **SEASON_SCORE_COUNTRY**: Country code for scoring rules (default `IN`). Must match how you use `country_code` on recommendations.

### Automatic daily refresh (while `node index.js` is running)

The API schedules **one refresh per calendar day** (default **02:30 Asia/Kolkata**) using `node-cron`. No OS cron required.

- **SEASONAL_SCORES_CRON** = `false` or `0` — turn off the in-process job.
- **DISABLE_SEASONAL_SCORES_CRON** = `1` — same as off.
- **SEASONAL_SCORES_CRON_EXPRESSION** — optional 5-field cron (minute hour day month weekday), interpreted in `SEASONAL_SCORES_TZ` (default `Asia/Kolkata`). Example: `0 3 * * *` = 03:00 daily.
- **SEASONAL_SCORES_TZ** — IANA timezone for the expression (default `Asia/Kolkata`).

If the server restarts, the job is re-registered; the next run is the next matching wall-clock time in that timezone.

### Cursor: Supabase MCP (optional)

If **Supabase MCP** is connected in Cursor (**Settings → Tools & MCP**), the AI can use Supabase’s MCP tools (inspect schema, etc.). That is **separate** from:

- **`mcp_execute_sql`** — a Postgres **function** in your project used by `npm run setup:seasonal-table` (RPC fallback) and `POST /admin/execute-sql`.
- **Backend env** — the API still needs **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** in `S9-b-end/.env`.

To version a **project** MCP template (replace placeholders; **do not commit real tokens**), copy `.cursor/mcp.json.example` → `.cursor/mcp.json` and fill in **project ref** + **personal access token** from [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens).

### Create the `service_seasonal_scores` table (no Cursor MCP required)

Recommended for scripts/CI:

- **DATABASE_URL** (or **SUPABASE_DATABASE_URL**): URI from Supabase → **Project Settings → Database → Connection string** (URI).

```bash
cd S9-b-end
npm run setup:seasonal-table
npm run refresh-seasonal-scores
```

- **DATABASE_SSL=false**: only for local Postgres without SSL.

If `DATABASE_URL` is not set, `setup:seasonal-table` tries the **`mcp_execute_sql`** RPC. You can also paste `create-service-seasonal-scores.sql` in the Supabase SQL Editor.

### Season profiles table (`service_season_profile`)

Recommendations read **only real catalog services** tagged by phase (summer / monsoon / winter / neutral / all_year). Create the table once, then refresh after catalog changes:

1. Run **`create-service-season-profiles.sql`** in the Supabase SQL Editor (or via your usual `run-sql` flow).
2. From `S9-b-end`:

```bash
npm run refresh-season-profiles
```

While `node index.js` runs, the daily seasonal job refreshes **scores** then **profiles** automatically. Tune matching in **`lib/seasonProfileClassifier.js`** to your **`service_categories.name`** values.

## Hosted vs local (recommendations)

- **Git `main`** may be up to date while **your server is not**. Redeploy the API (e.g. Render “Manual Deploy”) after every push.
- The **browser build** calls the API from `VITE_API_URL`, or falls back to **`https://nexus-d2dx.onrender.com`** (`S9-f-end/src/lib/apiBaseUrl.js`). That is **not** your laptop — it must run the same backend code and **`.env`** as local for parity.
- **`SUPABASE_SERVICE_ROLE_KEY` must be set on the host.** Without it, the API uses the anon key and RLS often hides almost all `services` rows → **one recommendation**.
- Check the live API: `GET https://<your-api-host>/health`  
  - `supabaseServiceRoleConfigured` should be **`true`**.  
  - `deployCommit` (if present) should match the short SHA of the latest commit on `main` (e.g. `a83657d`).
- **Catalog visibility:** `GET https://<your-api-host>/services/catalog-meta`  
  - `supabaseServiceRoleConfigured`: **`true`**  
  - `servicesVisibleCount`: should match (roughly) the number of services in Supabase **Table Editor** for that project. If this is **1** locally vs many in the dashboard, the API is using the **wrong Supabase project** or **anon + RLS**.
- The recommendations route uses a **dedicated service-role client** when `SUPABASE_SERVICE_ROLE_KEY` or **`SUPABASE_SERVICE_ROLE`** is set (alias for common env typos).

### Still different: local vs hosted?

1. **Same API build?** Hosted must **redeploy** after `git push`. Compare `GET .../health` → `deployCommit` (if set) to GitHub `main`.
2. **Same Supabase project?** Compare **`GET http://localhost:3001/services/diagnostics`** vs **`GET https://YOUR-API/services/diagnostics`**:  
   - **`supabaseProjectHost`** must be **identical** (e.g. `xxxx.supabase.co`).  
   - If different, local and production are pointing at **different databases**.
3. **Service role on host:** **`supabaseServiceRoleConfigured`: `true`** on production `diagnostics` / `catalog-meta`. If `false`, set **`SUPABASE_SERVICE_ROLE_KEY`** on Render (etc.) and redeploy.
4. **Same browser → API URL?** Production frontend uses **`VITE_API_URL`** in Vercel (or falls back to `S9-f-end/src/lib/apiBaseUrl.js`). If it still hits an **old** Render URL or wrong service, behaviour won’t match local.
5. **ML service:** If **`mlServiceHostIsUnreachableFromHosted`** is `true`, hosted cannot call your laptop’s ML; set **`ML_SERVICE_URL`** to a **public** ML base URL on the API host, or accept different recommendation ordering vs local.

## Security Notes

- Never commit the `.env` file to version control
- Use strong, unique values for all secret keys
- Rotate API keys regularly
- Use environment-specific values for production
