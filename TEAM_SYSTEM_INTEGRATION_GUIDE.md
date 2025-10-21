# Team System Integration Guide

## 🔗 **Complete Integration with Service Categories, Services, and Users**

This guide explains how the team management system is fully integrated with your existing database tables and how team leaders get proper credentials.

## 📊 **Database Connections**

### 1. **Teams Table Connections**

The `teams` table is connected to:

- **`users`** table via `team_leader_id` (team leader must be a service provider)
- **`service_categories`** table via `service_category_id` (team specialization)
- **`services`** table via `service_id` (specific service the team provides)

```sql
-- Teams table structure with foreign keys
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  team_leader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active',
  max_members INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. **Team Members Table Connections**

The `team_members` table connects:
- **`teams`** table via `team_id`
- **`users`** table via `user_id` (each member must be a service provider)

```sql
-- Team members table structure
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  status VARCHAR(20) DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
```

### 3. **Team Assignments Table Connections**

The `team_assignments` table connects:
- **`bookings`** table via `booking_id`
- **`teams`** table via `team_id`
- **`users`** table via `assigned_members` array (user IDs)

```sql
-- Team assignments table structure
CREATE TABLE team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assigned_members UUID[] NOT NULL,
  assignment_status VARCHAR(20) DEFAULT 'pending',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  -- ... other fields
);
```

## 👥 **Team Leader Credentials System**

### How Team Leaders Get Credentials

1. **Account Creation Process:**
   ```
   Admin creates team → System creates team leader account → Credentials sent via email
   ```

2. **Team Leader Account Details:**
   - **Email**: Provided during team creation
   - **Password**: Auto-generated secure password
   - **Role**: `service_provider`
   - **Status**: `active` or `pending_verification`
   - **Specialization**: Based on selected service
   - **Service Assignment**: Linked to team's service category/service

3. **Credential Email:**
   - Contains login credentials
   - Team leader role information
   - Access instructions
   - Team management capabilities

### Team Member Credentials

Each team member also gets:
- Individual service provider accounts
- Email credentials
- Access to team assignments
- Individual specialization tracking

## 🚀 **Complete Workflow**

### 1. **Team Creation Process**

```javascript
// Frontend sends team creation request
const teamPayload = {
  name: "Pest Control Team Alpha",
  description: "Specialized pest control team",
  team_leader_data: {
    full_name: "John Smith",
    email: "john@example.com",
    phone: "+91 98765 43210",
    specialization: "Pest Control",
    service_category_id: "pest-control-category-id",
    service_id: "pest-control-service-id",
    status: "active",
    sendEmail: true
  },
  service_category_id: "pest-control-category-id",
  service_id: "pest-control-service-id",
  max_members: 5,
  team_members_data: [
    // Array of team member data objects
  ]
};

// Backend creates:
// 1. Team leader account (with credentials)
// 2. Team member accounts (with credentials)
// 3. Team record
// 4. Team member relationships
```

### 2. **Service Category Integration**

Teams are linked to service categories:

```sql
-- Example: Pest Control Team
INSERT INTO teams (
  name, 
  team_leader_id, 
  service_category_id, 
  service_id
) VALUES (
  'Pest Control Team Alpha',
  'leader-user-id',
  'pest-control-category-id',
  'pest-control-service-id'
);
```

### 3. **Booking Assignment Process**

```javascript
// Assign team to booking
const assignmentData = {
  booking_id: "booking-uuid",
  team_id: "team-uuid",
  assigned_member_ids: ["member1-uuid", "member2-uuid"],
  notes: "Large commercial property - requires full team"
};

