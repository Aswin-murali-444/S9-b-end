# Enhanced Team-Booking Integration Guide

## 🔗 **Complete Team-Booking Database Integration**

This guide explains how the team management system is fully integrated with the booking table, providing seamless team-based service delivery.

## 📊 **Database Schema Overview**

### Core Tables Integration

```
bookings (1) ←→ (many) team_assignments (many) ←→ (1) teams
    ↓                    ↓                           ↓
users (customers)   team_members (many) ←→ (many) users (providers)
    ↓                    ↓
service_categories ←→ teams (specialization)
services ←→ teams (specific services)
```

## 🏗️ **Enhanced Database Structure**

### 1. **Teams Table**
```sql
CREATE TABLE teams (
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
```

### 2. **Team Assignments Table (Core Integration)**
```sql
CREATE TABLE team_assignments (
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
```

### 3. **Enhanced Bookings Table Fields**
```sql
-- Additional fields added to bookings table for team integration
ALTER TABLE bookings ADD COLUMN assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN team_assigned_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN is_team_booking BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN team_size_required INTEGER DEFAULT 1;
```

## 🔄 **Automatic Integration Features**

### 1. **Automatic Booking Status Updates**
When team assignment status changes, booking status is automatically updated:

```sql
-- Trigger function that updates booking status based on team assignment
CREATE OR REPLACE FUNCTION update_booking_status_from_team_assignment()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.assignment_status
    WHEN 'confirmed' THEN
      UPDATE bookings SET booking_status = 'confirmed', provider_confirmed_at = NEW.confirmed_at
      WHERE id = NEW.booking_id;
    WHEN 'in_progress' THEN
      UPDATE bookings SET booking_status = 'in_progress', started_at = NEW.started_at
      WHERE id = NEW.booking_id;
    WHEN 'completed' THEN
      UPDATE bookings SET booking_status = 'completed', completed_at = NEW.completed_at
      WHERE id = NEW.booking_id;
    WHEN 'cancelled' THEN
      UPDATE bookings SET booking_status = 'cancelled', cancelled_at = NOW()
      WHERE id = NEW.booking_id;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2. **Automatic Team Field Population**
When a team is assigned to a booking, booking fields are automatically populated:

```sql
-- Trigger function that updates booking with team information
CREATE OR REPLACE FUNCTION update_booking_team_fields()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bookings 
  SET assigned_team_id = NEW.team_id,
      team_assigned_at = NEW.assigned_at,
      is_team_booking = TRUE,
      team_size_required = array_length(NEW.assigned_members, 1),
      assigned_provider_id = NEW.assigned_members[1], -- First member as primary
      provider_assigned_at = NEW.assigned_at
  WHERE id = NEW.booking_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## 📋 **Enhanced Views for Integration**

### 1. **Booking Team Details View**
```sql
CREATE OR REPLACE VIEW booking_team_details AS
SELECT 
  b.*,
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
```

### 2. **Team Performance Metrics View**
```sql
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
```

## 🚀 **Complete Workflow Examples**

### 1. **Team Assignment to Booking**
```javascript
// Frontend: Assign team to booking
const assignmentData = {
  booking_id: "booking-uuid",
  team_id: "team-uuid", 
  assigned_member_ids: ["member1-uuid", "member2-uuid", "member3-uuid"],
  notes: "Large commercial property requiring full team"
};

// Backend: Create team assignment
const { data: assignment } = await supabase
  .from('team_assignments')
  .insert(assignmentData)
  .select()
  .single();

// Automatic triggers will:
// 1. Update booking with team information
// 2. Set is_team_booking = true
// 3. Set team_size_required = 3
// 4. Set assigned_provider_id to first member
// 5. Set team_assigned_at timestamp
```

### 2. **Status Update Workflow**
```javascript
// Update team assignment status
const { data: updatedAssignment } = await supabase
  .from('team_assignments')
  .update({
    assignment_status: 'in_progress',
    started_at: new Date().toISOString()
  })
  .eq('id', assignmentId)
  .select()
  .single();

// Automatic trigger will:
// 1. Update booking status to 'in_progress'
// 2. Set booking started_at timestamp
// 3. Maintain data consistency
```

### 3. **Query Booking with Team Information**
```javascript
// Get booking with complete team details
const { data: bookingDetails } = await supabase
  .from('booking_team_details')
  .select('*')
  .eq('id', bookingId)
  .single();

// Returns:
// {
//   id: "booking-uuid",
//   booking_status: "in_progress",
//   team_id: "team-uuid",
//   team_name: "Pest Control Team Alpha",
//   assignment_status: "in_progress",
//   assigned_members: ["member1-uuid", "member2-uuid"],
//   team_leader_email: "leader@example.com",
//   team_leader_first_name: "John",
//   team_leader_last_name: "Smith",
//   service_category_name: "Pest Control",
//   service_name: "Commercial Pest Control",
//   // ... all other booking fields
// }
```

## 📊 **Performance Monitoring**

### 1. **Team Performance Query**
```javascript
// Get team performance metrics
const { data: teamMetrics } = await supabase
  .from('team_performance_metrics')
  .select('*')
  .eq('team_id', teamId)
  .single();

// Returns:
// {
//   team_id: "team-uuid",
//   team_name: "Pest Control Team Alpha",
//   total_assignments: 25,
//   completed_assignments: 20,
//   in_progress_assignments: 3,
//   pending_assignments: 2,
//   cancelled_assignments: 0,
//   completion_rate: 80.0,
//   avg_completion_hours: 4.5,
//   team_member_count: 4,
//   active_member_count: 4
// }
```

