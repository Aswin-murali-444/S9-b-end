-- Simple function to update user status by email (works via REST API/RPC)
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION update_user_status_by_email(
  user_email TEXT,
  new_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
  v_user_record RECORD;
BEGIN
  -- Update the user
  UPDATE users 
  SET status = new_status::user_status_enum
  WHERE email = user_email;
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- Get updated user info
  SELECT id, email, status INTO v_user_record
  FROM users 
  WHERE email = user_email;
  
  IF v_updated_count = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', format('User with email %s not found', user_email),
      'updated_count', 0
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'user', json_build_object(
      'id', v_user_record.id,
      'email', v_user_record.email,
      'status', v_user_record.status
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'updated_count', 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION update_user_status_by_email(TEXT, TEXT) TO anon, authenticated, service_role;


