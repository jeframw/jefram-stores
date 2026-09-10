const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'jefram_stores',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function cleanup() {
  await client.connect();
  
  // Delete test product managers
  await client.query("DELETE FROM users WHERE role = 'product_manager' AND email LIKE '%@test.com'");
  console.log('Deleted test product managers');
  
  // Show remaining
  const result = await client.query("SELECT email, role FROM users WHERE role IN ('admin', 'product_manager')");
  console.log('Remaining:', result.rows);
  
  await client.end();
}

cleanup().catch(err => {
  console.error(err);
  client.end();
});