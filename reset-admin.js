const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'jefram_stores',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function reset() {
  await client.connect();
  
  // Delete existing admin
  await client.query('DELETE FROM users WHERE role = $1', ['admin']);
  console.log('Deleted existing admin');
  
  // Create new admin with known password
  const password = 'admin123';
  const password_hash = await bcrypt.hash(password, 10);
  
  await client.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
    ['Admin', 'Jeframstore@gmail.com', password_hash, 'admin']
  );
  
  console.log('Created new admin with password:', password);
  await client.end();
}

reset().catch(err => {
  console.error(err);
  client.end();
});