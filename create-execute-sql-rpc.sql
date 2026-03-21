-- Create a function to execute SQL via REST API (works without direct DB connection)
-- Run this in Supabase SQL Editor FIRST

CREATE OR REPLACE FUNCTION mcp_execute_sql(
  p_sql TEXT,
  p_read_only BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_rows JSON[];
  v_row_count INTEGER;
BEGIN
  -- Safety check: if read_only, only allow SELECT
  IF p_read_only AND UPPER(TRIM(p_sql)) NOT LIKE 'SELECT%' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Only SELECT queries allowed when read_only=true'
    );
  END IF;
  
  -- Execute the SQL
  EXECUTE p_sql;
  
  -- Get affected rows (for non-SELECT queries)
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  
  -- For SELECT queries, we'd need to return results differently
  -- This simple version returns success
  RETURN json_build_object(
    'success', true,
    'rowCount', v_row_count,
    'message', format('SQL executed successfully, %s rows affected', v_row_count)
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

-- Function specifically for UPDATE queries
CREATE OR REPLACE FUNCTION mcp_update_users_by_email(
  p_email TEXT,
  p_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE users 
  SET status = p_status::user_status_enum
  WHERE email = p_email;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'email', p_email,
    'new_status', p_status
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mcp_execute_sql(TEXT, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mcp_update_users_by_email(TEXT, TEXT) TO anon, authenticated, service_role;


