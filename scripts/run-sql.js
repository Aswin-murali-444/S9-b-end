/**
 * Run SQL in Supabase without using the SQL Editor.
 * Uses the backend POST /admin/execute-sql endpoint (which calls mcp_execute_sql RPC).
 *
 * Usage:
 *   node scripts/run-sql.js <file.sql>
 *   node scripts/run-sql.js --inline "CREATE TABLE ..."
 *
 * Requires in .env:
 *   ADMIN_SECRET_KEY=your-secret
 *   (Backend must be running and API_BASE_URL defaults to http://localhost:3001)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-sql.js <file.sql>');
  console.error('   or: node scripts/run-sql.js --inline "CREATE TABLE ..."');
  process.exit(1);
}

let sql;
if (args[0] === '--inline' && args[1]) {
  sql = args.slice(1).join(' ');
} else {
  const file = path.isAbsolute(args[0]) ? args[0] : path.join(process.cwd(), args[0]);
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }
  sql = fs.readFileSync(file, 'utf8');
}

sql = sql.trim();
if (!sql) {
  console.error('No SQL to run.');
  process.exit(1);
}

const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';
const adminKey = process.env.ADMIN_SECRET_KEY;
if (!adminKey) {
  console.error('ADMIN_SECRET_KEY is not set in .env');
  process.exit(1);
}

async function run() {
  const url = `${apiBase}/admin/execute-sql`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': adminKey,
    },
    body: JSON.stringify({ sql }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Error:', res.status, data.error || res.statusText);
    if (data.hint) console.error('Hint:', data.hint);
    process.exit(1);
  }
  const result = data.data;
  if (result && result.success === false) {
    console.error('SQL error:', result.error || 'Unknown error');
    if (result.hint) console.error('Hint:', result.hint);
    process.exit(1);
  }
  console.log('OK:', result?.message ?? JSON.stringify(result ?? data.data ?? data));
}

run();
