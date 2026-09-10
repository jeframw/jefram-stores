const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a secure value of at least 32 characters.');
}

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false,
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'error', database: 'disconnected', error: error.message });
  }
});

// Test bcrypt
app.post('/test-bcrypt', async (req, res) => {
  const { password, hash } = req.body;
  const valid = await bcrypt.compare(password, hash);
  res.json({ valid });
});

// Admin login
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', email);
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = $2', [email, 'admin']);
    console.log('User found:', result.rows.length);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const admin = result.rows[0];
    console.log('Has password_hash:', !!admin.password_hash);
    if (!admin.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, admin.password_hash);
    console.log('Bcrypt valid:', valid);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});