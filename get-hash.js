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
  .then(() => client.query('SELECT email, password_hash FROM users WHERE role = $1', ['admin']))
  .then(result => {
    console.log('Admin:', result.rows[0].email);
    console.log('Hash:', result.rows[0].password_hash);
    client.end();
  })
  .catch(err => {
    console.error('Error:', err.message);
    client.end();
  });