# S9 Mini Backend

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the `b-end` directory with the following content:
   ```env
   SUPABASE_URL=https://zbscbvrklkntlbtefkgw.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpic2NidnJrbGtudGxidGVma2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwODgzOTIsImV4cCI6MjA2ODY2NDM5Mn0.EJbPGMn7kXFgj5IahA2GIiEcA3dTDCbgj9cF09rcsuY
   JWT_SECRET=zyrxI/zivjSgRBXi0YsE7noWYTaUHBgCFS1tn8kkOvMo+1q2Jaic/tHuTnnBEri6So+7vw/FebFN2vEFCsFP6g==
   ```

## Running the Server

```bash
node index.js
```

The server will start on `http://localhost:3001` by default.

## API Endpoints

- `GET /` – Health check
- `GET /users` – Example endpoint to fetch users from Supabase (adjust table name as needed) 