// System creates team assignment record
// Updates booking with team information
// Notifies team members
```

## 🔧 **API Endpoints**

### Team Management
- `POST /teams` - Create team with leader and members
- `GET /teams` - List all teams with filters
- `GET /teams/:id` - Get team details
- `PUT /teams/:id` - Update team information
- `DELETE /teams/:id` - Delete team

### Team Bookings
- `POST /team-bookings/assign` - Assign team to booking
- `GET /team-bookings/booking/:bookingId` - Get booking team assignments
- `PUT /team-bookings/assignment/:assignmentId/status` - Update assignment status
- `GET /team-bookings/available` - Get available teams for service
- `GET /team-bookings/stats/:teamId` - Get team performance stats

## 📋 **Setup Instructions**

### 1. **Database Setup**

Run the team management schema:

```sql
-- Execute team-management-schema.sql in your Supabase SQL editor
-- This creates all necessary tables and relationships
```

### 2. **Backend Setup**

The backend is already configured with:
- Team management routes (`/teams`)
- Team booking routes (`/team-bookings`)
- Integration with existing service provider system
- Automatic credential generation and email sending

### 3. **Frontend Setup**

The frontend includes:
- Enhanced AddServiceProviderPage with team creation
- Team management interface
- Team member selection with visual feedback
- Integration with existing service categories and services

## 🎯 **Use Case Examples**

### Example 1: Pest Control Team

```javascript
// Create pest control team
const pestControlTeam = {
  name: "Pest Control Team Alpha",
  description: "Specialized in commercial pest control",
  team_leader_data: {
    full_name: "Rajesh Kumar",
    email: "rajesh@pestcontrol.com",
    phone: "+91 98765 43210",
    specialization: "Commercial Pest Control",
    service_category_id: "pest-control-category-id",
    service_id: "pest-control-service-id"
  },
  service_category_id: "pest-control-category-id",
  service_id: "pest-control-service-id",
  max_members: 4,
  team_members_data: [
    {
      full_name: "Suresh Patel",
      email: "suresh@pestcontrol.com",
      phone: "+91 98765 43211",
      specialization: "Pest Control Technician",
      role: "member"
    },
    // ... more members
  ]
};
```

### Example 2: Cleaning Team

```javascript
// Create cleaning team
const cleaningTeam = {
  name: "Office Cleaning Crew",
  description: "Professional office cleaning services",
  team_leader_data: {
    full_name: "Priya Sharma",
    email: "priya@cleaning.com",
    phone: "+91 98765 43212",
    specialization: "Office Cleaning",
    service_category_id: "cleaning-category-id",
    service_id: "office-cleaning-service-id"
  },
  service_category_id: "cleaning-category-id",
  service_id: "office-cleaning-service-id",
  max_members: 6
};
```

## 🔒 **Security & Data Integrity**

### Constraints & Validations

1. **Team Leader Validation:**
   - Must be a service provider
   - Cannot be removed from team
   - Gets automatic credentials

2. **Team Member Validation:**
   - Must be service providers
   - Cannot exceed team capacity
   - Individual credentials for each member

3. **Service Integration:**
   - Teams linked to specific services
   - Category-based filtering
   - Service-specific assignments

### Data Relationships

```
service_categories (1) ←→ (many) teams
services (1) ←→ (many) teams
users (1) ←→ (many) teams (as leader)
users (many) ←→ (many) teams (as members)
bookings (1) ←→ (many) team_assignments
teams (1) ←→ (many) team_assignments
```

## 📊 **Monitoring & Analytics**

### Team Performance Metrics

- Assignment completion rates
- Team member availability
- Service category performance
- Customer satisfaction scores

### Available Statistics

```javascript
// Get team performance stats
const stats = await apiService.getTeamAssignmentStats(teamId, '30'); // 30 days

// Returns:
{
  team_id: "team-uuid",
  period_days: 30,
  total_assignments: 25,
  status_breakdown: {
    completed: 20,
    in_progress: 3,
    pending: 2
  },
  completion_rate: 80.0
}
```

## 🚨 **Troubleshooting**

### Common Issues

1. **Team Creation Fails:**
   - Check if service category exists
   - Verify service exists
   - Ensure email addresses are unique

2. **Member Addition Fails:**
   - Check team capacity limits
   - Verify user is service provider
   - Ensure user not already in team

3. **Booking Assignment Fails:**
   - Check team availability
   - Verify team status is active
   - Ensure members are active

### Debug Queries

```sql
-- Check team connections
SELECT 
  t.name as team_name,
  sc.name as category_name,
  s.name as service_name,
  u.email as leader_email
FROM teams t
LEFT JOIN service_categories sc ON t.service_category_id = sc.id
LEFT JOIN services s ON t.service_id = s.id
LEFT JOIN users u ON t.team_leader_id = u.id;

-- Check team members
SELECT 
  t.name as team_name,
  u.email as member_email,
  tm.role,
  tm.status
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
JOIN users u ON tm.user_id = u.id;
```

## ✅ **Implementation Checklist**

- [x] Database schema created with proper foreign keys
- [x] Teams table connected to users, service_categories, services
- [x] Team leader credential system implemented
- [x] Team member account creation with credentials
- [x] Backend APIs for team management
- [x] Team booking assignment system
- [x] Frontend team creation interface
- [x] Service category and service integration
- [x] Email credential system for team leaders and members
- [x] Team management interface for admins
- [x] Booking assignment and tracking system

## 🎉 **Ready for Production**

The team management system is now fully integrated with your existing service categories, services, and users tables. Team leaders and members get proper credentials, and the system supports complete team-based service delivery workflows.

**Key Features:**
- ✅ Full database integration
- ✅ Team leader credentials
- ✅ Service category connections
- ✅ Team member management
- ✅ Booking assignments
- ✅ Performance tracking
- ✅ Email notifications

The system is ready for creating teams for pesticide services, cleaning crews, maintenance teams, or any other group-based services!
