/**
 * Create `service_seasonal_scores` without Cursor Supabase MCP or any MCP server.
 *
 * 1) Preferred: direct Postgres via DATABASE_URL (Supabase Dashboard → Project Settings
 *    → Database → Connection string → URI). Use the "Session" or "Direct" URI with the DB password.
 * 2) Fallback: Supabase RPC mcp_execute_sql (if you created it via mcp-execute-any-sql.sql).
 *
 * Usage:
 *   node scripts/create-seasonal-scores-table.js
 *   npm run setup:seasonal-table
 *
 * Env:
 *   DATABASE_URL or SUPABASE_DATABASE_URL — postgresql://... (ssl usually required)
 *   DATABASE_SSL=false — only if you use local Postgres without SSL
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '..', 'create-service-seasonal-scores.sql');

async function runWithPg(connectionString) {
  const { Client } = require('pg');
  const sql = fs.readFileSync(sqlPath, 'utf8').trim();
  if (!sql) throw new Error('Empty SQL file');

  const useSsl = process.env.DATABASE_SSL !== 'false';
  const client = new Client({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function runWithMcpRpc() {
  const { supabase } = require('../lib/supabase');
  const sql = fs.readFileSync(sqlPath, 'utf8').trim();
  const { data, error } = await supabase.rpc('mcp_execute_sql', { p_sql: sql });
  if (error) throw error;
  return data;
}

async function main() {
  if (!fs.existsSync(sqlPath)) {
    console.error('Missing:', sqlPath);
    process.exit(1);
  }

  const conn =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  if (conn) {
    console.log('Applying create-service-seasonal-scores.sql via DATABASE_URL (direct Postgres)...');
    await runWithPg(conn);
    console.log('OK — table created/updated.');
    console.log('\nNext: npm run refresh-seasonal-scores');
    return;
  }

  console.log('No DATABASE_URL / SUPABASE_DATABASE_URL — trying mcp_execute_sql RPC...');
  try {
    const data = await runWithMcpRpc();
    console.log('OK — via Supabase RPC:', JSON.stringify(data, null, 2));
    console.log('\nNext: npm run refresh-seasonal-scores');
  } catch (e) {
    console.error('\nCould not create table.');
    console.error(e?.message || e);
    console.error(`
Add a direct DB URL to S9-b-end/.env (no MCP needed):

  DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

Get it from: Supabase Dashboard → Project Settings → Database → Connection string → URI.
Then run: npm run setup:seasonal-table

Or paste the contents of create-service-seasonal-scores.sql into the Supabase SQL Editor.
`);
    process.exit(1);
  }
}

async function cli() {
  try {
    await main();
  } catch (err) {
    console.error(err?.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = { main, runWithPg, runWithMcpRpc };
