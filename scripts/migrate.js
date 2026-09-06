const { Pool } = require('pg');
const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase Admin SDK using environment variables
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'jefram_stores',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function migrateUsers() {
  console.log('Migrating users...');
  
  try {
    // Migrate customers
    const customersSnapshot = await db.collection('customers').get();
    for (const doc of customersSnapshot.docs) {
      const data = doc.data();
      await pool.query(
        `INSERT INTO users (firebase_uid, email, phone, name, address, role, created_at)
         VALUES ($1, $2, $3, $4, $5, 'customer', $6)
         ON CONFLICT (firebase_uid) DO UPDATE SET
         email = EXCLUDED.email, phone = EXCLUDED.phone, name = EXCLUDED.name, address = EXCLUDED.address, role = 'customer', updated_at = CURRENT_TIMESTAMP`,
        [doc.id, data.email, data.phone, data.name, data.address, data.createdAt?.toDate?.() || new Date()]
      );
    }

    // Migrate admins
    const adminsSnapshot = await db.collection('admins').get();
    for (const doc of adminsSnapshot.docs) {
      const data = doc.data();
      await pool.query(
        `INSERT INTO users (firebase_uid, email, phone, name, role, created_at)
         VALUES ($1, $2, $3, $4, 'admin', $5)
         ON CONFLICT (firebase_uid) DO UPDATE SET
         email = EXCLUDED.email, phone = EXCLUDED.phone, name = EXCLUDED.name, role = 'admin', updated_at = CURRENT_TIMESTAMP`,
        [doc.id, data.email, data.phone, data.name, data.createdAt?.toDate?.() || new Date()]
      );
    }

    // Migrate delivery agents
    const agentsSnapshot = await db.collection('delivery_agents').get();
    for (const doc of agentsSnapshot.docs) {
      const data = doc.data();
      await pool.query(
        `INSERT INTO users (firebase_uid, email, phone, name, role, created_at)
         VALUES ($1, $2, $3, $4, 'delivery_agent', $5)
         ON CONFLICT (firebase_uid) DO UPDATE SET
         email = EXCLUDED.email, phone = EXCLUDED.phone, name = EXCLUDED.name, role = 'delivery_agent', updated_at = CURRENT_TIMESTAMP`,
        [doc.id, data.email, data.phone, data.name, data.createdAt?.toDate?.() || new Date()]
      );
    }

    console.log(`Migrated ${customersSnapshot.size} customers, ${adminsSnapshot.size} admins, ${agentsSnapshot.size} delivery agents`);
  } catch (error) {
    console.error('Error migrating users:', error);
    throw error;
  }
}

async function migrateCategories() {
  console.log('Migrating categories...');
  
  try {
    const snapshot = await db.collection('categories').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      await pool.query(
        `INSERT INTO categories (name, description, created_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP`,
        [data.name, data.description, data.createdAt?.toDate?.() || new Date()]
      );
    }
    console.log(`Migrated ${snapshot.size} categories`);
  } catch (error) {
    console.error('Error migrating categories:', error);
    throw error;
  }
}

async function migrateProducts() {
  console.log('Migrating products...');
  
  try {
    const snapshot = await db.collection('products').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Get category ID if category exists
      let categoryId = null;
      if (data.category) {
        const categoryResult = await pool.query(
          'SELECT id FROM categories WHERE name = $1 LIMIT 1',
          [data.category]
        );
        if (categoryResult.rows.length > 0) {
          categoryId = categoryResult.rows[0].id;
        }
      }

      try {
        const orderResult = await pool.query(
          `INSERT INTO products (firebase_id, name, description, price, old_price, stock, category_id, brand, sizes, image_urls, discount_percent, average_rating, review_count, is_featured, is_flash_sale, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (firebase_id) DO UPDATE SET
           name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price,
           old_price = EXCLUDED.old_price, stock = EXCLUDED.stock, category_id = EXCLUDED.category_id,
           brand = EXCLUDED.brand, sizes = EXCLUDED.sizes, image_urls = EXCLUDED.image_urls,
           discount_percent = EXCLUDED.discount_percent, average_rating = EXCLUDED.average_rating,
           review_count = EXCLUDED.review_count, is_featured = EXCLUDED.is_featured,
           is_flash_sale = EXCLUDED.is_flash_sale`,
          [
            doc.id,
            data.name,
            data.description || '',
            data.price || 0,
            data.old_price || null,
            data.stock || 0,
            categoryId,
            data.brand || '',
            JSON.stringify(data.sizes || {}),
            JSON.stringify(data.image_urls || []),
            data.discount_percent || 0,
            data.average_rating || 0,
            data.review_count || 0,
            data.is_featured || false,
            data.is_flash_sale || false,
            data.createdAt?.toDate?.() || new Date()
          ]
        );
      } catch (error) {
        console.error('Error inserting product:', doc.id, error.message);
        continue;
      }
    }
    console.log(`Migrated ${snapshot.size} products`);
  } catch (error) {
    console.error('Error migrating products:', error);
    throw error;
  }
}

