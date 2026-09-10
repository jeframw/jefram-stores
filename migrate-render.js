const { Client } = require('pg');
require('dotenv').config();

// Support both DATABASE_URL and individual environment variables
const clientConfig = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'jefram_stores',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    };

async function migrate() {
  const client = new Client(clientConfig);
  
  try {
    console.log('Connecting to Render database...');
    await client.connect();
    console.log('Connected!');

    console.log('Running migrations...');
    
    // Enable UUID extension
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";");
      console.log('✓ Enabled UUID extension');
    } catch (err) {
      console.log('ℹ UUID extension may already be enabled:', err.message);
    }
    
    // Create tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE,
        name VARCHAR(255),
        address TEXT,
        role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'delivery_agent')),
        password_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified users table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified categories table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        old_price DECIMAL(10, 2),
        stock INTEGER DEFAULT 0,
        category_id INTEGER REFERENCES categories(id),
        brand VARCHAR(255),
        sizes JSONB,
        image_urls JSONB,
        discount_percent INTEGER DEFAULT 0,
        average_rating DECIMAL(3, 2) DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT FALSE,
        is_flash_sale BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified products table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID REFERENCES users(id),
        order_number VARCHAR(50) UNIQUE,
        total DECIMAL(10, 2) NOT NULL,
        subtotal DECIMAL(10, 2),
        shipping DECIMAL(10, 2),
        discount DECIMAL(10, 2),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'pending_payment', 'confirmed', 'on_way', 'delivered', 'cancelled')),
        customer_name VARCHAR(255),
        customer_phone VARCHAR(20),
        customer_address TEXT,
        customer_city VARCHAR(100),
        delivery_agent_id UUID REFERENCES users(id),
        product_rating INTEGER CHECK (product_rating >= 1 AND product_rating <= 5),
        delivery_rating INTEGER CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
        rating_comment TEXT,
        rated_at TIMESTAMP,
        coupon_code VARCHAR(100),
        payment_method VARCHAR(50),
        mobile_money_number VARCHAR(20),
        payment_screenshot TEXT,
        order_notes TEXT,
        tracking_number VARCHAR(255),
        estimated_delivery_date DATE,
        delivery_fee DECIMAL(10, 2) DEFAULT 0,
        admin_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified orders table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id),
        product_name VARCHAR(255),
        quantity INTEGER NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        size VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified order_items table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id UUID REFERENCES products(id),
        product_name VARCHAR(255),
        user_id UUID REFERENCES users(id),
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified reviews table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(100) UNIQUE NOT NULL,
        discount_percent INTEGER NOT NULL,
        discount_fixed DECIMAL(10, 2),
        active BOOLEAN DEFAULT TRUE,
        used_count INTEGER DEFAULT 0,
        max_uses INTEGER,
        valid_from TIMESTAMP,
        valid_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified coupons table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS config (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value JSONB,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified config table');

    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_agents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Created/verified delivery_agents table');

    // Add columns if they don't exist (for backwards compatibility)
    try {
      await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;");
      console.log('✓ Added password_hash to users');
    } catch (err) {
      console.log('ℹ password_hash column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;");
      console.log('✓ Added payment_method to orders');
    } catch (err) {
      console.log('ℹ payment_method column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS mobile_money_number TEXT;");
      console.log('✓ Added mobile_money_number to orders');
    } catch (err) {
      console.log('ℹ mobile_money_number column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_screenshot TEXT;");
      console.log('✓ Added payment_screenshot to orders');
    } catch (err) {
      console.log('ℹ payment_screenshot column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_notes TEXT;");
      console.log('✓ Added order_notes to orders');
    } catch (err) {
      console.log('ℹ order_notes column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;");
      console.log('✓ Added tracking_number to orders');
    } catch (err) {
      console.log('ℹ tracking_number column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;");
      console.log('✓ Added estimated_delivery_date to orders');
    } catch (err) {
      console.log('ℹ estimated_delivery_date column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10,2) DEFAULT 0;");
      console.log('✓ Added delivery_fee to orders');
    } catch (err) {
      console.log('ℹ delivery_fee column may already exist');
    }

    try {
      await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_response TEXT;");
      console.log('✓ Added admin_response to orders');
    } catch (err) {
      console.log('ℹ admin_response column may already exist');
    }

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);",
      "CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);",
      "CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);",
      "CREATE INDEX IF NOT EXISTS idx_products_flash_sale ON products(is_flash_sale);",
      "CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);",
      "CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);",
      "CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);",
      "CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);",
      "CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);",
      "CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);",
      "CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active);"
    ];

    for (const indexSql of indexes) {
      try {
        await client.query(indexSql);
      } catch (err) {
        console.log('ℹ Index may already exist:', err.message);
      }
    }
    console.log('✓ Created/verified indexes');

    // Insert default config if not exists
    try {
      await client.query(`
        INSERT INTO config (key, value, description) VALUES 
        ('store', '{}', 'Store configuration'),
        ('flash_sales', '{}', 'Flash sales configuration')
        ON CONFLICT (key) DO NOTHING;
      `);
      console.log('✓ Inserted default config');
    } catch (err) {
      console.log('ℹ Default config may already exist');
    }

    // Insert default categories if not exists
    try {
      await client.query(`
        INSERT INTO categories (name, description) VALUES 
        ('Electronics', 'Electronic devices and accessories'),
        ('Fashion', 'Clothing and fashion items'),
        ('Home & Office', 'Home and office supplies'),
        ('Appliances', 'Home appliances'),
        ('Phones & Tablets', 'Mobile phones and tablets'),
        ('Computing', 'Computers and computing accessories'),
        ('Health & Beauty', 'Health and beauty products'),
        ('Gaming', 'Gaming consoles and accessories'),
        ('Sporting Goods', 'Sports and fitness equipment'),
        ('Baby Products', 'Products for babies and children')
        ON CONFLICT (name) DO NOTHING;
      `);
      console.log('✓ Inserted default categories');
    } catch (err) {
      console.log('ℹ Default categories may already exist');
    }

    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('Connection closed');
  }
}

migrate();
