require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.get('/', (req, res) => {
  res.send('API is running 🚀');
});

// Example: Get all users from Supabase (adjust table name as needed)
app.get('/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// User Registration Endpoint
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user, session: data.session });
});

// User Login Endpoint
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

// Get User Profile Endpoint
app.get('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    // If no profile exists, return default structure
    if (!data) {
      return res.json({
        id: userId,
        full_name: '',
        phone: '',
        address: '',
        bio: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update User Profile Endpoint
app.put('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const { full_name, phone, address, bio } = req.body;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name,
        phone,
        address,
        bio,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 