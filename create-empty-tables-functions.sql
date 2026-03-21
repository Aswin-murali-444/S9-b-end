-- Functions to find and delete empty tables via RPC
-- Run this FIRST in Supabase SQL Editor

-- Function 1: List all empty tables
CREATE OR REPLACE FUNCTION mcp_list_empty_tables()
RETURNS TABLE (
    table_name TEXT,
    row_count BIGINT,
    table_size TEXT,
    drop_command TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    table_record RECORD;
    row_count BIGINT;
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
                RETURN QUERY SELECT
                    table_record.tablename::TEXT,
                    row_count,
                    pg_size_pretty(pg_total_relation_size('public.' || table_record.tablename))::TEXT,
                    format('DROP TABLE IF EXISTS public.%I CASCADE;', table_record.tablename)::TEXT;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Skip tables that can't be queried
            CONTINUE;
        END;
    END LOOP;
END;
$$;

-- Function 2: Delete empty tables (returns list of deleted tables)
CREATE OR REPLACE FUNCTION mcp_delete_empty_tables()
RETURNS TABLE (
    deleted_table TEXT,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    table_record RECORD;
    row_count BIGINT;
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
                    RETURN QUERY SELECT
                        table_record.tablename::TEXT,
                        TRUE,
                        'Successfully deleted'::TEXT;
                EXCEPTION WHEN OTHERS THEN
                    RETURN QUERY SELECT
                        table_record.tablename::TEXT,
                        FALSE,
                        SQLERRM::TEXT;
                END;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;
    END LOOP;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mcp_list_empty_tables() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION mcp_delete_empty_tables() TO anon, authenticated, service_role;

COMMENT ON FUNCTION mcp_list_empty_tables() IS 'Lists all empty tables that can be safely deleted';
COMMENT ON FUNCTION mcp_delete_empty_tables() IS 'Deletes all empty tables (excludes core application tables)';

