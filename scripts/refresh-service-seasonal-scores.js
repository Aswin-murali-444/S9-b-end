/**
 * Daily job: load all services from the database and upsert seasonal scores
 * for every calendar month (1–12). New services are picked up automatically
 * on the next run.
 *
 * The API server also runs this automatically once per day (see jobs/scheduleSeasonalScores.js).
 *
 * Requires .env (same as backend): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/refresh-service-seasonal-scores.js
 *   node scripts/refresh-service-seasonal-scores.js --dry-run
 *
 * One-time: create table with create-service-seasonal-scores.sql
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runSeasonalScoresRefresh } = require('../lib/seasonalScoresRefresh');

const DRY = process.argv.includes('--dry-run');

async function main() {
  const country = String(process.env.SEASON_SCORE_COUNTRY || 'IN').toUpperCase();
  console.log(
    `[seasonal] Starting refresh country=${country} dryRun=${DRY} at ${new Date().toISOString()}`
  );

  const result = await runSeasonalScoresRefresh({ dryRun: DRY });

  console.log(`[seasonal] Loaded ${result.servicesCount} services`);

  if (DRY) {
    console.log(`[seasonal] Dry run — would upsert ${result.rowsCount} rows (${result.servicesCount} × 12)`);
  } else {
    console.log(
      `[seasonal] Done. Upserted ${result.rowsCount} rows for ${result.servicesCount} services.`
    );
  }
}

main().catch((e) => {
  console.error('[seasonal] Failed:', e?.message || e);
  process.exit(1);
});
