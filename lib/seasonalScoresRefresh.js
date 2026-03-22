/**
 * Upsert service_seasonal_scores for all services × 12 months.
 * Used by scripts/refresh-service-seasonal-scores.js and the in-process daily cron in index.js.
 */

const { supabase } = require('./supabase');
const {
  computeSeasonScoreForService,
  fingerprintServiceText
} = require('./seasonServiceScoring');

const DEFAULT_BATCH = 400;

async function fetchAllServices() {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('services')
      .select('id, name, description')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function rowsForService(row, country) {
  const id = row.id;
  const name = row.name || '';
  const description = row.description || '';
  const fp = fingerprintServiceText(name, description);
  const out = [];
  for (let month = 1; month <= 12; month += 1) {
    const { multiplier, reasonKey } = computeSeasonScoreForService(
      name,
      description,
      month,
      country
    );
    out.push({
      service_id: id,
      calendar_month: month,
      multiplier,
      reason_key: reasonKey,
      source_text_hash: fp,
      updated_at: new Date().toISOString()
    });
  }
  return out;
}

/**
 * @param {{ dryRun?: boolean, batchSize?: number }} [options]
 * @returns {Promise<{ servicesCount: number, rowsCount: number, dryRun: boolean }>}
 */
async function runSeasonalScoresRefresh(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const batchSize = Number(options.batchSize) > 0 ? Number(options.batchSize) : DEFAULT_BATCH;
  const country = String(process.env.SEASON_SCORE_COUNTRY || 'IN').toUpperCase();

  const services = await fetchAllServices();
  const flat = [];
  for (const s of services) {
    flat.push(...rowsForService(s, country));
  }

  if (dryRun) {
    return {
      servicesCount: services.length,
      rowsCount: flat.length,
      dryRun: true
    };
  }

  for (let i = 0; i < flat.length; i += batchSize) {
    const chunk = flat.slice(i, i + batchSize);
    const { error } = await supabase.from('service_seasonal_scores').upsert(chunk, {
      onConflict: 'service_id,calendar_month'
    });
    if (error) throw error;
  }

  return {
    servicesCount: services.length,
    rowsCount: flat.length,
    dryRun: false
  };
}

module.exports = { runSeasonalScoresRefresh, fetchAllServices };
