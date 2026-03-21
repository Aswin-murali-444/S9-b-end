-- ========================================================
-- FIND AND DELETE EMPTY/UNUSED TABLES
-- ========================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- It will show you which tables are empty and ask for confirmation before deleting

DO $$
DECLARE
    table_record RECORD;
    row_count BIGINT;
    empty_table_count INT := 0;
    tables_to_drop TEXT[] := ARRAY[]::TEXT[];
    core_tables TEXT[] := ARRAY[
        'users', 'user_profiles', 'customer_details', 
        'service_provider_details', 'caretaker_details', 'driver_details',
        'services', 'service_categories', 'bookings',
        'teams', 'team_members', 'team_assignments',
        'user_cart', 'user_wishlist', 'notifications'
    ];
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'SCANNING FOR EMPTY TABLES...';
    RAISE NOTICE '================================================';
    
    -- Loop through all tables in public schema
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        -- Skip core application tables
        IF table_record.tablename = ANY(core_tables) THEN
            CONTINUE;
        END IF;
        
        -- Try to count rows (safe even if table doesn't exist)
        BEGIN
            EXECUTE format('SELECT COUNT(*) FROM public.%I', table_record.tablename) INTO row_count;
            
            IF row_count = 0 THEN
                empty_table_count := empty_table_count + 1;
                tables_to_drop := array_append(tables_to_drop, table_record.tablename);
                RAISE NOTICE '[EMPTY] % - 0 rows', table_record.tablename;
            ELSE
                RAISE NOTICE '[HAS DATA] % - % rows', table_record.tablename, row_count;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[ERROR CHECKING] % - %', table_record.tablename, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '================================================';
    RAISE NOTICE 'SUMMARY: Found % empty tables', empty_table_count;
    RAISE NOTICE '================================================';
    
    -- Show what will be deleted
    IF array_length(tables_to_drop, 1) > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE 'The following tables are EMPTY and will be DELETED:';
        RAISE NOTICE '';
        
        FOREACH table_record.tablename IN ARRAY tables_to_drop
        LOOP
            RAISE NOTICE '  - %', table_record.tablename;
        END LOOP;
        
        RAISE NOTICE '';
        RAISE NOTICE 'To DELETE these tables, uncomment the DROP statements below';
        RAISE NOTICE 'and run them in a separate query:';
        RAISE NOTICE '';
        
        FOREACH table_record.tablename IN ARRAY tables_to_drop
        LOOP
            RAISE NOTICE 'DROP TABLE IF EXISTS public.%I CASCADE;', table_record.tablename;
        END LOOP;
        
    ELSE
        RAISE NOTICE 'No empty unused tables found!';
    END IF;
END $$;

-- ========================================================
-- COPY THE DROP COMMANDS FROM ABOVE OUTPUT AND RUN THEM HERE
-- ========================================================
-- After reviewing the output above, uncomment and run the DROP commands:

-- Example:
-- DROP TABLE IF EXISTS old_table_name CASCADE;
-- DROP TABLE IF EXISTS test_table_name CASCADE;

