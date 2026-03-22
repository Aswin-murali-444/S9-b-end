/**
 * Reads every active service + category from Supabase and upserts service_season_profile.
 * Only real catalog rows — no invented services.
 *
 *   node scripts/refresh-service-season-profiles.js
 *   npm run refresh-season-profiles
 *
 * Requires: create-service-season-profiles.sql (once).
 * Tune patterns in lib/seasonProfileClassifier.js to match your category names.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { supabase } = require('../lib/supabase');
const { classifyServiceSeason } = require('../lib/seasonProfileClassifier');

const PAGE = 300;

async function fetchCategoriesMap() {
  const map = {};
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('service_categories')
      .select('id, name')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    data.forEach((c) => {
      if (c?.id != null) map[String(c.id)] = c.name || '';
    });
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function fetchServices() {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('services')
      .select('id, name, description, category_id, active')
      .eq('active', true)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function runServiceSeasonProfileRefresh() {
  console.log('[season-profiles] Loading categories + services…');
  const catMap = await fetchCategoriesMap();
  const services = await fetchServices();
  console.log(`[season-profiles] ${services.length} active services, ${Object.keys(catMap).length} categories`);

  const rows = [];
  for (const s of services) {
    const catName = s.category_id != null ? catMap[String(s.category_id)] || '' : '';
    const { primary_phase, match_source } = classifyServiceSeason({
      name: s.name,
      description: s.description,
      categoryName: catName
    });
    rows.push({
      service_id: s.id,
      primary_phase,
      match_source,
      updated_at: new Date().toISOString()
    });
  }

  const BATCH = 80;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('service_season_profile').upsert(chunk, {
      onConflict: 'service_id'
    });
    if (error) throw error;
    console.log(`[season-profiles] Upserted ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }

  const summary = rows.reduce((acc, r) => {
    acc[r.primary_phase] = (acc[r.primary_phase] || 0) + 1;
    return acc;
  }, {});
  console.log('[season-profiles] Done. Counts by phase:', summary);
  return { servicesCount: services.length, summary };
}

if (require.main === module) {
  runServiceSeasonProfileRefresh().catch((e) => {
    console.error('[season-profiles] Failed:', e?.message || e);
    process.exit(1);
  });
}

module.exports = { runServiceSeasonProfileRefresh };
