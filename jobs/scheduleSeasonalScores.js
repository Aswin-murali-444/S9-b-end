/**
 * Once per day while the API process is running: refresh service_seasonal_scores.
 * Disable with SEASONAL_SCORES_CRON=false
 */

const cron = require('node-cron');

function scheduleSeasonalScoresCron() {
  const disabled =
    process.env.SEASONAL_SCORES_CRON === '0' ||
    process.env.SEASONAL_SCORES_CRON === 'false' ||
    process.env.DISABLE_SEASONAL_SCORES_CRON === '1';

  if (disabled) {
    console.log('📅 Seasonal scores daily job disabled (SEASONAL_SCORES_CRON=false or DISABLE_SEASONAL_SCORES_CRON=1)');
    return;
  }

  const { runSeasonalScoresRefresh } = require('../lib/seasonalScoresRefresh');
  // 5-field cron: minute hour day-of-month month day-of-week — wall time in SEASONAL_SCORES_TZ
  const expression = process.env.SEASONAL_SCORES_CRON_EXPRESSION || '30 2 * * *';
  const timezone = process.env.SEASONAL_SCORES_TZ || 'Asia/Kolkata';

  cron.schedule(
    expression,
    async () => {
      const started = new Date().toISOString();
      console.log(`[seasonal-cron] refresh started at ${started}`);
      try {
        const result = await runSeasonalScoresRefresh();
        console.log(
          `[seasonal-cron] refresh OK: ${result.servicesCount} services, ${result.rowsCount} rows at ${new Date().toISOString()}`
        );
      } catch (e) {
        console.error('[seasonal-cron] seasonal scores failed:', e?.message || e);
      }
      try {
        const { runServiceSeasonProfileRefresh } = require('../scripts/refresh-service-season-profiles');
        const pr = await runServiceSeasonProfileRefresh();
        console.log('[seasonal-cron] season profiles OK:', pr?.summary || pr);
      } catch (e) {
        console.error('[seasonal-cron] season profiles failed:', e?.message || e);
      }
    },
    { timezone }
  );

  console.log(
    `📅 Seasonal scores refresh scheduled: "${expression}" (${timezone}) — SEASONAL_SCORES_CRON=false to disable`
  );
}

module.exports = { scheduleSeasonalScoresCron };
