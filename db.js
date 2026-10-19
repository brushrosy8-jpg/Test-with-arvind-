
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL Render mein set nahi hai');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Supabase PostgreSQL connected:', result.rows[0].now);
  } catch (error) {
    console.error('Supabase connection failed:', error.message);
  }
}

testConnection();

module.exports = pool;
