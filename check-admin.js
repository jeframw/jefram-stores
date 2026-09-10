const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'jefram_stores',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

client.connect()
  .then(() => client.query('SELECT email, role, password_hash IS NOT NULL as has_hash FROM users WHERE role = $1', ['admin']))
  .then(result => {
    console.log('Admins:', result.rows);
    client.end();
  })
  .catch(err => {
    console.error('Error:', err.message);
    client.end();
  });