### 2. **Booking Analytics with Team Data**
```sql
-- Query to get booking analytics with team information
SELECT 
  DATE_TRUNC('month', b.created_at) as month,
  COUNT(*) as total_bookings,
  COUNT(CASE WHEN b.is_team_booking THEN 1 END) as team_bookings,
  COUNT(CASE WHEN NOT b.is_team_booking THEN 1 END) as individual_bookings,
  AVG(CASE WHEN b.is_team_booking THEN b.team_size_required END) as avg_team_size,
  AVG(CASE WHEN ta.assignment_status = 'completed' 
    THEN EXTRACT(EPOCH FROM (ta.completed_at - ta.assigned_at))/3600 
  END) as avg_completion_hours
FROM bookings b
LEFT JOIN team_assignments ta ON b.id = ta.booking_id
GROUP BY DATE_TRUNC('month', b.created_at)
ORDER BY month DESC;
```

## 🔧 **API Integration Examples**

### 1. **Assign Team to Booking**
```javascript
// POST /api/team-bookings/assign
const assignTeamToBooking = async (req, res) => {
  const { booking_id, team_id, assigned_member_ids, notes } = req.body;
  
  // Validate booking exists
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, service_id, category_id, booking_status')
    .eq('id', booking_id)
    .single();
    
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  
  // Create team assignment
  const { data: assignment } = await supabase
    .from('team_assignments')
    .insert({
      booking_id,
      team_id,
      assigned_members: assigned_member_ids,
      assignment_status: 'pending',
      notes
    })
    .select()
    .single();
    
  // Automatic triggers handle the rest!
  return res.json({ assignment });
};
```

### 2. **Get Booking with Team Details**
```javascript
// GET /api/bookings/:id/team-details
const getBookingTeamDetails = async (req, res) => {
  const { id } = req.params;
  
  const { data: bookingDetails } = await supabase
    .from('booking_team_details')
    .select('*')
    .eq('id', id)
    .single();
    
  return res.json({ booking: bookingDetails });
};
```

### 3. **Update Team Assignment Status**
```javascript
// PUT /api/team-bookings/assignment/:id/status
const updateTeamAssignmentStatus = async (req, res) => {
  const { id } = req.params;
  const { assignment_status, notes } = req.body;
  
  const updateData = { assignment_status };
  
  // Set appropriate timestamp based on status
  switch (assignment_status) {
    case 'confirmed':
      updateData.confirmed_at = new Date().toISOString();
      break;
    case 'in_progress':
      updateData.started_at = new Date().toISOString();
      break;
    case 'completed':
      updateData.completed_at = new Date().toISOString();
      break;
  }
  
  const { data: assignment } = await supabase
    .from('team_assignments')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
    
  // Automatic trigger updates booking status!
  return res.json({ assignment });
};
```

## 🔒 **Data Integrity & Validation**

### 1. **Team Member Validation**
```sql
-- Function ensures all assigned members are active team members
CREATE OR REPLACE FUNCTION validate_team_assignment_members()
RETURNS TRIGGER AS $$
BEGIN
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
```

### 2. **Cascade Deletion**
- When a booking is deleted, all team assignments are automatically deleted
- When a team is deleted, all team assignments are automatically deleted
- When a user is deleted, their team memberships and assignments are handled appropriately

## 📈 **Benefits of Enhanced Integration**

### 1. **Automatic Data Consistency**
- Booking status automatically updates when team assignment status changes
- Team information is automatically populated in booking records
- No manual synchronization required

### 2. **Rich Querying Capabilities**
- Single query to get booking with complete team information
- Performance metrics readily available
- Easy filtering by team vs individual bookings

### 3. **Simplified API Development**
- Automatic triggers handle complex updates
- Views provide pre-joined data
- Reduced API complexity

### 4. **Better Analytics**
- Team performance tracking
- Booking completion rates by team
- Resource utilization metrics

## 🎯 **Use Cases**

### 1. **Pest Control Team**
```javascript
// Large commercial property requires team
const pestControlAssignment = {
  booking_id: "commercial-pest-booking",
  team_id: "pest-control-team-alpha",
  assigned_member_ids: ["technician1", "technician2", "supervisor1"],
  notes: "Large warehouse - requires full team with specialized equipment"
};
```

### 2. **Cleaning Crew**
```javascript
// Office building cleaning requires multiple cleaners
const cleaningAssignment = {
  booking_id: "office-cleaning-booking",
  team_id: "office-cleaning-crew",
  assigned_member_ids: ["cleaner1", "cleaner2", "cleaner3", "team-leader"],
  notes: "5-story office building - full team required"
};
```

### 3. **Maintenance Team**
```javascript
// Complex maintenance task requiring specialists
const maintenanceAssignment = {
  booking_id: "facility-maintenance-booking",
  team_id: "facility-maintenance-team",
  assigned_member_ids: ["electrician", "plumber", "general-maintenance"],
  notes: "Multi-system maintenance - electrical, plumbing, and general"
};
```

## ✅ **Implementation Checklist**

- [x] Enhanced team-booking integration schema
- [x] Automatic booking status updates from team assignments
- [x] Automatic team field population in bookings
- [x] Enhanced views for integrated data
- [x] Performance metrics views
- [x] Data validation and integrity constraints
- [x] Cascade deletion handling
- [x] API integration examples
- [x] Complete workflow documentation

## 🎉 **Ready for Production**

The enhanced team-booking integration provides:

- **Seamless Integration**: Teams and bookings work together automatically
- **Data Consistency**: Automatic synchronization between related tables
- **Rich Analytics**: Performance metrics and detailed reporting
- **Simplified Development**: Pre-built views and automatic triggers
- **Scalable Architecture**: Handles both individual and team-based services

The system now supports complete team-based service delivery with automatic booking management, performance tracking, and seamless integration with your existing service provider system!
