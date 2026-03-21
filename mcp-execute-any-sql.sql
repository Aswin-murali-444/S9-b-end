-- Create function to execute SQL via RPC (works through REST API, no direct DB connection needed)
-- Run this ONCE in Supabase SQL Editor, then you can execute SQL from Cursor via MCP

CREATE OR REPLACE FUNCTION mcp_execute_sql(
  p_sql TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_row_count INTEGER;
  v_rows JSON[] := ARRAY[]::JSON[];
  rec RECORD;
BEGIN
  -- Execute the SQL using dynamic execution
  -- Note: This allows any SQL, use with caution!
  
  -- Check if it's a SELECT query
  IF UPPER(TRIM(p_sql)) LIKE 'SELECT%' THEN
    -- For SELECT queries, return results
    FOR rec IN EXECUTE p_sql
    LOOP
      v_rows := array_append(v_rows, to_json(rec));
    END LOOP;
    
    RETURN json_build_object(
      'success', true,
      'isSelect', true,
      'rows', v_rows,
      'rowCount', array_length(v_rows, 1)
    );
  ELSE
    -- For non-SELECT queries (UPDATE, DELETE, INSERT, etc.)
    EXECUTE p_sql;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    
    RETURN json_build_object(
      'success', true,
      'isSelect', false,
      'rowCount', v_row_count,
      'message', format('SQL executed successfully, %s rows affected', v_row_count)
    );
  END IF;
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE,
    'rowCount', 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mcp_execute_sql(TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION mcp_execute_sql(TEXT) IS 'Execute SQL queries via RPC - allows executing any SQL from Cursor MCP';


