const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'https://jefram-stores.onrender.com', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// ==================== PRODUCTS ====================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const { category, limit, featured, flash_sale } = req.query;
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

// Get single product
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

// Create product (admin only)
app.post('/api/products', async (req, res) => {
  try {
    const {
      name, description, price, old_price, stock, category_id,
      brand, sizes, image_urls, discount_percent, is_featured, is_flash_sale
    } = req.body;

    const result = await pool.query(
      `INSERT INTO products (name, description, price, old_price, stock, category_id, brand, sizes, image_urls, discount_percent, is_featured, is_flash_sale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [name, description, price, old_price, stock, category_id, brand, JSON.stringify(sizes), JSON.stringify(image_urls), discount_percent, is_featured, is_flash_sale]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
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
      [name, description, price, old_price, stock, category_id, brand, JSON.stringify(sizes), JSON.stringify(image_urls), discount_percent, is_featured, is_flash_sale, id]
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

// Delete product
app.delete('/api/products/:id', async (req, res) => {
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

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
app.post('/api/categories', async (req, res) => {
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

// Get orders by customer
app.get('/api/orders', async (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    const result = await pool.query(
      `SELECT o.*, 
              json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name, 'quantity', oi.quantity, 'price', oi.price, 'size', oi.size)) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.customer_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [customer_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
app.get('/api/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT o.*, 
              json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'product_name', oi.product_name, 'quantity', oi.quantity, 'price', oi.price, 'size', oi.size)) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1
       GROUP BY o.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      customer_id, order_number, total, subtotal, shipping, discount,
      status, customer_name, customer_phone, customer_address, customer_city,
      coupon_code, items
    } = req.body;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, order_number, total, subtotal, shipping, discount, status, customer_name, customer_phone, customer_address, customer_city, coupon_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [customer_id, order_number, total, subtotal, shipping, discount, status, customer_name, customer_phone, customer_address, customer_city, coupon_code]
    );

    const orderId = orderResult.rows[0].id;

    // Insert order items
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

// Update order status
app.put('/api/orders/:id/status', async (req, res) => {
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

// Rate order
app.put('/api/orders/:id/rating', async (req, res) => {
  try {
    const { id } = req.params;
    const { product_rating, delivery_rating, rating_comment } = req.body;

    const result = await pool.query(
      `UPDATE orders 
       SET product_rating = $1, delivery_rating = $2, rating_comment = $3, rated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [product_rating, delivery_rating, rating_comment, id]
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

// Get reviews for a product
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

// Create review
app.post('/api/reviews', async (req, res) => {
  try {
    const { product_id, product_name, user_id, rating, comment } = req.body;

    const result = await pool.query(
      `INSERT INTO reviews (product_id, product_name, user_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [product_id, product_name, user_id, rating, comment]
    );

    // Update product rating
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

// Get active coupons
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

// Create coupon
app.post('/api/coupons', async (req, res) => {
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

// Update coupon usage
app.put('/api/coupons/:id/usage', async (req, res) => {
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

// ==================== USERS ====================

// Get user by Firebase UID
app.get('/api/users/firebase/:firebase_uid', async (req, res) => {
  try {
    const { firebase_uid } = req.params;
    const result = await pool.query('SELECT * FROM users WHERE firebase_uid = $1', [firebase_uid]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  try {
    const { firebase_uid, email, phone, name, address, role } = req.body;

    const result = await pool.query(
      `INSERT INTO users (firebase_uid, email, phone, name, address, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [firebase_uid, email, phone, name, address, role || 'customer']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone, name, address } = req.body;

    const result = await pool.query(
      `UPDATE users SET email = $1, phone = $2, name = $3, address = $4 WHERE id = $5 RETURNING *`,
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

// ==================== CONFIG ====================

// Get config
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

// Update config
app.put('/api/config/:key', async (req, res) => {
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

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});