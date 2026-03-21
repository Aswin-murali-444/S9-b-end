-- Create RPC function to update all users to inactive
-- Run this in Supabase SQL Editor, then call via MCP

CREATE OR REPLACE FUNCTION mcp_update_all_users_inactive()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count INTEGER;
    status_before JSON;
    status_after JSON;
BEGIN
    -- Get status distribution before update
    SELECT json_agg(json_build_object('status', status, 'count', count))
    INTO status_before
    FROM (
        SELECT COALESCE(status::text, 'NULL') as status, COUNT(*) as count
        FROM users
        GROUP BY status
        ORDER BY status
    ) sub;
    
    -- Update all users to inactive
    UPDATE users 
    SET status = 'inactive'::user_status_enum
    WHERE status IS NULL OR status != 'inactive'::user_status_enum;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Get status distribution after update
    SELECT json_agg(json_build_object('status', status, 'count', count))
    INTO status_after
    FROM (
        SELECT COALESCE(status::text, 'NULL') as status, COUNT(*) as count
        FROM users
        GROUP BY status
        ORDER BY status
    ) sub;
    
    RETURN json_build_object(
        'success', true,
        'updated_count', updated_count,
        'status_before', status_before,
        'status_after', status_after,
        'message', format('Successfully updated %s users to inactive status', updated_count)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM,
        'updated_count', 0
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mcp_update_all_users_inactive() TO anon, authenticated, service_role;

COMMENT ON FUNCTION mcp_update_all_users_inactive() IS 'Updates all users to inactive status and returns before/after status distribution';