async function migrateOrders() {
  console.log('Migrating orders...');
  
  try {
    const snapshot = await db.collection('orders').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Get customer ID
      let customerId = null;
      if (data.customerId) {
        const userResult = await pool.query(
          'SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1',
          [data.customerId]
        );
        if (userResult.rows.length > 0) {
          customerId = userResult.rows[0].id;
        }
      }

      // Get delivery agent ID
      let deliveryAgentId = null;
      if (data.deliveryAgentId) {
        const agentResult = await pool.query(
          'SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1',
          [data.deliveryAgentId]
        );
        if (agentResult.rows.length > 0) {
          deliveryAgentId = agentResult.rows[0].id;
        }
      }

      try {
        const orderResult = await pool.query(
          `INSERT INTO orders (firebase_id, customer_id, order_number, total, subtotal, shipping, discount, status, customer_name, customer_phone, customer_address, customer_city, delivery_agent_id, product_rating, delivery_rating, rating_comment, rated_at, coupon_code, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (firebase_id) DO UPDATE SET
           total = EXCLUDED.total, status = EXCLUDED.status, product_rating = EXCLUDED.product_rating,
           delivery_rating = EXCLUDED.delivery_rating, rating_comment = EXCLUDED.rating_comment, rated_at = EXCLUDED.rated_at`,
          [
            doc.id,
            customerId,
            data.orderNumber || null,
            data.total || 0,
            data.subtotal || null,
            data.shipping || null,
            data.discount || null,
            data.status || 'pending',
            data.customer?.name || '',
            data.customer?.phone || '',
            data.customer?.address || '',
            data.customer?.city || '',
            deliveryAgentId,
            data.product_rating || null,
            data.delivery_rating || null,
            data.rating_comment || null,
            data.rated_at?.toDate?.() || null,
            data.coupon_code || null,
            data.createdAt?.toDate?.() || new Date()
          ]
        );

        if (orderResult.rows.length === 0) {
          console.error('Failed to insert order:', doc.id);
          continue;
        }

        const orderId = orderResult.rows[0].id;

        // Migrate order items
        if (data.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            // Get product ID
            let productId = null;
            if (item.productId) {
              const productResult = await pool.query(
                'SELECT id FROM products WHERE firebase_id = $1 LIMIT 1',
                [item.productId]
              );
              if (productResult.rows.length > 0) {
                productId = productResult.rows[0].id;
              }
            }

            await pool.query(
              `INSERT INTO order_items (order_id, product_id, product_name, quantity, price, size)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [orderId, productId, item.name || item.productName || '', item.quantity || 1, item.price || 0, item.size || null]
            );
          }
        }
      } catch (error) {
        console.error('Error inserting order:', doc.id, error.message);
        continue;
      }
    }
    console.log(`Migrated ${snapshot.size} orders`);
  } catch (error) {
    console.error('Error migrating orders:', error);
    throw error;
  }
}

async function migrateReviews() {
  console.log('Migrating reviews...');
  
  try {
    const snapshot = await db.collection('reviews').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Get product ID
      let productId = null;
      if (data.productId) {
        const productResult = await pool.query(
          'SELECT id FROM products WHERE firebase_id = $1 LIMIT 1',
          [data.productId]
        );
        if (productResult.rows.length > 0) {
          productId = productResult.rows[0].id;
        }
      }

      // Get user ID
      let userId = null;
      if (data.userId) {
        const userResult = await pool.query(
          'SELECT id FROM users WHERE firebase_uid = $1 LIMIT 1',
          [data.userId]
        );
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;
        }
      }

      await pool.query(
        `INSERT INTO reviews (firebase_id, product_id, product_name, user_id, rating, comment, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (firebase_id) DO UPDATE SET
         rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
        [
          doc.id,
          productId,
          data.productName || '',
          userId,
          data.rating || 5,
          data.comment || '',
          data.createdAt?.toDate?.() || new Date()
        ]
      );
    }
    console.log(`Migrated ${snapshot.size} reviews`);
  } catch (error) {
    console.error('Error migrating reviews:', error);
    throw error;
  }
}

async function migrateCoupons() {
  console.log('Migrating coupons...');
  
  try {
    const snapshot = await db.collection('coupons').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      await pool.query(
        `INSERT INTO coupons (firebase_id, code, discount_percent, discount_fixed, active, used_count, max_uses, valid_from, valid_until, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (firebase_id) DO UPDATE SET
         discount_percent = EXCLUDED.discount_percent, discount_fixed = EXCLUDED.discount_fixed,
         active = EXCLUDED.active, used_count = EXCLUDED.used_count, updated_at = CURRENT_TIMESTAMP`,
        [
          doc.id,
          data.code,
          data.discount_percent || 0,
          data.discount_fixed || null,
          data.active !== false,
          data.usedCount || 0,
          data.maxUses || null,
          data.validFrom?.toDate?.() || null,
          data.validUntil?.toDate?.() || null,
          data.createdAt?.toDate?.() || new Date()
        ]
      );
    }
    console.log(`Migrated ${snapshot.size} coupons`);
  } catch (error) {
    console.error('Error migrating coupons:', error);
    throw error;
  }
}

async function migrateConfig() {
  console.log('Migrating config...');
  
  try {
    const storeDoc = await db.collection('config').doc('store').get();
    if (storeDoc.exists) {
      await pool.query(
        `UPDATE config SET value = $1, updated_at = $2 WHERE key = 'store'`,
        [JSON.stringify(storeDoc.data()), new Date()]
      );
    }

    const flashSalesDoc = await db.collection('config').doc('flash_sales').get();
    if (flashSalesDoc.exists) {
      await pool.query(
        `UPDATE config SET value = $1, updated_at = $2 WHERE key = 'flash_sales'`,
        [JSON.stringify(flashSalesDoc.data()), new Date()]
      );
    }
    console.log('Migrated config');
  } catch (error) {
    console.error('Error migrating config:', error);
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('Starting migration from Firebase to PostgreSQL...');
    
    await migrateUsers();
    await migrateCategories();
    await migrateProducts();
    await migrateOrders();
    await migrateReviews();
    await migrateCoupons();
    await migrateConfig();
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();