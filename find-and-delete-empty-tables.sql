-- Script to find and delete empty/unused tables
-- Run this in Supabase SQL Editor
-- This will identify tables with 0 rows that might be safe to delete

-- Step 1: List all tables in the public schema with their row counts
SELECT 
    schemaname,
    tablename,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t.tablename) as column_count,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

-- Step 2: Check which tables are empty (0 rows)
-- Uncomment the DROP TABLE statements below AFTER reviewing which tables are empty

-- WARNING: Only delete tables that you're sure are unused!
-- Always backup your database before running DROP statements!

-- Common tables to check (uncomment DROP statements for tables you want to delete):
-- Empty test tables or unused duplicates:

-- Example (uncomment if you want to delete):
-- DROP TABLE IF EXISTS test_table_name CASCADE;

-- Step 3: Find empty tables automatically (safer approach)
DO $$
DECLARE
    r RECORD;
    row_count BIGINT;
    table_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename NOT IN (
            -- List of tables you want to KEEP (core application tables)
            'users', 'user_profiles', 'customer_details', 
            'service_provider_details', 'caretaker_details', 'driver_details',
            'services', 'service_categories', 'bookings',
            'teams', 'team_members', 'team_assignments',
            'user_cart', 'user_wishlist',
            'notifications'
        )
    LOOP
        -- Count rows in the table
        EXECUTE format('SELECT COUNT(*) FROM %I', r.tablename) INTO row_count;
        
        -- If table is empty (0 rows), add to list
        IF row_count = 0 THEN
            table_list := array_append(table_list, r.tablename);
            RAISE NOTICE 'Empty table found: %', r.tablename;
        END IF;
    END LOOP;
    
    -- Show all empty tables found
    IF array_length(table_list, 1) > 0 THEN
        RAISE NOTICE '=== Empty tables that can be deleted ===';
        FOREACH r.tablename IN ARRAY table_list
        LOOP
            RAISE NOTICE 'DROP TABLE IF EXISTS % CASCADE;', r.tablename;
        END LOOP;
    ELSE
        RAISE NOTICE 'No empty unused tables found.';
    END IF;
END $$;

-- Step 4: Manual deletion (copy commands from Step 3 output and review before running)
-- Example deletion commands (NEVER run without checking first!):
-- DROP TABLE IF EXISTS old_provider_profiles CASCADE;
-- DROP TABLE IF EXISTS test_bookings CASCADE;
-- DROP TABLE IF EXISTS duplicate_table_name CASCADE;

