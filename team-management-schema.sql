-- Team Management Database Schema
-- This extends the current service provider system to support teams

-- 0. Create ENUM types for dropdown status fields
-- Team-specific ENUMs
CREATE TYPE team_status_enum AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE team_member_role_enum AS ENUM ('leader', 'supervisor', 'member', 'trainee');
CREATE TYPE team_member_status_enum AS ENUM ('active', 'inactive', 'on_leave');
CREATE TYPE team_assignment_status_enum AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');

-- Existing system ENUMs (create only if they don't exist)
DO $$
BEGIN
  -- Create user_status_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status_enum') THEN
    CREATE TYPE user_status_enum AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
  END IF;
  
  -- Create user_role_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'customer', 'service_provider', 'supervisor', 'driver');
  END IF;
  
  -- Create service_provider_status_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_provider_status_enum') THEN
    CREATE TYPE service_provider_status_enum AS ENUM ('active', 'suspended', 'pending_verification', 'inactive');
  END IF;
  
  -- Create service_category_status_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_category_status_enum') THEN
    CREATE TYPE service_category_status_enum AS ENUM ('active', 'inactive', 'suspended');
  END IF;
  
  -- Create service_status_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_status_enum') THEN
    CREATE TYPE service_status_enum AS ENUM ('active', 'inactive', 'suspended');
  END IF;
END $$;

-- 1. Create teams table with proper foreign key constraints
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  team_leader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  status team_status_enum DEFAULT 'active',
  max_members INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create team_members table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role team_member_role_enum DEFAULT 'member',
  status team_member_status_enum DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id) -- Prevent duplicate memberships
);

-- 3. Create team_assignments table for booking assignments
CREATE TABLE IF NOT EXISTS team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assigned_members UUID[] NOT NULL, -- Array of user IDs assigned to this booking
  assignment_status team_assignment_status_enum DEFAULT 'pending',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_teams_category ON teams(service_category_id);
CREATE INDEX IF NOT EXISTS idx_teams_service ON teams(service_id);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);

CREATE INDEX IF NOT EXISTS idx_team_assignments_booking ON team_assignments(booking_id);
CREATE INDEX IF NOT EXISTS idx_team_assignments_team ON team_assignments(team_id);
CREATE INDEX IF NOT EXISTS idx_team_assignments_status ON team_assignments(assignment_status);

-- 5. Add updated_at trigger for teams table
CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teams_updated_at ON teams;
CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_teams_updated_at();

-- 6. Add validation and auto-member functions
CREATE OR REPLACE FUNCTION validate_team_leader()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that team leader is a service provider
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = NEW.team_leader_id 
    AND users.role = 'service_provider'
  ) THEN
    RAISE EXCEPTION 'Team leader must be a service provider. User ID % is not a service provider.', NEW.team_leader_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_team_leader_is_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if team leader exists in team_members
  IF NOT EXISTS (
    SELECT 1 FROM team_members 
    WHERE team_id = NEW.id AND user_id = NEW.team_leader_id
  ) THEN
    -- Auto-add team leader as a member with 'leader' role
    INSERT INTO team_members (team_id, user_id, role, status)
    VALUES (NEW.id, NEW.team_leader_id, 'leader', 'active');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_team_leader ON teams;
CREATE TRIGGER trg_validate_team_leader
  BEFORE INSERT OR UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION validate_team_leader();

DROP TRIGGER IF EXISTS trg_ensure_team_leader_is_member ON teams;
CREATE TRIGGER trg_ensure_team_leader_is_member
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION ensure_team_leader_is_member();

-- 7. Add RLS policies (optional - uncomment if needed)
-- ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE team_assignments ENABLE ROW LEVEL SECURITY;

-- Example policies:
-- CREATE POLICY "Team leaders can manage their teams" ON teams
--   FOR ALL USING (team_leader_id = auth.uid());

-- CREATE POLICY "Team members can view their teams" ON team_members
--   FOR SELECT USING (user_id = auth.uid());

-- CREATE POLICY "Admins have full access" ON teams
--   FOR ALL USING (EXISTS (
--     SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
--   ));

-- 8. Sample data for testing (optional)
-- INSERT INTO teams (name, description, team_leader_id, service_category_id, max_members) 
-- VALUES ('Pest Control Team Alpha', 'Specialized pest control team for residential and commercial properties', 
--         (SELECT id FROM users WHERE role = 'service_provider' LIMIT 1),
--         (SELECT id FROM service_categories WHERE name ILIKE '%pest%' LIMIT 1), 5);

COMMENT ON TABLE teams IS 'Stores team information for team-based service providers';
COMMENT ON TABLE team_members IS 'Many-to-many relationship between teams and users';
COMMENT ON TABLE team_assignments IS 'Tracks which team members are assigned to specific bookings';

-- Done ✅
