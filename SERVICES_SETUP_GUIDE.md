# Services Database Setup Guide

This guide explains how to set up the services system for the S9 Mini application.

## Overview

The services system consists of two main tables:
- `service_categories`: Categories for organizing services (e.g., "Home Maintenance", "Caregiving")
- `services`: Individual services with pricing, descriptions, and offers

## Setup Instructions

### 1. Database Setup

Run the complete setup script in your Supabase SQL Editor:

```sql
-- Run this file: setup-services-database.sql
```

This script will:
- Create the `service_categories` table
- Create the `services` table
- Set up proper indexes and triggers
- Insert sample categories and services

### 2. API Endpoints

The backend already includes the following endpoints:

#### Categories
- `GET /categories` - List all categories
- `POST /categories` - Create new category
- `GET /categories/:id` - Get specific category
- `PUT /categories/:id` - Update category
- `DELETE /categories/:id` - Delete category

#### Services
- `GET /services` - List all services with category information
- `POST /services` - Create new service
- `GET /services/:id` - Get specific service
- `PUT /services/:id` - Update service
- `DELETE /services/:id` - Delete service

### 3. Frontend Integration

The customer dashboard has been updated to:
- Fetch real services from the database
- Display services organized by categories
- Show pricing with offers and discounts
- Handle loading states and empty states

## Sample Data

The setup script includes these categories:
- Home Maintenance (3 services)
- Caregiving (2 services)
- Transportation (2 services)
- Technology (2 services)
- Healthcare (1 service)

## Features

### Services Display
- Real-time data from database
- Category-based organization
- Price display with offers
- Service descriptions and duration
- Icon support (with fallback)

### Pricing System
- Base price
- Offer price (optional)
- Offer percentage calculation
- Offer enabled/disabled toggle

### Categories
- Hierarchical organization
- Icon support
- Active/inactive status
- Service count per category

## Usage

1. **View Services**: The customer dashboard automatically loads and displays all active services
2. **Filter by Category**: Users can filter services by category
3. **Search**: Users can search services by name or description
4. **View Offers**: Services with active offers show discounted pricing

## Troubleshooting

### No Services Showing
1. Check if the database tables exist
2. Verify sample data was inserted
3. Check API endpoint responses
4. Ensure services have `active = true`

### Categories Not Loading
1. Verify `service_categories` table exists
2. Check if categories have `active = true`
3. Test the `/categories` API endpoint

### Price Display Issues
1. Check if services have valid `price` values
2. Verify `offer_enabled` and `offer_price` logic
3. Ensure proper decimal formatting

## Database Schema

### service_categories
```sql
id UUID PRIMARY KEY
name VARCHAR(100) UNIQUE
description TEXT
icon_url TEXT
settings JSONB
active BOOLEAN DEFAULT TRUE
status VARCHAR(20) DEFAULT 'active'
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### services
```sql
id UUID PRIMARY KEY
category_id UUID REFERENCES service_categories(id)
name VARCHAR(200)
description TEXT
icon_url TEXT
duration TEXT
price DECIMAL(10,2)
offer_price DECIMAL(10,2)
offer_percentage DECIMAL(5,2)
offer_enabled BOOLEAN DEFAULT FALSE
active BOOLEAN DEFAULT TRUE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## Next Steps

1. Run the setup script in Supabase
2. Start the backend server
3. Test the customer dashboard
4. Add more categories and services as needed
5. Customize the UI styling for your brand
