## Database Tables Reference

This document provides a brief overview of each table present in the database schema of this project, including their main columns and a summary. There are 18 tables in total.

---

### 1. bookings
- Stores all booking information from the booking modal including scheduling, location, payment, and status tracking.
- Key columns: id, user_id, service_id, category_id, scheduled_date, scheduled_time, duration_minutes, service_address, payment_method, payment_status, booking_status, assigned_provider_id, status, internal_status, priority_level, booking_source, and auditing columns.

### 2. service_categories
- Main categories for classifying services.
- Key columns: id, name, description, icon_url, settings, active, status, created_at, updated_at

### 3. services
- Main list of services offered, each tied to a service category.
- Key columns: id, category_id, name, description, icon_url, duration, price, offer_price, offer_percentage, offer_enabled, active, created_at, updated_at

### 4. service_provider_details
- 1:1 with users(id). Links provider to optional category/service and tracks verification status.
- Key columns: id, specialization, service_category_id, service_id, status, created_by_admin, notes, created_at, updated_at

### 5. provider_profiles
- 1:1 with service_provider_details. Stores personal/location/professional info and Aadhaar-extracted fields.
- Key columns: provider_id, first_name, last_name, phone, pincode, city, state, address, location_latitude, location_longitude, bio, qualifications, certifications, languages, profile_photo_url, aadhaar fields, created_at, updated_at

### 6. user_cart
- User’s cart for unbooked services.
- Key columns: id, user_id, service_id, quantity, added_at, updated_at

### 7. user_wishlist
- User’s wishlist for saving services.
- Key columns: id, user_id, service_id, added_at

### 8. notifications
- Notification messages to users, providers, and admins.
- Key columns: id, type, title, message, user_id, provider_id, admin_user_id, status, priority, metadata, created_at, read_at, dismissed_at

### 9. teams
- Teams for managing group assignments on bookings, with leader/member.
- Key columns: id, name, description, team_leader_id, service_category_id, service_id, status, max_members, created_at, updated_at

### 10. team_members
- Users assigned to a team with roles and status.
- Key columns: id, team_id, user_id, role, status, joined_at

### 11. team_assignments
- Tracks which team was assigned to which booking and the team members involved.
- Key columns: id, booking_id, team_id, assigned_members, assignment_status, timestamps, notes

---

#### Additional Application/User Tables (from context, not shown in full in this file):

### 12. users
- Application users (referenced by many FK columns).

### 13. auth.users
- Auth provider users table (referenced by user_cart, user_wishlist, etc).

---

#### _If you have additional entities in your schema scripts (e.g., for payments, admin tables, audit logs), list them below following a similar format. The main documented tables here (from `DATABASE_SCHEMA.md`) are those directly described._

---
(If you want verbatim SQL CREATE TABLEs or all full column types/constraints, extract from your SQL setup scripts or expand from this summary.)


