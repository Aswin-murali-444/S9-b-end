# Team Management Implementation Guide

## 🎯 Overview

This guide explains how to implement team-based service providers for services like pesticide control, cleaning teams, maintenance crews, etc. The solution extends the existing individual service provider system to support group-based service delivery.

## 🏗️ Architecture

### Database Schema

The team management system uses three main tables:

1. **`teams`** - Stores team information
2. **`team_members`** - Many-to-many relationship between teams and users
3. **`team_assignments`** - Tracks team assignments to specific bookings

### Key Features

- ✅ **Team Creation**: Create teams with a designated team leader
- ✅ **Member Management**: Add/remove team members with different roles
- ✅ **Service Assignment**: Assign teams to specific services or categories
- ✅ **Booking Coordination**: Handle team-based bookings and assignments
- ✅ **Role Management**: Support for leader, supervisor, member, and trainee roles
- ✅ **Capacity Management**: Set maximum team size limits

## 📋 Setup Instructions

### 1. Database Setup

Run the team management schema:

```bash
# Navigate to backend directory
cd S9-b-end

# Run the team management schema in your Supabase SQL editor
# Copy and paste the contents of team-management-schema.sql
```

### 2. Backend Setup

The team management APIs are already integrated into the backend:

- **Routes**: `/teams` endpoints for all team operations
- **Middleware**: Team creation, member management, and assignment handling
- **Database**: Automatic triggers for data integrity

### 3. Frontend Setup

The frontend has been updated with:

- **Enhanced AddServiceProviderPage**: Supports both individual and team creation
- **Team Management UI**: Visual interface for team member selection
- **API Integration**: Complete team management API integration

## 🚀 Usage Guide

### Creating a Team

1. **Navigate to Admin Dashboard**
   - Go to "Add Service Provider"
   - Select "Team Provider" option

2. **Team Information**
   - Enter team name (e.g., "Pest Control Team Alpha")
   - Set maximum team members (2-20)
   - Add team description (optional)

3. **Team Leader Setup**
   - Fill in team leader's personal information
   - Select service category and specific service
   - Set account status (active/pending verification)

4. **Add Team Members**
   - Browse available service providers
   - Select team members from the list
   - Remove members if needed (up to capacity limit)

5. **Submit Team Creation**
   - System creates team leader account first
   - Then creates team with assigned members
   - Sends credentials to team leader via email

### Managing Teams

#### View All Teams
```javascript
// Get all teams
const teams = await apiService.getTeams();

// Filter by category
const pestControlTeams = await apiService.getTeams({
  category_id: 'pest-control-category-id'
});

// Include inactive teams
const allTeams = await apiService.getTeams({
  include_inactive: true
});
```

#### Update Team Details
```javascript
// Update team information
await apiService.updateTeam(teamId, {
  name: 'Updated Team Name',
  description: 'New description',
  max_members: 8
});
```

#### Add Team Members
```javascript
// Add a new member to team
await apiService.addTeamMember(teamId, {
  user_id: 'user-uuid',
  role: 'member' // or 'supervisor', 'trainee'
});
```

#### Remove Team Members
```javascript
// Remove member from team
await apiService.removeTeamMember(teamId, memberId);
```

## 🎯 Use Cases

### 1. Pest Control Services

**Scenario**: A pest control service requires a team of 3-4 people for large commercial properties.

**Implementation**:
- Create "Pest Control Team Alpha" with max 5 members
- Assign team leader (senior technician)
- Add team members (technicians, assistants)
- Assign to "Pest Control" service category

**Booking Flow**:
- Customer books pest control service
- System assigns entire team to booking
- Team leader coordinates with members
- All members work together on the job

### 2. Cleaning Services

**Scenario**: Office cleaning requires different specialists (floor cleaning, window cleaning, sanitization).

**Implementation**:
- Create "Office Cleaning Crew" with max 6 members
- Assign specialists for different cleaning areas
- Team leader coordinates daily schedules
- Assign to "Commercial Cleaning" service

### 3. Maintenance Teams

**Scenario**: Building maintenance requires electricians, plumbers, and general maintenance workers.

**Implementation**:
- Create "Building Maintenance Team" with max 8 members
- Include specialists for different trades
- Team leader handles work coordination
- Assign to "Building Maintenance" service category

## 🔧 API Endpoints

### Team Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/teams` | Create a new team |
| GET | `/teams` | Get all teams (with filters) |
| GET | `/teams/:id` | Get specific team details |
| PUT | `/teams/:id` | Update team information |
| DELETE | `/teams/:id` | Delete team |
| GET | `/teams/available-providers` | Get available service providers |

