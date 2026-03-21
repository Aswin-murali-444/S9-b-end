# Run SQL in Supabase Without the SQL Editor

Tables (and other SQL) can be created **automatically** from your machine—no pasting in the Supabase SQL Editor.

## One-time setup

1. **Create the RPC in Supabase (once)**  
   In Supabase Dashboard → SQL Editor, run the contents of `mcp-execute-any-sql.sql` so the `mcp_execute_sql` function exists.

2. **Set admin secret**  
   In `S9-b-end/.env` add:
   ```env
   ADMIN_SECRET_KEY=your-secret-here
   ```
   Use any long random string (e.g. `openssl rand -hex 24`).

3. **Start the backend**  
   From `S9-b-end`: `npm run dev` (or `npm start`).

## Create tables (automated)

From `S9-b-end`:

```bash
# Create the test table (uses create-test-table-manual.sql)
npm run create-test-table
```

Or run any `.sql` file:

```bash
npm run run-sql -- path/to/your-schema.sql
node scripts/run-sql.js path/to/your-schema.sql
```

Or run inline SQL:

```bash
node scripts/run-sql.js --inline "CREATE TABLE IF NOT EXISTS public.my_table (id SERIAL PRIMARY KEY, name TEXT);"
```

The script calls `POST /admin/execute-sql` on your backend, which runs the SQL via the `mcp_execute_sql` RPC in Supabase—no SQL Editor needed.
