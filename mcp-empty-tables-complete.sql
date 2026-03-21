-- Complete solution: Find and Delete Empty Tables
-- Run this in Supabase SQL Editor, then I'll call it via MCP

-- Function 1: Find empty tables
CREATE OR REPLACE FUNCTION mcp_find_empty_tables()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
                    'row_count', row_count
                ));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;
    END LOOP;
    
    RETURN json_build_object('empty_tables', empty_tables, 'count', array_length(empty_tables, 1));
END;
$$;

-- Function 2: Delete empty tables
CREATE OR REPLACE FUNCTION mcp_delete_empty_tables()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    table_record RECORD;
    row_count BIGINT;
    deleted_tables TEXT[] := ARRAY[]::TEXT[];
    failed_tables JSON[] := ARRAY[]::JSON[];
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
                BEGIN
                    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', table_record.tablename);
                    deleted_tables := array_append(deleted_tables, table_record.tablename);
                EXCEPTION WHEN OTHERS THEN
                    failed_tables := array_append(failed_tables, json_build_object(
                        'table_name', table_record.tablename,
                        'error', SQLERRM
                    ));
                END;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;
    END LOOP;
    
    RETURN json_build_object(
        'deleted_tables', deleted_tables,
        'deleted_count', array_length(deleted_tables, 1),
        'failed_tables', failed_tables
    );
END;
$$;

GRANT EXECUTE ON FUNCTION mcp_find_empty_tables() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mcp_delete_empty_tables() TO anon, authenticated, service_role;

COMMENT ON FUNCTION mcp_find_empty_tables() IS 'Lists all empty tables (excludes core application tables)';
COMMENT ON FUNCTION mcp_delete_empty_tables() IS 'Deletes all empty tables (excludes core application tables) - USE WITH CAUTION!';

