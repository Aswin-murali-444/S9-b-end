-- Enhanced Team Management Database Schema
-- This extends the current service provider system to support teams with enhanced booking integration

-- 0. Create ENUM types for dropdown status fields (only if they don't exist)
-- Team-specific ENUMs
DO $$
BEGIN
  -- Create team_status_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_status_enum') THEN
    CREATE TYPE team_status_enum AS ENUM ('active', 'inactive', 'suspended');
  END IF;
  
  -- Create team_member_role_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_member_role_enum') THEN
    CREATE TYPE team_member_role_enum AS ENUM ('leader', 'supervisor', 'member', 'trainee');
  END IF;
  
  -- Create team_member_status_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_member_status_enum') THEN
    CREATE TYPE team_member_status_enum AS ENUM ('active', 'inactive', 'on_leave');
  END IF;
  
  -- Create team_assignment_status_enum if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'team_assignment_status_enum') THEN
    CREATE TYPE team_assignment_status_enum AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');
  END IF;
END $$;

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

-- 7. Enhanced booking integration functions

-- Function to automatically update booking status when team assignment changes
CREATE OR REPLACE FUNCTION update_booking_status_from_team_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Update booking status based on team assignment status
  CASE NEW.assignment_status
    WHEN 'confirmed' THEN
      UPDATE bookings 
      SET booking_status = 'confirmed', 
          provider_confirmed_at = NEW.confirmed_at
      WHERE id = NEW.booking_id;
    WHEN 'in_progress' THEN
      UPDATE bookings 
      SET booking_status = 'in_progress', 
          started_at = NEW.started_at
      WHERE id = NEW.booking_id;
    WHEN 'completed' THEN
      UPDATE bookings 
      SET booking_status = 'completed', 
          completed_at = NEW.completed_at
      WHERE id = NEW.booking_id;
    WHEN 'cancelled' THEN
      UPDATE bookings 
      SET booking_status = 'cancelled', 
          cancelled_at = NOW()
      WHERE id = NEW.booking_id;
  END CASE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update booking status
DROP TRIGGER IF EXISTS trg_update_booking_status_from_team_assignment ON team_assignments;
CREATE TRIGGER trg_update_booking_status_from_team_assignment
  AFTER UPDATE OF assignment_status ON team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_status_from_team_assignment();

-- Function to validate team assignment members are part of the team
CREATE OR REPLACE FUNCTION validate_team_assignment_members()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if all assigned members are active team members
  IF NOT EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.team_id = NEW.team_id 
    AND tm.user_id = ANY(NEW.assigned_members)
    AND tm.status = 'active'
    AND array_length(NEW.assigned_members, 1) = (
      SELECT COUNT(*) FROM team_members tm2 
      WHERE tm2.team_id = NEW.team_id 
      AND tm2.user_id = ANY(NEW.assigned_members)
      AND tm2.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'All assigned members must be active team members of the specified team';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate team assignment members
DROP TRIGGER IF EXISTS trg_validate_team_assignment_members ON team_assignments;
CREATE TRIGGER trg_validate_team_assignment_members
  BEFORE INSERT OR UPDATE ON team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION validate_team_assignment_members();

-- 8. Enhanced booking table modifications for better team integration

-- Add team-specific fields to bookings table (if they don't exist)
DO $$
BEGIN
  -- Add team assignment tracking fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'assigned_team_id') THEN
    ALTER TABLE bookings ADD COLUMN assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'team_assigned_at') THEN
    ALTER TABLE bookings ADD COLUMN team_assigned_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'is_team_booking') THEN
    ALTER TABLE bookings ADD COLUMN is_team_booking BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'team_size_required') THEN
    ALTER TABLE bookings ADD COLUMN team_size_required INTEGER DEFAULT 1;
  END IF;
END $$;

-- Create indexes for new booking fields
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_team ON bookings(assigned_team_id);
CREATE INDEX IF NOT EXISTS idx_bookings_is_team_booking ON bookings(is_team_booking);
CREATE INDEX IF NOT EXISTS idx_bookings_team_size_required ON bookings(team_size_required);

-- 9. Function to automatically set team assignment fields when team is assigned
CREATE OR REPLACE FUNCTION update_booking_team_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Update booking with team information when team assignment is created
  UPDATE bookings 
  SET assigned_team_id = NEW.team_id,
      team_assigned_at = NEW.assigned_at,
      is_team_booking = TRUE,
      team_size_required = array_length(NEW.assigned_members, 1),
      assigned_provider_id = NEW.assigned_members[1], -- Set first member as primary provider
      provider_assigned_at = NEW.assigned_at
  WHERE id = NEW.booking_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update booking team fields
DROP TRIGGER IF EXISTS trg_update_booking_team_fields ON team_assignments;
CREATE TRIGGER trg_update_booking_team_fields
  AFTER INSERT ON team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_team_fields();

-- 10. Enhanced views for better team-booking integration

