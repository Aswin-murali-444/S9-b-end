# User Table Setup Guide

This guide explains how to set up and use the new user table system that handles different user roles: Customer, Service Provider, Caretaker, and Driver.

## Database Schema Overview

The system uses a normalized database design with the following tables:

### Core Tables
- **`users`** - Main user table with authentication and role information
- **`user_profiles`** - Extended user profile information
- **`customer_details`** - Customer-specific information
- **`service_provider_details`** - Service provider-specific information
- **`caretaker_details`** - Caretaker-specific information
- **`driver_details`** - Driver-specific information

## Setup Instructions

### 1. Database Setup

Run the SQL commands in `database-schema.sql` in your Supabase database:

```bash
# Connect to your Supabase database and run:
psql -h your-supabase-host -U postgres -d postgres -f database-schema.sql
```

Or copy and paste the SQL commands directly into your Supabase SQL editor.

### 2. Environment Variables

Make sure your `.env` file contains:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
PORT=3001
```

### 3. Install Dependencies

```bash
cd b-end
npm install
```

## API Endpoints

### Authentication
- `POST /register` - Register new user with role
- `POST /login` - User login
- `GET /profile/:userId` - Get user profile with role details

### User Management
- `PUT /profile/:userId` - Update user profile
- `PUT /profile/:userId/role-details` - Update role-specific details
- `GET /users/role/:role` - Get users by role
- `PUT /users/:userId/status` - Update user status
- `PUT /users/:userId/verify-email` - Verify user email

### Dashboard Routing
- `GET /dashboard-route/:userId` - Get dashboard route for user
- `GET /users/stats` - Get user statistics

## User Roles and Dashboards

### 1. Customer (`/dashboard/customer`)
- Book services
- Manage appointments
- Track service requests
- View service history

### 2. Service Provider (`/dashboard/provider`)
- Manage service requests
- Update availability
- Track earnings
- Manage business profile

### 3. Caretaker (`/dashboard/caretaker`)
- View care assignments
- Update schedules
- Manage client information
- Track care hours

### 4. Driver (`/dashboard/driver`)
- Accept ride requests
- Navigate routes
- Track trips
- Manage vehicle information

## Usage Examples

### Register a New User

```javascript
const response = await fetch('/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    role: 'customer',
    first_name: 'John',
    last_name: 'Doe',
    phone: '+1234567890'
  })
});
```

### Login and Get Dashboard Route

```javascript
const response = await fetch('/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});

const { user, dashboardRoute } = await response.json();
// dashboardRoute will be '/dashboard/customer' for customers
```

### Update Role-Specific Details

```javascript
// Update customer details
const response = await fetch(`/profile/${userId}/role-details`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    role: 'customer',
    details: {
      preferred_services: ['cleaning', 'cooking'],
      emergency_contact_name: 'Jane Doe',
      emergency_contact_phone: '+1234567890'
    }
  })
});
```

## Frontend Integration

### DashboardRouter Component

The `DashboardRouter` component automatically routes users to appropriate dashboards based on their role:

```jsx
import DashboardRouter from './components/DashboardRouter';

function App() {
  return (
    <DashboardRouter 
      user={currentUser} 
      onDashboardLoad={(route) => console.log('Dashboard route:', route)} 
    />
  );
}
```

### Role-Based Navigation

```jsx
const getDashboardRoute = (role) => {
  const routes = {
    customer: '/dashboard/customer',
    service_provider: '/dashboard/provider',
    caretaker: '/dashboard/caretaker',
    driver: '/dashboard/driver'
  };
  
  return routes[role] || '/dashboard';
};
```

## Security Considerations

1. **Password Hashing**: In production, use bcrypt for password hashing
2. **Input Validation**: Always validate user input on both frontend and backend
3. **Role-Based Access Control**: Implement proper authorization checks
4. **SQL Injection**: Use parameterized queries (already implemented with Supabase)
5. **Rate Limiting**: Implement rate limiting for authentication endpoints

## Testing

### Sample Data

The schema includes sample data for testing:

- Customer: `customer@example.com`
- Service Provider: `provider@example.com`
- Caretaker: `caretaker@example.com`
- Driver: `driver@example.com`

All sample users have the password: `password123`

### Test Endpoints

```bash
# Test registration
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","role":"customer","first_name":"Test","last_name":"User"}'

# Test login
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Test getting users by role
curl http://localhost:3001/users/role/customer
```

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure Supabase credentials are correct
2. **Table Not Found**: Run the database schema SQL commands
3. **Role Validation**: Check that roles match exactly: `customer`, `service_provider`, `caretaker`, `driver`
4. **CORS Issues**: Ensure CORS is properly configured for your frontend domain

### Logs

Check the server console for detailed error messages and database connection status.

## Next Steps

1. Implement the actual dashboard pages for each role
2. Add more role-specific fields as needed
3. Implement user permissions and access control
4. Add email verification workflow
5. Implement password reset functionality
6. Add user activity logging
7. Implement user search and filtering

## Support

For issues or questions, check the server logs and ensure all dependencies are properly installed.
