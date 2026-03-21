-- Simple function to just LIST empty tables (no deletion)
-- Run this in Supabase SQL Editor FIRST

CREATE OR REPLACE FUNCTION mcp_find_empty_tables()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    table_record RECORD;
    row_count BIGINT;
    empty_tables JSON[] := ARRAY[]::JSON[];
    core_tables TEXT[] := ARRAY[
        'users', 'user_profiles', 'customer_details', 
        'service_provider_details', 'caretaker_details', 'driver_details',
        'services', 'service_categories', 'bookings',
        'teams', 'team_members', 'team_assignments',
        'user_cart', 'user_wishlist', 'notifications'
    ];
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename != ALL(core_tables)
        ORDER BY tablename
    LOOP
        BEGIN
            EXECUTE format('SELECT COUNT(*) FROM public.%I', table_record.tablename) INTO row_count;
            
            IF row_count = 0 THEN
                empty_tables := array_append(empty_tables, json_build_object(
                    'table_name', table_record.tablename,
                    'row_count', row_count,
                    'drop_command', format('DROP TABLE IF EXISTS public.%I CASCADE;', table_record.tablename)
                ));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;
    END LOOP;
    
    RETURN json_build_object('empty_tables', empty_tables, 'count', array_length(empty_tables, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION mcp_find_empty_tables() TO anon, authenticated, service_role;

