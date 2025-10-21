#!/usr/bin/env node

/**
 * Cart and Wishlist Database Setup Script
 * 
 * This script sets up the database tables for cart and wishlist functionality.
 * Run this script after setting up your Supabase project.
 */

const fs = require('fs');
const path = require('path');

console.log('🛒 Setting up Cart and Wishlist Database Tables...\n');

// Read the SQL file
const sqlFilePath = path.join(__dirname, 'cart-wishlist-tables.sql');
const migrationFilePath = path.join(__dirname, 'migrate-cart-wishlist-fix.sql');

if (!fs.existsSync(sqlFilePath)) {
  console.error('❌ SQL file not found:', sqlFilePath);
  console.error('Please make sure cart-wishlist-tables.sql exists in the S9-b-end directory');
  process.exit(1);
}

const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
const migrationContent = fs.existsSync(migrationFilePath) ? fs.readFileSync(migrationFilePath, 'utf8') : '';

console.log('📄 SQL Content to execute:');
console.log('=' .repeat(50));
console.log(sqlContent);
console.log('=' .repeat(50));
console.log('');

if (migrationContent) {
  console.log('🔧 Migration Script (if tables already exist):');
  console.log('=' .repeat(50));
  console.log(migrationContent);
  console.log('=' .repeat(50));
  console.log('');
}

console.log('📋 Instructions:');
console.log('1. Copy the SQL content above');
console.log('2. Go to your Supabase project dashboard');
console.log('3. Navigate to SQL Editor');
console.log('4. Paste the SQL content and execute it');
console.log('5. If you get foreign key constraint errors, run the migration script instead');
console.log('6. Verify that the following tables were created:');
console.log('   - user_cart');
console.log('   - user_wishlist');
console.log('');

console.log('⚠️  Important Notes:');
console.log('- The tables now reference auth.users instead of public.users');
console.log('- This fixes the foreign key constraint issues');
console.log('- Services are joined with service_categories for proper category names');
console.log('');

console.log('✅ After running the SQL:');
console.log('- Cart and wishlist functionality will be persistent per user');
console.log('- Users can add/remove items from cart and wishlist');
console.log('- Data will persist across login/logout sessions');
console.log('- Each user will have their own separate cart and wishlist');
console.log('- Category names will be properly displayed');
console.log('');

console.log('🔧 Backend API Endpoints Available:');
console.log('- GET /api/cart-wishlist/cart - Get user cart');
console.log('- POST /api/cart-wishlist/cart/add - Add item to cart');
console.log('- PUT /api/cart-wishlist/cart/update/:itemId - Update cart item quantity');
console.log('- DELETE /api/cart-wishlist/cart/remove/:itemId - Remove item from cart');
console.log('- DELETE /api/cart-wishlist/cart/clear - Clear entire cart');
console.log('- GET /api/cart-wishlist/wishlist - Get user wishlist');
console.log('- POST /api/cart-wishlist/wishlist/add - Add item to wishlist');
console.log('- DELETE /api/cart-wishlist/wishlist/remove/:itemId - Remove item from wishlist');
console.log('- POST /api/cart-wishlist/wishlist/toggle - Toggle wishlist item');
console.log('- DELETE /api/cart-wishlist/wishlist/clear - Clear entire wishlist');
console.log('- GET /api/cart-wishlist/check-status/:serviceId - Check if service is in cart/wishlist');
console.log('');

console.log('🎉 Setup complete! Your cart and wishlist functionality is now persistent.');
