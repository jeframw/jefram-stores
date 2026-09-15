-- Jefram Stores PostgreSQL Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (combines customers and admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    name VARCHAR(255),
    address TEXT,
    role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'delivery_agent', 'product_manager')),
    password_hash TEXT,
    google_id VARCHAR(255) UNIQUE,
    apple_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE products (
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

-- Orders table
CREATE TABLE orders (
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items table
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255),
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    size VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255),
    user_id UUID REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coupons table
CREATE TABLE coupons (
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

-- Config table
CREATE TABLE config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP Sessions table for phone authentication
CREATE TABLE otp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    otp VARCHAR(8) NOT NULL,
    purpose VARCHAR(20) NOT NULL DEFAULT 'login',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_otp_phone ON otp_sessions(phone);
CREATE INDEX idx_otp_expires ON otp_sessions(expires_at);

-- Indexes for better performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_featured ON products(is_featured);
CREATE INDEX idx_products_flash_sale ON products(is_flash_sale);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_active ON coupons(active);

-- Insert default config
INSERT INTO config (key, value, description) VALUES 
('store', '{}', 'Store configuration'),
('flash_sales', '{}', 'Flash sales configuration');

-- Insert default categories
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
('Baby Products', 'Products for babies and children');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();