# Test SQL Execution from Cursor

## Steps to Test:

**1. Make sure the RPC function exists:**
   - Run `S9-b-end/mcp-execute-any-sql.sql` in Supabase SQL Editor (if not already done)

**2. Restart Cursor** (to ensure MCP server is loaded)

**3. Execute this SQL from Cursor chat:**

Say: *"Execute this SQL: CREATE TABLE IF NOT EXISTS mcp_test_table (id SERIAL PRIMARY KEY, test_name VARCHAR(100), created_at TIMESTAMPTZ DEFAULT NOW(), test_status VARCHAR(20) DEFAULT 'active');"*

**4. Verify it worked:**

Say: *"Execute this SQL: SELECT * FROM mcp_test_table;"*

If you see the table and data, SQL execution from Cursor is working! ✓

## Expected Result:

When you execute the SELECT query, you should see:
- A table with columns: id, test_name, created_at, test_status
- At least one row if the INSERT also ran

If it doesn't work, check:
- Is the `mcp_execute_sql` function created in Supabase?
- Did you restart Cursor after creating the function?
- Check MCP server logs in Cursor for error messages

