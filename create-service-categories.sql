-- Service Categories schema (visual settings optional)
-- Safe to run multiple times

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure helper function exists (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table
CREATE TABLE IF NOT EXISTS service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    icon_url TEXT,            -- optional visual setting
    settings JSONB,           -- optional visual/settings blob
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index on name (case-insensitive)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' AND indexname = 'ux_service_categories_name_ci'
    ) THEN
        CREATE UNIQUE INDEX ux_service_categories_name_ci 
        ON service_categories (LOWER(name));
    END IF;
END $$;

-- Trigger for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_service_categories_updated_at') THEN
        CREATE TRIGGER update_service_categories_updated_at
        BEFORE UPDATE ON service_categories
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================
-- Category status (active | inactive | suspended) + compatibility
-- ============================================================

-- Create enum for category status if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'category_status') THEN
        CREATE TYPE category_status AS ENUM ('active', 'inactive', 'suspended');
    END IF;
END $$;

-- Ensure status column exists; keep legacy active boolean for compatibility
ALTER TABLE service_categories
    ADD COLUMN IF NOT EXISTS status category_status NOT NULL DEFAULT 'active';

ALTER TABLE service_categories
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- Index on status
CREATE INDEX IF NOT EXISTS idx_service_categories_status ON service_categories(status);

-- Keep active boolean and status in sync on INSERT/UPDATE
CREATE OR REPLACE FUNCTION sync_service_categories_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If status not provided, infer from active
    IF NEW.status IS NULL THEN
        NEW.status := CASE WHEN NEW.active IS TRUE THEN 'active' ELSE 'inactive' END;
    END IF;

    -- Ensure active reflects status
    NEW.active := (NEW.status = 'active');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_sync_service_categories_status') THEN
        CREATE TRIGGER tr_sync_service_categories_status
        BEFORE INSERT OR UPDATE ON service_categories
        FOR EACH ROW EXECUTE FUNCTION sync_service_categories_status();
    END IF;
END $$;

-- ============================================================
-- Services: connect categories to concrete service offerings
-- ============================================================

-- Create services table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    pricing_model TEXT NOT NULL CHECK (pricing_model IN ('fixed','hourly','per_km')),
    base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    duration TEXT, -- e.g., '30m', '60m', '3-4 hours'
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique name within category (case-insensitive)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' AND indexname = 'ux_services_category_name_ci'
    ) THEN
        CREATE UNIQUE INDEX ux_services_category_name_ci 
        ON services (category_id, LOWER(name));
    END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_services_category_id ON services(category_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);

-- Trigger for updated_at on services
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_services_updated_at') THEN
        CREATE TRIGGER update_services_updated_at
        BEFORE UPDATE ON services
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================
-- Service Providers linkage: connect services to provider users
-- ============================================================

CREATE TABLE IF NOT EXISTS service_providers (
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (service_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_service_providers_provider_id ON service_providers(provider_id);

-- Enforce that provider_id refers to a user with role = 'service_provider'
CREATE OR REPLACE FUNCTION ensure_provider_role()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM users WHERE id = NEW.provider_id AND role = 'service_provider'
    ) THEN
        RAISE EXCEPTION 'User % is not a service_provider', NEW.provider_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_service_providers_role') THEN
        CREATE TRIGGER tr_service_providers_role
        BEFORE INSERT OR UPDATE ON service_providers
        FOR EACH ROW EXECUTE FUNCTION ensure_provider_role();
    END IF;
END $$;


