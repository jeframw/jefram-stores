const { Client } = require('pg');

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  throw new Error('Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL before running this script.');
}

const tableOrder = [
  'users',
  'categories',
  'products',
  'orders',
  'order_items',
  'reviews',
  'coupons',
  'config',
  'delivery_agents'
];

async function copyTable(source, target, table) {
  const result = await source.query(`SELECT * FROM ${table}`);
  if (result.rows.length === 0) {
    console.log(`${table}: 0 rows`);
    return;
  }

  const columns = Object.keys(result.rows[0]);
  const columnList = columns.map((column) => `"${column}"`).join(', ');
  const values = [];

  for (const row of result.rows) {
    const placeholders = columns.map((_, index) => `$${values.length + index + 1}`);
    values.push(...columns.map((column) => row[column]));
    await target.query(
      `INSERT INTO ${table} (${columnList}) VALUES (${placeholders.join(', ')})`,
      values.splice(values.length - columns.length, columns.length)
    );
  }

  console.log(`${table}: ${result.rows.length} rows copied`);
}

async function copyDatabase() {
  const source = new Client({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
  const target = new Client({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });

  try {
    await source.connect();
    await target.connect();
    await target.query('BEGIN');
    await target.query(`TRUNCATE ${tableOrder.join(', ')} RESTART IDENTITY CASCADE`);

    for (const table of tableOrder) {
      await copyTable(source, target, table);
    }

    await target.query('COMMIT');
    console.log('Database copy completed successfully.');
  } catch (error) {
    await target.query('ROLLBACK').catch(() => {});
    console.error('Database copy failed:', error.message);
    process.exitCode = 1;
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

copyDatabase();
