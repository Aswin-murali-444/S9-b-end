-- Function to update all users to inactive status
-- Run this in Supabase SQL Editor first

CREATE OR REPLACE FUNCTION mcp_update_all_users_inactive()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE users 
    SET status = 'inactive'::user_status_enum
    WHERE status IS NULL OR status != 'inactive'::user_status_enum;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    RETURN json_build_object(
        'success', true,
        'updated_count', updated_count,
        'message', format('Successfully updated %s users to inactive status', updated_count)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mcp_update_all_users_inactive() TO anon, authenticated, service_role;

COMMENT ON FUNCTION mcp_update_all_users_inactive() IS 'Updates all users to inactive status';