-- View to get booking details with team information
CREATE OR REPLACE VIEW booking_team_details AS
SELECT 
  b.id,
  b.user_id,
  b.service_id,
  b.category_id,
  b.scheduled_date,
  b.scheduled_time,
  b.duration_minutes,
  b.service_address,
  b.service_city,
  b.service_state,
  b.service_country,
  b.service_postal_code,
  b.service_location_latitude,
  b.service_location_longitude,
  b.service_location_accuracy_m,
  b.contact_phone,
  b.contact_email,
  b.emergency_contact_name,
  b.emergency_contact_phone,
  b.special_instructions,
  b.additional_requirements,
  b.preferred_provider_notes,
  b.base_price,
  b.service_fee,
  b.tax_amount,
  b.total_amount,
  b.offer_applied,
  b.offer_discount_amount,
  b.payment_method,
  b.payment_status,
  b.payment_transaction_id,
  b.payment_gateway_response,
  b.booking_status,
  b.assigned_provider_id,
  b.provider_assigned_at,
  b.provider_confirmed_at,
  b.created_at,
  b.updated_at,
  b.confirmed_at,
  b.started_at,
  b.completed_at,
  b.cancelled_at,
  b.customer_rating,
  b.customer_feedback,
  b.provider_rating,
  b.provider_feedback,
  b.feedback_submitted_at,
  b.admin_notes,
  b.internal_status,
  b.priority_level,
  b.booking_source,
  b.ip_address,
  b.user_agent,
  b.referral_source,
  b.assigned_team_id,
  b.team_assigned_at,
  b.is_team_booking,
  b.team_size_required,
  -- Team assignment info
  t.id as team_id,
  t.name as team_name,
  t.description as team_description,
  ta.assignment_status,
  ta.assigned_members,
  ta.assigned_at as team_assignment_assigned_at,
  ta.confirmed_at as team_assignment_confirmed_at,
  ta.started_at as team_assignment_started_at,
  ta.completed_at as team_assignment_completed_at,
  ta.notes as team_assignment_notes,
  -- Team leader info
  tl.email as team_leader_email,
  tl_profile.first_name as team_leader_first_name,
  tl_profile.last_name as team_leader_last_name,
  tl_profile.phone as team_leader_phone,
  -- Service info
  sc.name as service_category_name,
  s.name as service_name
FROM bookings b
LEFT JOIN team_assignments ta ON b.id = ta.booking_id
LEFT JOIN teams t ON ta.team_id = t.id
LEFT JOIN users tl ON t.team_leader_id = tl.id
LEFT JOIN user_profiles tl_profile ON tl.id = tl_profile.id
LEFT JOIN service_categories sc ON b.category_id = sc.id
LEFT JOIN services s ON b.service_id = s.id;

-- View to get team performance metrics
CREATE OR REPLACE VIEW team_performance_metrics AS
SELECT 
  t.id as team_id,
  t.name as team_name,
  COUNT(ta.id) as total_assignments,
  COUNT(CASE WHEN ta.assignment_status = 'completed' THEN 1 END) as completed_assignments,
  COUNT(CASE WHEN ta.assignment_status = 'in_progress' THEN 1 END) as in_progress_assignments,
  COUNT(CASE WHEN ta.assignment_status = 'pending' THEN 1 END) as pending_assignments,
  COUNT(CASE WHEN ta.assignment_status = 'cancelled' THEN 1 END) as cancelled_assignments,
  ROUND(
    COUNT(CASE WHEN ta.assignment_status = 'completed' THEN 1 END) * 100.0 / 
    NULLIF(COUNT(ta.id), 0), 2
  ) as completion_rate,
  AVG(CASE 
    WHEN ta.assignment_status = 'completed' AND ta.completed_at IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (ta.completed_at - ta.assigned_at))/3600 
  END) as avg_completion_hours,
  COUNT(DISTINCT tm.user_id) as team_member_count,
  COUNT(CASE WHEN tm.status = 'active' THEN 1 END) as active_member_count
FROM teams t
LEFT JOIN team_assignments ta ON t.id = ta.team_id
LEFT JOIN team_members tm ON t.id = tm.team_id
GROUP BY t.id, t.name;

-- 11. Enhanced RLS policies (optional - uncomment if needed)
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

-- CREATE POLICY "Team members can view their assignments" ON team_assignments
--   FOR SELECT USING (assigned_members @> ARRAY[auth.uid()]);

-- 12. Sample data for testing (optional)
-- INSERT INTO teams (name, description, team_leader_id, service_category_id, max_members) 
-- VALUES ('Pest Control Team Alpha', 'Specialized pest control team for residential and commercial properties', 
--         (SELECT id FROM users WHERE role = 'service_provider' LIMIT 1),
--         (SELECT id FROM service_categories WHERE name ILIKE '%pest%' LIMIT 1), 5);

COMMENT ON TABLE teams IS 'Stores team information for team-based service providers';
COMMENT ON TABLE team_members IS 'Many-to-many relationship between teams and users';
COMMENT ON TABLE team_assignments IS 'Tracks which team members are assigned to specific bookings';
COMMENT ON VIEW booking_team_details IS 'Enhanced view showing booking details with team information';
COMMENT ON VIEW team_performance_metrics IS 'Performance metrics and statistics for teams';

-- Done ✅ Enhanced Team-Booking Integration Complete
