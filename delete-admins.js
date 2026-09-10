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
  .then(() => client.query('DELETE FROM users WHERE role = $1', ['admin']))
  .then(result => {
    console.log('Deleted', result.rowCount, 'admin user(s)');
    client.end();
  })
  .catch(err => {
    console.error('Error:', err.message);
    client.end();
  });