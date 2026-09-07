const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'random_secret_string_for_security_789';

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://jefram-stores.onrender.com', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// ==================== AUTH MIDDLEWARE ====================

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const adminOnly = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const customerOnly = async (req, res, next) => {
  if (req.user.role !== 'customer') {
    return res.status(403).json({ error: 'Customer access required' });
  }
  next();
};

// ==================== AUTH ROUTES ====================

// Admin login
app.post('/api/auth/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'admin']);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const admin = result.rows[0];
    if (!admin.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, admin.password_hash);
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

// Initial admin setup (only works if no admin exists)
app.post('/api/auth/admin/register', async (req, res) => {
  try {
    const existing = await pool.query('SELECT COUNT(*) FROM users WHERE role = $1', ['admin']);
    if (parseInt(existing.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Admin already exists. Use the admin panel to create more admins.' });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, password_hash, 'admin']
    );

    const token = jwt.sign({ id: result.rows[0].id, email, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: result.rows[0].id, email, name, role: 'admin' } });
  } catch (error) {
    console.error('Admin register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Admin create (master only)
app.post('/api/auth/admin/create', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
      [email, password_hash, username, role || 'subadmin']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Admin create error:', error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// Admin recover (master only - set password for existing admin user)
app.post('/api/auth/admin/recover', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { uid, username, email, role } = req.body;
    if (!uid || !username || !email) {
      return res.status(400).json({ error: 'UID, username and email are required' });
    }
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [uid]);
    let userId;
    if (existing.rows.length > 0) {
      await pool.query('UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4', [username, email, role || 'subadmin', uid]);
      userId = uid;
    } else {
      const password_hash = await bcrypt.hash('changeme123', 10);
      const result = await pool.query(
        'INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, created_at',
        [uid, email, password_hash, username, role || 'subadmin']
      );
      userId = result.rows[0].id;
    }
    const result = await pool.query('SELECT id, email, name, role, created_at FROM users WHERE id = $1', [userId]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin recover error:', error);
    res.status(500).json({ error: 'Failed to recover admin' });
  }
});

// Customer register
app.post('/api/auth/customer/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [email, password_hash, name, phone || null, 'customer']
    );
    const token = jwt.sign({ id: result.rows[0].id, email, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: result.rows[0] });
  } catch (error) {
    console.error('Customer register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Customer login
app.post('/api/auth/customer/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND role = $2', [email, 'customer']);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const customer = result.rows[0];
    if (!customer.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: customer.id, email: customer.email, role: customer.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone } });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, phone, address, role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ==================== PRODUCTS ====================

app.get('/api/products', async (req, res) => {
  try {
    const { category, limit, featured, flash_sale, search } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (category) {
      paramCount++;
      query += ` AND category_id = $${paramCount}`;
      params.push(category);
    }

    if (featured === 'true') {
      query += ' AND is_featured = true';
    }

    if (flash_sale === 'true') {
      query += ' AND is_flash_sale = true';
    }

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(parseInt(limit));
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/products', authMiddleware, adminOnly, async (req, res) => {
  try {
    const {
      name, description, price, old_price, stock, category_id,
      brand, sizes, image_urls, discount_percent, is_featured, is_flash_sale
    } = req.body;

    const result = await pool.query(
      `INSERT INTO products (name, description, price, old_price, stock, category_id, brand, sizes, image_urls, discount_percent, is_featured, is_flash_sale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [name, description, price, old_price, stock, category_id, brand, JSON.stringify(sizes || []), JSON.stringify(image_urls || []), discount_percent, is_featured, is_flash_sale]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, price, old_price, stock, category_id,
      brand, sizes, image_urls, discount_percent, is_featured, is_flash_sale
    } = req.body;

    const result = await pool.query(
      `UPDATE products 
       SET name = $1, description = $2, price = $3, old_price = $4, stock = $5, 
           category_id = $6, brand = $7, sizes = $8, image_urls = $9, 
           discount_percent = $10, is_featured = $11, is_flash_sale = $12
       WHERE id = $13
       RETURNING *`,
      [name, description, price, old_price, stock, category_id, brand, JSON.stringify(sizes || []), JSON.stringify(image_urls || []), discount_percent, is_featured, is_flash_sale, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ==================== CATEGORIES ====================

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/categories', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ==================== ORDERS ====================

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const result = await pool.query(
        `SELECT o.*, 
                json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name, 'quantity', oi.quantity, 'price', oi.price, 'size', oi.size)) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         GROUP BY o.id
         ORDER BY o.created_at DESC`
      );
      res.json(result.rows);
    } else {
      const result = await pool.query(
        `SELECT o.*, 
                json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name, 'quantity', oi.quantity, 'price', oi.price, 'size', oi.size)) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.customer_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [req.user.id]
      );
      res.json(result.rows);
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    let query = `SELECT o.*, 
            json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name, 'quantity', oi.quantity, 'price', oi.price, 'size', oi.size)) as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.id = $1
     GROUP BY o.id`;
    
    const params = [id];
    if (req.user.role !== 'admin') {
      query += ' AND o.customer_id = $2';
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.post('/api/orders', authMiddleware, customerOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      total, subtotal, shipping, discount,
      status, customer_name, customer_phone, customer_address, customer_city,
      coupon_code, items, payment_method, mobile_money_number, payment_screenshot, order_notes
    } = req.body;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, total, subtotal, shipping, discount, status, customer_name, customer_phone, customer_address, customer_city, coupon_code, payment_method, mobile_money_number, payment_screenshot, order_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [req.user.id, total, subtotal, shipping, discount, status || 'pending', customer_name, customer_phone, customer_address, customer_city, coupon_code, payment_method, mobile_money_number, payment_screenshot, order_notes]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, size)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.product_id, item.product_name, item.quantity, item.price, item.size]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(orderResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

app.put('/api/orders/:id/status', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

app.put('/api/orders/:id/rating', authMiddleware, customerOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { product_rating, delivery_rating, rating_comment } = req.body;

    const result = await pool.query(
      `UPDATE orders 
       SET product_rating = $1, delivery_rating = $2, rating_comment = $3, rated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND customer_id = $5
       RETURNING *`,
      [product_rating, delivery_rating, rating_comment, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error rating order:', error);
    res.status(500).json({ error: 'Failed to rate order' });
  }
});

// ==================== REVIEWS ====================

app.get('/api/reviews', async (req, res) => {
  try {
    const { product_id } = req.query;
    let query = 'SELECT * FROM reviews';
    const params = [];

    if (product_id) {
      query += ' WHERE product_id = $1';
      params.push(product_id);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.post('/api/reviews', authMiddleware, async (req, res) => {
  try {
    const { product_id, product_name, rating, comment } = req.body;
    const user_id = req.user.id;

    const result = await pool.query(
      `INSERT INTO reviews (product_id, product_name, user_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [product_id, product_name, user_id, rating, comment]
    );

    await pool.query(
      `UPDATE products 
       SET average_rating = (
          SELECT AVG(rating) FROM reviews WHERE product_id = $1
        ),
        review_count = (
          SELECT COUNT(*) FROM reviews WHERE product_id = $1
        )
       WHERE id = $1`,
      [product_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// ==================== COUPONS ====================

app.get('/api/coupons', async (req, res) => {
  try {
    const { code, active } = req.query;
    let query = 'SELECT * FROM coupons WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (code) {
      paramCount++;
      query += ` AND code = $${paramCount}`;
      params.push(code);
    }

    if (active === 'true') {
      query += ' AND active = true';
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

app.post('/api/coupons', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { code, discount_percent, discount_fixed, active, max_uses, valid_from, valid_until } = req.body;

    const result = await pool.query(
      `INSERT INTO coupons (code, discount_percent, discount_fixed, active, max_uses, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [code, discount_percent, discount_fixed, active, max_uses, valid_from, valid_until]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

app.put('/api/coupons/:id/usage', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating coupon usage:', error);
    res.status(500).json({ error: 'Failed to update coupon usage' });
  }
});

// ==================== CONFIG ====================

app.get('/api/config/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const result = await pool.query('SELECT * FROM config WHERE key = $1', [key]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Config not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

app.put('/api/config/:key', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const result = await pool.query(
      'UPDATE config SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2 RETURNING *',
      [JSON.stringify(value), key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Config not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// ==================== USERS ====================

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, phone, address, role, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.put('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone, name, address } = req.body;

    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      'UPDATE users SET email = $1, phone = $2, name = $3, address = $4 WHERE id = $5 RETURNING *',
      [email, phone, name, address, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.put('/api/users/:id/password', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, email, name, role', [password_hash, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ ...result.rows[0], plainPassword: password });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// ==================== DASHBOARD STATS ====================

app.get('/api/stats/overview', authMiddleware, adminOnly, async (req, res) => {
  try {
    const ordersResult = await pool.query('SELECT COUNT(*) as total_orders, SUM(total) as total_revenue FROM orders WHERE status = $1', ['delivered']);
    const usersResult = await pool.query('SELECT COUNT(*) as total_users FROM users WHERE role = $1', ['customer']);
    const productsResult = await pool.query('SELECT COUNT(*) as total_products FROM products');
    const reviewsResult = await pool.query('SELECT COUNT(*) as total_reviews FROM reviews');

    res.json({
      totalOrders: parseInt(ordersResult.rows[0].total_orders) || 0,
      totalRevenue: parseFloat(ordersResult.rows[0].total_revenue) || 0,
      totalUsers: parseInt(usersResult.rows[0].total_users) || 0,
      totalProducts: parseInt(productsResult.rows[0].total_products) || 0,
      totalReviews: parseInt(reviewsResult.rows[0].total_reviews) || 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ==================== DELIVERY AGENTS ====================

app.get('/api/delivery-agents', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM delivery_agents ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching delivery agents:', error);
    res.status(500).json({ error: 'Failed to fetch delivery agents' });
  }
});

app.post('/api/delivery-agents', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const result = await pool.query(
      'INSERT INTO delivery_agents (name, phone) VALUES ($1, $2) RETURNING *',
      [name, phone]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating delivery agent:', error);
    res.status(500).json({ error: 'Failed to create delivery agent' });
  }
});

app.delete('/api/delivery-agents/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM delivery_agents WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Delivery agent not found' });
    }
    res.json({ message: 'Delivery agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting delivery agent:', error);
    res.status(500).json({ error: 'Failed to delete delivery agent' });
  }
});

app.put('/api/orders/:id/assign-agent', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_agent_id } = req.body;
    
    let agentInfo = null;
    if (delivery_agent_id) {
      const agentResult = await pool.query('SELECT id, name, phone FROM delivery_agents WHERE id = $1', [delivery_agent_id]);
      if (agentResult.rows.length > 0) {
        agentInfo = agentResult.rows[0];
      }
    }
    
    const result = await pool.query(
      'UPDATE orders SET delivery_agent = $1 WHERE id = $2 RETURNING *',
      [agentInfo ? JSON.stringify(agentInfo) : null, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error assigning agent:', error);
    res.status(500).json({ error: 'Failed to assign agent' });
  }
});

// ==================== ORDERS EXTENDED ====================

app.put('/api/orders/:id/delivery-fee', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_fee } = req.body;
    const result = await pool.query('UPDATE orders SET delivery_fee = $1 WHERE id = $2 RETURNING *', [delivery_fee, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating delivery fee:', error);
    res.status(500).json({ error: 'Failed to update delivery fee' });
  }
});

app.put('/api/orders/:id/tracking', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { tracking_number } = req.body;
    const result = await pool.query('UPDATE orders SET tracking_number = $1 WHERE id = $2 RETURNING *', [tracking_number, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating tracking:', error);
    res.status(500).json({ error: 'Failed to update tracking' });
  }
});

app.put('/api/orders/:id/estimated-delivery', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { estimated_delivery_date } = req.body;
    const result = await pool.query('UPDATE orders SET estimated_delivery_date = $1 WHERE id = $2 RETURNING *', [estimated_delivery_date, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating estimated delivery:', error);
    res.status(500).json({ error: 'Failed to update estimated delivery' });
  }
});

app.put('/api/orders/:id/approve-payment', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("UPDATE orders SET status = 'pending' WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error approving payment:', error);
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

app.put('/api/orders/:id/reject-payment', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error rejecting payment:', error);
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

app.put('/api/orders/:id/response', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_response } = req.body;
    const result = await pool.query('UPDATE orders SET admin_response = $1 WHERE id = $2 RETURNING *', [admin_response, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating response:', error);
    res.status(500).json({ error: 'Failed to update response' });
  }
});

app.put('/api/orders/:id/confirm', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, delivery_fee, estimated_delivery_date, tracking_number } = req.body;
    const result = await pool.query(
      `UPDATE orders SET status = $1, delivery_fee = $2, estimated_delivery_date = $3, tracking_number = $4 WHERE id = $5 RETURNING *`,
      [status, delivery_fee, estimated_delivery_date, tracking_number, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error confirming order:', error);
    res.status(500).json({ error: 'Failed to confirm order' });
  }
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
