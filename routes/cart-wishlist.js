const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../lib/supabase');
const { authenticateUser } = require('../middleware/authMiddleware');

// Helper function to create user-scoped Supabase client
const getUserSupabaseClient = (accessToken) => {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
};

// =====================================================
// CART ENDPOINTS
// =====================================================

// Get user's cart
router.get('/cart', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7); // Remove 'Bearer ' prefix
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const { data: cartItems, error } = await userSupabase
      .from('user_cart')
      .select(`
        *,
        services (
          id,
          name,
          description,
          price,
          offer_price,
          offer_percentage,
          offer_enabled,
          duration,
          icon_url,
          category_id,
          active,
          created_at,
          service_categories (
            id,
            name,
            description,
            icon_url
          )
        )
      `)
      .eq('user_id', userId)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('Error fetching cart:', error);
      return res.status(500).json({ error: 'Failed to fetch cart' });
    }

    res.json(cartItems || []);
  } catch (error) {
    console.error('Cart fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
router.post('/cart/add', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { service_id, quantity = 1 } = req.body;
    
    if (!service_id) {
      return res.status(400).json({ error: 'Service ID is required' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    // Check if item already exists in cart
    const { data: existingItem } = await userSupabase
      .from('user_cart')
      .select('*')
      .eq('user_id', userId)
      .eq('service_id', service_id)
      .single();

    if (existingItem) {
      // Update quantity
      const { data, error } = await userSupabase
        .from('user_cart')
        .update({ 
          quantity: existingItem.quantity + quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating cart item:', error);
        return res.status(500).json({ error: 'Failed to update cart item' });
      }

      return res.json({ message: 'Cart item updated', item: data });
    } else {
      // Add new item
      const { data, error } = await userSupabase
        .from('user_cart')
        .insert({
          user_id: userId,
          service_id,
          quantity
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({ error: 'Failed to add item to cart' });
      }

      res.json({ message: 'Item added to cart', item: data });
    }
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cart item quantity
router.put('/cart/update/:itemId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const { data, error } = await userSupabase
      .from('user_cart')
      .update({ 
        quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating cart item:', error);
      return res.status(500).json({ error: 'Failed to update cart item' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    res.json({ message: 'Cart item updated', item: data });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/cart/remove/:itemId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { itemId } = req.params;

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const { error } = await userSupabase
      .from('user_cart')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing cart item:', error);
      return res.status(500).json({ error: 'Failed to remove cart item' });
    }

    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear entire cart
router.delete('/cart/clear', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const { error } = await userSupabase
      .from('user_cart')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing cart:', error);
      return res.status(500).json({ error: 'Failed to clear cart' });
    }

    res.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// WISHLIST ENDPOINTS
// =====================================================

// Get user's wishlist
router.get('/wishlist', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7); // Remove 'Bearer ' prefix
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const { data: wishlistItems, error } = await userSupabase
      .from('user_wishlist')
      .select(`
        *,
        services (
          id,
          name,
          description,
          price,
          offer_price,
          offer_percentage,
          offer_enabled,
          duration,
          icon_url,
          category_id,
          active,
          created_at,
          service_categories (
            id,
            name,
            description,
            icon_url
          )
        )
      `)
      .eq('user_id', userId)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('Error fetching wishlist:', error);
      return res.status(500).json({ error: 'Failed to fetch wishlist' });
    }

    res.json(wishlistItems || []);
  } catch (error) {
    console.error('Wishlist fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to wishlist
router.post('/wishlist/add', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { service_id } = req.body;
    
    if (!service_id) {
      return res.status(400).json({ error: 'Service ID is required' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    // Check if item already exists in wishlist
    const { data: existingItem } = await userSupabase
      .from('user_wishlist')
      .select('*')
      .eq('user_id', userId)
      .eq('service_id', service_id)
      .single();

    if (existingItem) {
      return res.json({ message: 'Item already in wishlist', item: existingItem });
    }

    // Add new item
    const { data, error } = await userSupabase
      .from('user_wishlist')
      .insert({
        user_id: userId,
        service_id
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding to wishlist:', error);
      return res.status(500).json({ error: 'Failed to add item to wishlist' });
    }

    res.json({ message: 'Item added to wishlist', item: data });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from wishlist
router.delete('/wishlist/remove/:itemId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { itemId } = req.params;

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const { error } = await userSupabase
      .from('user_wishlist')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing wishlist item:', error);
      return res.status(500).json({ error: 'Failed to remove wishlist item' });
    }

    res.json({ message: 'Item removed from wishlist' });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle wishlist item (add if not exists, remove if exists)
router.post('/wishlist/toggle', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { service_id } = req.body;
    
    if (!service_id) {
      return res.status(400).json({ error: 'Service ID is required' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    // Check if item exists in wishlist
    const { data: existingItem } = await userSupabase
      .from('user_wishlist')
      .select('*')
      .eq('user_id', userId)
      .eq('service_id', service_id)
      .single();

    if (existingItem) {
      // Remove from wishlist
      const { error } = await userSupabase
        .from('user_wishlist')
        .delete()
        .eq('id', existingItem.id);

      if (error) {
        console.error('Error removing from wishlist:', error);
        return res.status(500).json({ error: 'Failed to remove from wishlist' });
      }

      res.json({ message: 'Item removed from wishlist', action: 'removed' });
    } else {
      // Add to wishlist
      const { data, error } = await userSupabase
        .from('user_wishlist')
        .insert({
          user_id: userId,
          service_id
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding to wishlist:', error);
        return res.status(500).json({ error: 'Failed to add to wishlist' });
      }

      res.json({ message: 'Item added to wishlist', action: 'added', item: data });
    }
  } catch (error) {
    console.error('Toggle wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear entire wishlist
router.delete('/wishlist/clear', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const { error } = await userSupabase
      .from('user_wishlist')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing wishlist:', error);
      return res.status(500).json({ error: 'Failed to clear wishlist' });
    }

    res.json({ message: 'Wishlist cleared' });
  } catch (error) {
    console.error('Clear wishlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// UTILITY ENDPOINTS
// =====================================================

// Check if service is in cart/wishlist
router.get('/check-status/:serviceId', authenticateUser, async (req, res) => {
  try {
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.substring(7);
    
    if (!userId || !accessToken) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { serviceId } = req.params;

    // Create user-scoped Supabase client for RLS to work
    const userSupabase = getUserSupabaseClient(accessToken);

    const [cartResult, wishlistResult] = await Promise.all([
      userSupabase
        .from('user_cart')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('service_id', serviceId)
        .single(),
      userSupabase
        .from('user_wishlist')
        .select('id')
        .eq('user_id', userId)
        .eq('service_id', serviceId)
        .single()
    ]);

    res.json({
      inCart: !!cartResult.data,
      cartQuantity: cartResult.data?.quantity || 0,
      inWishlist: !!wishlistResult.data
    });
  } catch (error) {
    console.error('Check status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