### Team Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/teams/:teamId/members` | Add member to team |
| DELETE | `/teams/:teamId/members/:memberId` | Remove member from team |

## 📊 Database Structure

### Teams Table
```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  team_leader_id UUID NOT NULL REFERENCES users(id),
  service_category_id UUID REFERENCES service_categories(id),
  service_id UUID REFERENCES services(id),
  status VARCHAR(20) DEFAULT 'active',
  max_members INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Team Members Table
```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'member',
  status VARCHAR(20) DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
```

### Team Assignments Table
```sql
CREATE TABLE team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  team_id UUID NOT NULL REFERENCES teams(id),
  assigned_members UUID[] NOT NULL,
  assignment_status VARCHAR(20) DEFAULT 'pending',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT
);
```

## 🎨 Frontend Components

### Enhanced AddServiceProviderPage

The updated form includes:

1. **Provider Type Selection**
   - Toggle between Individual and Team provider
   - Visual indicators for each type

2. **Team Information Section**
   - Team name and description
   - Maximum member capacity
   - Team leader information

3. **Team Member Selection**
   - Browse available service providers
   - Add/remove members with visual feedback
   - Capacity management (disable when full)

4. **Service Assignment**
   - Link team to specific service categories
   - Assign to individual services
   - Automatic pricing and specialization

### Styling Features

- **Responsive Design**: Works on mobile and desktop
- **Visual Feedback**: Hover effects, loading states, success indicators
- **Team Member Cards**: Clean, modern interface for member selection
- **Capacity Indicators**: Clear visual feedback on team limits

## 🔒 Security & Validation

### Data Validation
- Team names must be 2-100 characters
- Maximum members limited to 2-20
- Email validation for team leaders
- Duplicate member prevention

### Business Rules
- Team leaders cannot be removed from teams
- Teams with active bookings cannot be deleted
- Member capacity enforcement
- Role-based permissions

### Database Constraints
- Unique team names per category
- Foreign key constraints
- Automatic updated_at triggers
- Row-level security policies (optional)

## 📈 Future Enhancements

### Planned Features

1. **Team Scheduling**
   - Calendar integration for team availability
   - Shift management and rotation
   - Overtime tracking

2. **Performance Metrics**
   - Team completion rates
   - Customer satisfaction scores
   - Individual member ratings

3. **Advanced Assignments**
   - Skill-based member selection
   - Geographic team assignment
   - Workload balancing

4. **Communication Tools**
   - Team chat functionality
   - Job status updates
   - Photo/document sharing

### Integration Opportunities

1. **Mobile App**
   - Team member check-in/check-out
   - Real-time location tracking
   - Push notifications

2. **Analytics Dashboard**
   - Team performance metrics
   - Cost analysis
   - Efficiency reports

3. **Customer Portal**
   - Team member profiles
   - Service history
   - Rating and feedback

## 🚨 Troubleshooting

### Common Issues

1. **Team Creation Fails**
   - Check if team leader email exists
   - Verify service category/service exists
   - Ensure team name is unique

2. **Member Addition Fails**
   - Verify user is a service provider
   - Check team capacity limits
   - Ensure user not already in team

3. **API Errors**
   - Check database connection
   - Verify Supabase credentials
   - Review error logs in console

### Debug Steps

1. **Check Database**
   ```sql
   SELECT * FROM teams WHERE name = 'Your Team Name';
   SELECT * FROM team_members WHERE team_id = 'team-uuid';
   ```

2. **Verify API Endpoints**
   ```bash
   curl -X GET http://localhost:3001/teams
   curl -X GET http://localhost:3001/teams/available-providers
   ```

3. **Frontend Console**
   - Open browser developer tools
   - Check Network tab for API calls
   - Review Console for JavaScript errors

## 📞 Support

For additional help:

1. **Database Issues**: Check Supabase dashboard and logs
2. **API Problems**: Review backend console and error messages
3. **Frontend Issues**: Use browser developer tools
4. **Integration Questions**: Refer to API documentation

---

## ✅ Implementation Checklist

- [x] Database schema created
- [x] Backend APIs implemented
- [x] Frontend form updated
- [x] Team management UI created
- [x] API integration completed
- [x] CSS styling added
- [x] Validation implemented
- [x] Documentation created

**Status**: ✅ **Complete and Ready for Use**

The team management system is now fully implemented and ready for production use. You can create teams for pesticide services, cleaning crews, maintenance teams, or any other group-based services.
