const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../lib/supabase');
const { recommendServicesForUser } = require('../services/mlService');
const {
  getSeasonUiInsight,
  getSeasonalPanelContext,
  rankSeasonalBoostedServices,
  indiaSeasonPhase
} = require('../lib/seasonServiceScoring');

function djb2(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) h = (h << 5) + h + s.charCodeAt(i);
  return h | 0;
}

/** Stable string for Set lookups (avoids UUID case mismatches vs Supabase). */
function normalizeRecServiceId(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  ) {
    return s.toLowerCase();
  }
  return s;
}

/** Which profile phases to show for this calendar month (India). */
function profilePhasesForCalendarMonth(month) {
  const m = Math.max(1, Math.min(12, parseInt(String(month), 10) || 1));
  if (m === 10) return ['monsoon', 'all_year'];
  const p = indiaSeasonPhase(m);
  if (p === 'summer') return ['summer', 'all_year'];
  if (p === 'monsoon') return ['monsoon', 'all_year'];
  if (p === 'winter') return ['winter', 'all_year'];
  return ['neutral', 'all_year'];
}

/** Stable “float” order: changes by user + month + day so different services surface over time. */
function floatOrderIds(ids, rotationKey, cap) {
  const key = String(rotationKey);
  const uniq = [...new Set(ids.map(String))];
  uniq.sort((a, b) => djb2(key + a) - djb2(key + b));
  return uniq.slice(0, Math.max(0, cap));
}

const RECOMMENDATIONS_MAX_QUERY_LIMIT = 36;
const RECOMMENDATIONS_DEFAULT_LIMIT = 12;

/**
 * After ML / popularity, fill remaining slots from the real active catalog with a stable shuffle
 * (user + month + day + salt) so almost every service gets airtime over time — not only booked items.
 */
function appendCatalogFloatRecs({
  allCatalogRows,
  have,
  excludeSet,
  need,
  rotationKey,
  month,
  country
}) {
  const n = Math.max(0, Math.floor(Number(need) || 0));
  if (!n || !Array.isArray(allCatalogRows) || !allCatalogRows.length) return [];

  const haveSet = new Set(
    [...(have instanceof Set ? have : new Set(have))].map(normalizeRecServiceId).filter(Boolean)
  );
  const ex = new Set(
    [...(excludeSet instanceof Set ? excludeSet : new Set(excludeSet))]
      .map(normalizeRecServiceId)
      .filter(Boolean)
  );
  const ids = [];
  for (const row of allCatalogRows) {
    if (!row?.id) continue;
    const id = normalizeRecServiceId(row.id);
    if (!id || haveSet.has(id) || ex.has(id)) continue;
    ids.push(id);
  }
  const picked = floatOrderIds(ids, `${String(rotationKey)}|catalog`, n);
  const byId = new Map(allCatalogRows.map((r) => [normalizeRecServiceId(r.id), r]));
  const out = [];
  for (const id of picked) {
    const row = byId.get(id);
    if (!row) continue;
    const ui = getSeasonUiInsight(row.name, row.description, month, country);
    out.push({
      serviceId: row?.id != null ? String(row.id) : id,
      score: 0.06 - out.length * 0.001,
      insightKey: ui?.insightKey || 'discover',
      insightLabel: ui?.insightLabel || 'Rotating pick from our catalog',
      scoreComponents: { catalog_float: true },
      name: row.name || '',
      description: row.description || '',
      icon_url: row.icon_url || null,
      duration: row.duration,
      price: row.price,
      offer_price: row.offer_price,
      offer_enabled: row.offer_enabled,
      category_id: row.category_id
    });
    haveSet.add(id);
  }
  return out;
}

async function fetchSeasonShelfCandidateIds(supabase, phases, excludeSet) {
  const want = new Set(phases);
  let from = 0;
  const pageSize = 1000;
  const acc = [];
  for (;;) {
    const { data, error } = await supabase
      .from('service_season_profile')
      .select('service_id, primary_phase')
      .range(from, from + pageSize - 1);
    if (error) {
      if (/relation|does not exist/i.test(String(error.message || ''))) {
        console.warn(
          '[recommendations] service_season_profile missing — run create-service-season-profiles.sql and npm run refresh-season-profiles'
        );
      } else {
        console.warn('[recommendations] service_season_profile:', error.message);
      }
      return [];
    }
    if (!data?.length) break;
    for (const r of data) {
      if (!r?.service_id || !want.has(r.primary_phase)) continue;
      const id = normalizeRecServiceId(r.service_id);
      if (!id || excludeSet.has(id)) continue;
      acc.push(id);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return acc;
}

const SERVICES_SELECT_RECOMMENDATIONS =
  'id, category_id, name, description, icon_url, duration, price, offer_price, offer_enabled, active';

/** Treat only explicit “off” as hidden — avoids losing the whole catalog when `active` is false for most rows. */
function rowIsRecommendationCatalogVisible(row) {
  const a = row?.active;
  if (a === false || a === 0) return false;
  if (typeof a === 'string') {
    const s = a.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'inactive' || s === 'no') return false;
  }
  return true;
}

/**
 * Full catalog for ML + season shelf + padding: page all services, filter in JS.
 * PostgREST `.or(active...)` + strict true/NULL was returning tiny sets when most rows use active=false.
 */
async function fetchAllActiveServicesForRecommendations(supabase) {
  const pageSize = 500;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('services')
      .select(SERVICES_SELECT_RECOMMENDATIONS)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.warn('fetchAllActiveServicesForRecommendations:', error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (rowIsRecommendationCatalogVisible(row)) all.push(row);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  if (all.length <= 1) {
    console.warn(
      '[recommendations] Loaded',
      all.length,
      'catalog service(s). Use SUPABASE_SERVICE_ROLE_KEY on the API if you expect more (anon + RLS often hides rows).'
    );
  }
  return all;
}

const MIN_CATALOG_ROWS_TRUST = 3;

/** Prefer in-memory catalog only if it looks complete; otherwise refetch so padding isn’t starved. */
async function resolveRecommendationCatalogRows(allCatalogRows, supabase) {
  if (Array.isArray(allCatalogRows) && allCatalogRows.length >= MIN_CATALOG_ROWS_TRUST) {
    return allCatalogRows;
  }
  if (!supabase) return Array.isArray(allCatalogRows) ? allCatalogRows : [];
  const fresh = await fetchAllActiveServicesForRecommendations(supabase);
  if (fresh.length > 0) return fresh;
  return Array.isArray(allCatalogRows) ? allCatalogRows : [];
}

/**
 * Last-resort fill: fresh `services` read (bypasses stale/wrong in-memory catalog).
 * Hosted issues are often RLS (anon key) → only 1 row; logs a hint when the pool is tiny.
 */
async function forceTopUpRecommendationsIfShort(
  supabase,
  recommendations,
  bookedOnlyExcludeSet,
  limit,
  catalogRotationKey,
  recommendationContext
) {
  const cap = Math.max(1, Number(limit) || RECOMMENDATIONS_DEFAULT_LIMIT);
  let out = Array.isArray(recommendations) ? [...recommendations] : [];
  if (out.length >= cap) return out.slice(0, cap);

  const { data: rows, error } = await supabase
    .from('services')
    .select(SERVICES_SELECT_RECOMMENDATIONS)
    .order('id', { ascending: true })
    .limit(500);

  if (error) {
    console.warn('[recommendations] force top-up query failed:', error.message);
    return out.slice(0, cap);
  }

  const rawCount = (rows || []).length;
  const visible = (rows || []).filter(rowIsRecommendationCatalogVisible);
  if (rawCount <= 1) {
    console.warn(
      '[recommendations] services query returned',
      rawCount,
      'row(s). Set SUPABASE_SERVICE_ROLE_KEY on the API host (not anon) so RLS does not hide catalog rows.'
    );
  }

  const have = new Set(out.map((r) => normalizeRecServiceId(r.serviceId)).filter(Boolean));
  const month = recommendationContext?.month;
  const country =
    recommendationContext?.country_code || recommendationContext?.countryCode || 'IN';
  const more = appendCatalogFloatRecs({
    allCatalogRows: visible,
    have,
    excludeSet: bookedOnlyExcludeSet,
    need: cap - out.length,
    rotationKey: `${String(catalogRotationKey)}|force`,
    month,
    country
  });
  return [...out, ...more].slice(0, cap);
}

/**
 * Season shelf from DB `service_season_profile` (built by refresh script from real services only),
 * rotated daily per user so many catalog items get coverage. Fallback: keyword boosts if table empty.
 * Then append personalized ML picks.
 */
async function composeSeasonFirstRecommendations({
  personalizedRecommendations,
  allCatalogRows,
  recommendationContext,
  bookedOnlyExcludeSet,
  limit,
  supabase,
  popularServices,
  serviceTrends,
  maxPop,
  serviceCategoryById,
  userAffinityCategoryIds,
  rotationUserId
}) {
  const month = recommendationContext?.month;
  const country =
    recommendationContext?.country_code || recommendationContext?.countryCode || 'IN';
  const cap = Math.max(1, Number(limit) || 5);
  const seasonSlots = Math.min(cap, Math.max(2, Math.ceil(cap * 0.5)));

  const phases = profilePhasesForCalendarMonth(month);
  const day = Math.floor(Date.now() / 86400000);
  const rotationKey = `${String(rotationUserId || 'anon')}|${month}|${day}`;

  let candidateIds = await fetchSeasonShelfCandidateIds(supabase, phases, bookedOnlyExcludeSet);
  let shelfIds = floatOrderIds(candidateIds, rotationKey, seasonSlots);

  const catalogRows = await resolveRecommendationCatalogRows(allCatalogRows, supabase);
  const byId = new Map(catalogRows.map((r) => [normalizeRecServiceId(r.id), r]));
  let shelfRows = shelfIds.map((id) => byId.get(normalizeRecServiceId(id))).filter(Boolean);

  // Profiles reference service IDs; if catalog map was empty/wrong, hydrate rows from DB.
  if (shelfRows.length === 0 && shelfIds.length > 0 && supabase) {
    const { data: hydrated, error: hydErr } = await supabase
      .from('services')
      .select(SERVICES_SELECT_RECOMMENDATIONS)
      .in('id', shelfIds);
    if (!hydErr && hydrated?.length) {
      const hmap = new Map(hydrated.map((r) => [normalizeRecServiceId(r.id), r]));
      shelfRows = shelfIds.map((id) => hmap.get(normalizeRecServiceId(id))).filter(Boolean);
    }
  }

  if (shelfRows.length === 0) {
    shelfRows = rankSeasonalBoostedServices(
      catalogRows,
      month,
      country,
      bookedOnlyExcludeSet,
      seasonSlots
    );
  }

  const seasonalRecs = shelfRows.map((row, idx) => {
    const ui = getSeasonUiInsight(row.name, row.description, month, country);
    return {
      serviceId: String(row.id),
      score: 2 - idx * 0.05,
      insightKey: ui?.insightKey || 'seasonal',
      insightLabel: ui?.insightLabel || 'Picked for this season (from your catalog)',
      scoreComponents: { seasonal_shelf: true, seasonal_float: true },
      name: row.name || '',
      description: row.description || '',
      icon_url: row.icon_url || null,
      duration: row.duration,
      price: row.price,
      offer_price: row.offer_price,
      offer_enabled: row.offer_enabled,
      category_id: row.category_id
    };
  });

  const have = new Set(seasonalRecs.map((r) => normalizeRecServiceId(r.serviceId)).filter(Boolean));
  const pers = (personalizedRecommendations || []).filter(
    (r) =>
      r?.serviceId &&
      !have.has(normalizeRecServiceId(r.serviceId)) &&
      !bookedOnlyExcludeSet.has(normalizeRecServiceId(r.serviceId))
  );

  let merged = [...seasonalRecs, ...pers].slice(0, cap);

  if (merged.length < cap) {
    merged = await padRecommendationsToLimit(
      supabase,
      merged,
      bookedOnlyExcludeSet,
      cap,
      popularServices,
      serviceTrends,
      maxPop,
      serviceCategoryById,
      userAffinityCategoryIds,
      catalogRows,
      rotationKey,
      recommendationContext
    );
  }

  return merged;
}

function withSeasonalPresentation(recommendations, recommendationContext, body) {
  const month = recommendationContext?.month;
  const country =
    recommendationContext?.country_code || recommendationContext?.countryCode || 'IN';
  const panel = getSeasonalPanelContext(month, country);
  const recs = (recommendations || []).map((r) => {
    const ui = getSeasonUiInsight(r.name, r.description, month, country);
    if (!ui) return r;
    return { ...r, insightKey: ui.insightKey, insightLabel: ui.insightLabel };
  });
  return { ...body, recommendations: recs, seasonalContext: panel };
}

/**
 * Booking momentum per service: last 7 days vs previous 7 days (platform trend signal).
 */
function buildServiceTrendsFromRows(rows) {
  const trends = {};
  if (!Array.isArray(rows)) return trends;
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const recentStart = now - 7 * DAY;
  const priorStart = now - 14 * DAY;

  for (const b of rows) {
    if (!b?.service_id || !b?.created_at) continue;
    const sid = normalizeRecServiceId(b.service_id);
    if (!sid) continue;
    const ts = new Date(b.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    if (!trends[sid]) trends[sid] = { recent: 0, prior: 0 };
    if (ts >= recentStart) trends[sid].recent += 1;
    else if (ts >= priorStart && ts < recentStart) trends[sid].prior += 1;
  }
  return trends;
}

/**
 * Calendar month (1–12) for seasonal ML rules. Defaults to Asia/Kolkata (IST).
 * Optional query: `month`, `calendar_month`, or `calendarMonth` (e.g. demo monsoon).
 */
function getRecommendationContextMonth(req) {
  const raw =
    req.query.month ?? req.query.calendar_month ?? req.query.calendarMonth;
  if (raw != null && raw !== '') {
    const m = parseInt(String(raw), 10);
    if (m >= 1 && m <= 12) return m;
  }
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'numeric'
  });
  const mo = parseInt(fmt.format(now), 10);
  return Number.isFinite(mo) && mo >= 1 && mo <= 12 ? mo : new Date().getUTCMonth() + 1;
}

/** Only pad / surface services with real demand: booked in sample or activity in trend windows */
function hasRecommendationEvidence(serviceId, bookingCount, trends) {
  const c = Number(bookingCount) || 0;
  if (c >= 1) return true;
  const t = trends[String(serviceId)] || { recent: 0, prior: 0 };
  return Number(t.recent || 0) + Number(t.prior || 0) >= 1;
}

function fallbackInsight(serviceId, trends, popCount, maxPop) {
  const t = trends[String(serviceId)] || { recent: 0, prior: 0 };
  const mom = (t.recent + 0.5) / (t.prior + 0.5);
  const popNorm = maxPop > 0 ? popCount / maxPop : 0;
  if (t.recent >= 2 && mom >= 1.4) {
    return { insightKey: 'trending', insightLabel: 'Trending this week' };
  }
  if (t.recent >= 3) {
    return { insightKey: 'high_demand', insightLabel: 'High demand lately' };
  }
  if (mom >= 1.25 && t.recent >= 1) {
    return { insightKey: 'rising', insightLabel: 'Rising interest' };
  }
  if (popNorm >= 0.65) {
    return { insightKey: 'popular', insightLabel: 'Popular with customers' };
  }
  return { insightKey: 'popular', insightLabel: 'Popular right now' };
}

/**
 * When ML returns fewer than `targetCount` (e.g. small booking sample + many prefs excluded),
 * pad with next-best popular services, then catalog float so the grid fills from real DB services.
 */
async function backfillRecommendationsEnriched(
  supabase,
  recommendations,
  targetCount,
  popularServices,
  excludeSet,
  serviceTrends,
  maxPop,
  allCatalogRows = null,
  catalogRotationKey = null,
  recommendationContext = null
) {
  const cap = Math.max(1, Number(targetCount) || 5);
  let base = Array.isArray(recommendations) ? [...recommendations] : [];
  if (base.length >= cap) return base.slice(0, cap);

  const have = new Set(base.map((r) => String(r.serviceId)));
  const sorted = [...(popularServices || [])].sort(
    (a, b) => (Number(b.count) || 0) - (Number(a.count) || 0)
  );
  const want = cap - base.length;
  const idQueue = [];
  for (const p of sorted) {
    if (idQueue.length >= want) break;
    const sid = String(p.service_id);
    if (!sid || excludeSet.has(sid) || have.has(sid)) continue;
    const cnt = Number(p.count) || 0;
    if (!hasRecommendationEvidence(sid, cnt, serviceTrends)) continue;
    have.add(sid);
    idQueue.push({ sid, count: cnt });
  }

  let extra = [];
  if (idQueue.length) {
    const { data: serviceRows } = await supabase
      .from('services')
      .select('id, name, description, icon_url, duration, price, offer_price, offer_enabled, category_id')
      .in(
        'id',
        idQueue.map((x) => x.sid)
      );

    const serviceById = {};
    (serviceRows || []).forEach((s) => {
      serviceById[String(s.id)] = s;
    });

    extra = idQueue.map(({ sid, count }) => {
      const s = serviceById[sid] || {};
      const ins = fallbackInsight(sid, serviceTrends, count, maxPop);
      return {
        serviceId: sid,
        score: count > 0 ? count * 0.001 : 0.01,
        insightKey: ins.insightKey,
        insightLabel: ins.insightLabel,
        scoreComponents: null,
        name: s.name || '',
        description: s.description || '',
        icon_url: s.icon_url || null,
        duration: s.duration,
        price: s.price,
        offer_price: s.offer_price,
        offer_enabled: s.offer_enabled,
        category_id: s.category_id
      };
    });
  }

  let result = [...base, ...extra];
  if (result.length < cap && catalogRotationKey) {
    const catalogRows = await resolveRecommendationCatalogRows(allCatalogRows, supabase);
    if (catalogRows?.length) {
      const month = recommendationContext?.month;
      const country =
        recommendationContext?.country_code || recommendationContext?.countryCode || 'IN';
      const have2 = new Set(result.map((r) => normalizeRecServiceId(r.serviceId)).filter(Boolean));
      const floatMore = appendCatalogFloatRecs({
        allCatalogRows: catalogRows,
        have: have2,
        excludeSet,
        need: cap - result.length,
        rotationKey: `${catalogRotationKey}|backfill`,
        month,
        country
      });
      result = [...result, ...floatMore];
    }
  }

  return result.slice(0, cap);
}

/**
 * Top-up: popularity (booked/trend evidence), then catalog float from DB so `limit` is met.
 */
async function padRecommendationsToLimit(
  supabase,
  recommendations,
  excludeSet,
  cap,
  popularServices,
  serviceTrends,
  maxPop,
  serviceCategoryById,
  userAffinityCategoryIds,
  allCatalogRows = null,
  catalogRotationKey = null,
  recommendationContext = null
) {
  const limit = Math.max(1, Number(cap) || 5);
  let out = Array.isArray(recommendations) ? [...recommendations] : [];
  const have = new Set(out.map((r) => normalizeRecServiceId(r.serviceId)).filter(Boolean));

  const affinity = new Set((userAffinityCategoryIds || []).map(String).filter(Boolean));
  const scorePopular = () =>
    (popularServices || [])
      .map((p) => {
        const sid = normalizeRecServiceId(p.service_id);
        if (!sid || excludeSet.has(sid) || have.has(sid)) return null;
        const cnt = Number(p.count) || 0;
        if (!hasRecommendationEvidence(sid, cnt, serviceTrends)) return null;
        const t = serviceTrends[sid] || { recent: 0, prior: 0 };
        const recent = Number(t.recent || 0);
        const prior = Number(t.prior || 0);
        const cat = serviceCategoryById[sid];
        const catStr = cat != null && cat !== '' ? String(cat) : '';
        let score = cnt + recent * 8 + prior * 2;
        if (catStr && !affinity.has(catStr)) score += 12;
        return { sid, count: cnt, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

  while (out.length < limit) {
    const need = limit - out.length;
    const ranked = scorePopular();
    const batch = ranked.slice(0, need);
    if (!batch.length) break;
    const lenBefore = out.length;
    const { data: serviceRows } = await supabase
      .from('services')
      .select('id, name, description, icon_url, duration, price, offer_price, offer_enabled, category_id')
      .in(
        'id',
        batch.map((b) => b.sid)
      );
    const byId = {};
    (serviceRows || []).forEach((s) => {
      byId[normalizeRecServiceId(s.id)] = s;
    });
    for (const { sid, count } of batch) {
      if (out.length >= limit) break;
      if (excludeSet.has(sid) || have.has(sid)) continue;
      const s = byId[sid] || {};
      const ins = fallbackInsight(sid, serviceTrends, count, maxPop);
      have.add(sid);
      out.push({
        serviceId: s.id != null ? String(s.id) : sid,
        score: count * 0.001 + 0.015,
        insightKey: ins.insightKey,
        insightLabel: ins.insightLabel,
        scoreComponents: null,
        name: s.name || '',
        description: s.description || '',
        icon_url: s.icon_url || null,
        duration: s.duration,
        price: s.price,
        offer_price: s.offer_price,
        offer_enabled: s.offer_enabled,
        category_id: s.category_id
      });
    }
    if (out.length === lenBefore) break;
  }

  if (out.length < limit && catalogRotationKey) {
    const catalogRows = await resolveRecommendationCatalogRows(allCatalogRows, supabase);
    if (catalogRows?.length) {
      const month = recommendationContext?.month;
      const country =
        recommendationContext?.country_code || recommendationContext?.countryCode || 'IN';
      const floatRecs = appendCatalogFloatRecs({
        allCatalogRows: catalogRows,
        have,
        excludeSet,
        need: limit - out.length,
        rotationKey: `${catalogRotationKey}|pad`,
        month,
        country
      });
      out = [...out, ...floatRecs];
    }
  }

  return out.slice(0, limit);
}

// List services with category information
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('services')
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        category_id,
        rating,
        review_count,
        service_categories!inner(
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message || 'Failed to fetch services' });

    // Format the response to include category name
    const formattedServices = Array.isArray(data) ? data.map(service => ({
      ...service,
      service_category_id: service.category_id || service.service_categories?.id || null,
      category_name: service.service_categories?.name || 'Unknown'
    })) : [];

    res.json(formattedServices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Hosted debug: how many `services` rows this API can see (compare local vs Render). */
router.get('/catalog-meta', async (req, res) => {
  try {
    const client = supabaseAdmin || supabase;
    const { count, error } = await client
      .from('services')
      .select('id', { count: 'exact', head: true });
    res.json({
      supabaseServiceRoleConfigured: Boolean(supabaseAdmin),
      servicesVisibleCount: count,
      queryError: error?.message || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'catalog-meta failed' });
  }
});

/**
 * Side-by-side local vs hosted checks (no secrets). Open local + prod URLs and compare JSON.
 */
router.get('/diagnostics', async (req, res) => {
  try {
    let supabaseHost = '';
    try {
      supabaseHost = new URL(process.env.SUPABASE_URL || 'http://x').hostname || '';
    } catch {
      supabaseHost = '';
    }
    let mlHost = '';
    try {
      const raw = String(process.env.ML_SERVICE_URL || '').trim();
      if (raw) mlHost = new URL(raw).hostname || '';
    } catch {
      mlHost = '';
    }
    const client = supabaseAdmin || supabase;
    const { count, error } = await client
      .from('services')
      .select('id', { count: 'exact', head: true });

    const mlLocal =
      !mlHost ||
      /^(localhost|127\.0\.0\.1)$/i.test(mlHost) ||
      mlHost.endsWith('.local');

    res.json({
      supabaseServiceRoleConfigured: Boolean(supabaseAdmin),
      supabaseProjectHost: supabaseHost || null,
      servicesVisibleCount: count,
      servicesQueryError: error?.message || null,
      nodeEnv: process.env.NODE_ENV || null,
      mlServiceHost: mlHost || null,
      mlServiceHostIsUnreachableFromHosted: mlLocal,
      checks: {
        sameSupabaseAsLocal:
          'Compare supabaseProjectHost with your local /services/diagnostics — must match.',
        serviceRoleOnHosted:
          'supabaseServiceRoleConfigured must be true on production API.',
        catalogCount:
          'servicesVisibleCount should match Supabase Table Editor row count (visible services).',
        mlOnHosted:
          mlLocal
            ? 'ML_SERVICE_URL looks local — Render cannot reach it; recommendations differ vs laptop.'
            : 'ML host looks non-local — OK if that URL is reachable from the API host.'
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'diagnostics failed' });
  }
});

// Recommend services for a user (for dashboards / booking page)
router.get('/user/:userId/recommendations', async (req, res) => {
  try {
    /** Always use service role here when available — anon + RLS often returns 1 service row on hosted. */
    const dbRec = supabaseAdmin || supabase;
    if (!supabaseAdmin) {
      console.warn(
        '[recommendations] supabaseAdmin unavailable (set SUPABASE_SERVICE_ROLE_KEY on the host). Using default client; catalog may be truncated by RLS.'
      );
    }

    const { userId } = req.params;
    const rawLimit = parseInt(String(req.query.limit || RECOMMENDATIONS_DEFAULT_LIMIT), 10);
    const limit = Math.min(
      RECOMMENDATIONS_MAX_QUERY_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : RECOMMENDATIONS_DEFAULT_LIMIT)
    );
    const currentServiceId = req.query.currentServiceId || req.query.current_service_id || null;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Resolve auth UID <-> public.users.id. Bookings usually store public.users.id, while
    // the dashboard passes Supabase Auth user.id — a failed lookup leaves exclusions empty
    // and users see already-booked services as the only "recommendation".
    let resolvedUserId = userId;
    const bookingUserIds = new Set();
    if (userId != null && String(userId).trim() !== '') {
      bookingUserIds.add(String(userId).trim());
    }
    try {
      const { data: byAuth, error: authErr } = await dbRec
        .from('users')
        .select('id')
        .eq('auth_user_id', userId)
        .maybeSingle();
      if (!authErr && byAuth?.id) {
        resolvedUserId = String(byAuth.id);
        bookingUserIds.add(String(byAuth.id));
      }
    } catch (e) {
      /* ignore */
    }
    try {
      const { data: byPk } = await dbRec
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (byPk?.id) {
        resolvedUserId = String(byPk.id);
        bookingUserIds.add(String(byPk.id));
      }
    } catch (e) {
      /* ignore */
    }

    const uidListForBookings = [...bookingUserIds].filter(Boolean);

    // Fetch this user's recent booking history (any matching user id key)
    const { data: userBookings, error: userErr } = await dbRec
      .from('bookings')
      .select('id, user_id, service_id')
      .in('user_id', uidListForBookings.length ? uidListForBookings : [resolvedUserId])
      .neq('booking_status', 'cancelled')
      .not('service_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (userErr) {
      console.error('Error fetching user bookings for recommendations:', userErr);
      return res.status(500).json({ error: 'Failed to fetch user bookings' });
    }

    const bookedServiceIds = [
      ...new Set(
        (userBookings || [])
          .map((b) => normalizeRecServiceId(b.service_id))
          .filter(Boolean)
      )
    ];

    // Profile for ML: bookings (and later preferences). Exclusion from *results* uses booked only
    // so users can see new services to book — not only repeats of what they already booked.
    let userHistory = [...bookedServiceIds];

    const isUuid = (v) =>
      typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

    // Cold-start fallback: if the user has no booking history yet,
    // use onboarding preferences from customer_details.preferred_services.
    if (userHistory.length === 0) {
      try {
        const { data: customerRow, error: customerErr } = await dbRec
          .from('customer_details')
          .select('preferred_services')
          .eq('id', resolvedUserId)
          .maybeSingle();

        if (!customerErr && customerRow?.preferred_services) {
          const rawPrefs = Array.isArray(customerRow.preferred_services)
            ? customerRow.preferred_services
            : [];

          const prefStrings = rawPrefs.filter(Boolean).map((x) => String(x));
          if (prefStrings.length > 0) {
            const uuidPrefs = prefStrings.filter(isUuid);
            const namePrefs = prefStrings.filter((p) => !isUuid(p));

            // If preferences already look like service IDs, use them directly.
            if (uuidPrefs.length === prefStrings.length) {
              userHistory = uuidPrefs;
            } else if (namePrefs.length > 0) {
              // Map service names -> service IDs (best-effort for older/onboarding docs).
              const serviceRows = await dbRec
                .from('services')
                .select('id, name')
                .in('name', namePrefs);

              const byName = {};
              (serviceRows || []).forEach((s) => {
                if (s?.name) byName[s.name] = s.id;
              });

              const mappedByName = namePrefs.map((n) => byName[n]).filter(Boolean);
              userHistory = [...new Set([...uuidPrefs, ...mappedByName])];
            } else {
              userHistory = uuidPrefs;
            }
          }
        }
      } catch (e) {
        // Non-blocking: ML will fall back to popularity if userHistory stays empty.
        console.warn('Cold-start preferred_services fallback failed:', e?.message || e);
      }
    } else {
      // Has bookings: still merge onboarding preferences into ML profile only (not into exclusion).
      try {
        const { data: customerRow, error: customerErr } = await dbRec
          .from('customer_details')
          .select('preferred_services')
          .eq('id', resolvedUserId)
          .maybeSingle();

        if (!customerErr && customerRow?.preferred_services) {
          const rawPrefs = Array.isArray(customerRow.preferred_services)
            ? customerRow.preferred_services
            : [];
          const prefStrings = rawPrefs.filter(Boolean).map((x) => String(x));
          if (prefStrings.length > 0) {
            const uuidPrefs = prefStrings.filter(isUuid);
            const namePrefs = prefStrings.filter((p) => !isUuid(p));
            let extra = [];
            if (uuidPrefs.length === prefStrings.length) {
              extra = uuidPrefs;
            } else if (namePrefs.length > 0) {
              const serviceRows = await dbRec
                .from('services')
                .select('id, name')
                .in('name', namePrefs);
              const byName = {};
              (serviceRows || []).forEach((s) => {
                if (s?.name) byName[s.name] = s.id;
              });
              const mappedByName = namePrefs.map((n) => byName[n]).filter(Boolean);
              extra = [...uuidPrefs, ...mappedByName];
            } else {
              extra = uuidPrefs;
            }
            userHistory = [...new Set([...userHistory.map(String), ...extra.map(String)])];
          }
        }
      } catch (e) {
        console.warn('preferred_services profile merge failed:', e?.message || e);
      }
    }

    userHistory = [...new Set(userHistory.map((x) => normalizeRecServiceId(x)).filter(Boolean))];

    // Fetch a global sample of bookings to build co-occurrence and popularity
    const { data: globalBookings, error: globalErr } = await dbRec
      .from('bookings')
      .select('user_id, service_id')
      .neq('booking_status', 'cancelled')
      .not('service_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1000);

    if (globalErr) {
      console.error('Error fetching global bookings for recommendations:', globalErr);
      return res.status(500).json({ error: 'Failed to fetch global bookings' });
    }

    const globalCooccurrence = {};
    const popularityCounts = {};
    const bookingsByUser = {};

    for (const b of globalBookings || []) {
      if (!b.user_id || !b.service_id) continue;
      const uid = String(b.user_id);
      const sid = normalizeRecServiceId(b.service_id);
      if (!sid) continue;
      if (!bookingsByUser[uid]) bookingsByUser[uid] = [];
      bookingsByUser[uid].push(sid);
      popularityCounts[sid] = (popularityCounts[sid] || 0) + 1;
    }

    // Build co-occurrence matrix at user level (services that co-occur for same user)
    Object.values(bookingsByUser).forEach((serviceList) => {
      const uniqueServices = Array.from(new Set(serviceList));
      for (let i = 0; i < uniqueServices.length; i += 1) {
        for (let j = 0; j < uniqueServices.length; j += 1) {
          if (i === j) continue;
          const a = uniqueServices[i];
          const b = uniqueServices[j];
          if (!globalCooccurrence[a]) globalCooccurrence[a] = {};
          globalCooccurrence[a][b] = (globalCooccurrence[a][b] || 0) + 1;
        }
      }
    });

    // ML popularity list: only services with at least one booking in sample (no never-booked filler)
    const popularServices = Object.entries(popularityCounts)
      .filter(([, c]) => Number(c) >= 1)
      .sort(([, aCount], [, bCount]) => bCount - aCount)
      .map(([serviceId, count]) => ({ service_id: serviceId, count }));

    // Full active catalog: ML text map + season-first shelf (this month’s AC, painting, etc.)
    let allCatalogRows = [];
    const serviceCategoryById = {};
    const serviceTextById = {};
    try {
      allCatalogRows = await fetchAllActiveServicesForRecommendations(dbRec);
      for (const row of allCatalogRows) {
        if (row?.id == null) continue;
        const sid = normalizeRecServiceId(row.id);
        if (!sid) continue;
        serviceCategoryById[sid] =
          row.category_id != null ? String(row.category_id) : '';
        const bits = [row.name, row.description].filter(Boolean).map((x) => String(x));
        if (bits.length) serviceTextById[sid] = bits.join(' ').toLowerCase();
      }
    } catch (e) {
      console.warn('Recommendation catalog load skipped:', e?.message || e);
    }

    const recommendationContext = {
      month: getRecommendationContextMonth(req),
      country_code: req.query.country_code || req.query.countryCode || 'IN'
    };

    // Daily job table service_seasonal_scores (optional): overrides keyword season rules per service/month
    try {
      const month = recommendationContext.month;
      const seasonScoresByServiceId = {};
      let from = 0;
      const pageSize = 1000;
      for (;;) {
        const { data: scoreRows, error: scoreErr } = await dbRec
          .from('service_seasonal_scores')
          .select('service_id, multiplier, reason_key')
          .eq('calendar_month', month)
          .range(from, from + pageSize - 1);
        if (scoreErr) {
          if (scoreErr.code === '42P01' || /relation|does not exist/i.test(scoreErr.message || '')) {
            console.warn(
              'service_seasonal_scores table missing; run create-service-seasonal-scores.sql and npm run refresh-seasonal-scores'
            );
          } else {
            console.warn('service_seasonal_scores query failed:', scoreErr.message);
          }
          break;
        }
        if (!scoreRows || scoreRows.length === 0) break;
        for (const r of scoreRows) {
          if (r?.service_id == null) continue;
          seasonScoresByServiceId[String(r.service_id)] = {
            multiplier: Number(r.multiplier),
            reason_key: r.reason_key != null ? String(r.reason_key) : null
          };
        }
        if (scoreRows.length < pageSize) break;
        from += pageSize;
      }
      if (Object.keys(seasonScoresByServiceId).length > 0) {
        recommendationContext.season_scores_by_service_id = seasonScoresByServiceId;
      }
    } catch (e) {
      console.warn('service_seasonal_scores load skipped:', e?.message || e);
    }

    const userAffinityCategoryIds = [
      ...new Set(
        userHistory
          .map((hid) => serviceCategoryById[String(hid)])
          .filter((x) => x != null && x !== '')
      )
    ];

    // Trend windows: last 14 days of bookings (for ML momentum: recent 7d vs prior 7d)
    let serviceTrends = {};
    try {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: trendRows, error: trendErr } = await dbRec
        .from('bookings')
        .select('service_id, created_at')
        .neq('booking_status', 'cancelled')
        .not('service_id', 'is', null)
        .gte('created_at', fourteenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(8000);

      if (!trendErr && trendRows) {
        serviceTrends = buildServiceTrendsFromRows(trendRows);
      }
    } catch (e) {
      console.warn('Service trend aggregation skipped:', e?.message || e);
    }

    const maxPop = popularServices.length
      ? Math.max(...popularServices.map((p) => Number(p.count) || 0), 1)
      : 1;

    const bookedOnlyExcludeSet = new Set(
      bookedServiceIds.map((id) => normalizeRecServiceId(id)).filter(Boolean)
    );
    const catalogFloatDay = Math.floor(Date.now() / 86400000);
    const catalogRotationKey = `${String(resolvedUserId)}|${recommendationContext.month}|${catalogFloatDay}`;
    const stripAlreadyBooked = (recs) =>
      (recs || []).filter(
        (r) =>
          r?.serviceId != null &&
          !bookedOnlyExcludeSet.has(normalizeRecServiceId(r.serviceId))
      );

    // Avoid over-narrowing CF: onboarding anchor + booking history double-weights one service.
    // Once the user has real bookings, history alone is enough for personalization.
    const currentServiceIdForMl =
      bookedServiceIds.length > 0 ? null : currentServiceId;

    const payload = {
      user_id: resolvedUserId,
      current_service_id: currentServiceIdForMl,
      user_history: userHistory,
      exclude_service_ids: [...bookedOnlyExcludeSet],
      global_cooccurrence: globalCooccurrence,
      popular_services: popularServices,
      service_trends: serviceTrends,
      service_category_ids: serviceCategoryById,
      user_affinity_category_ids: userAffinityCategoryIds,
      service_text_by_id: serviceTextById,
      recommendation_context: recommendationContext,
      limit: Number.isFinite(limit) && limit > 0 ? limit : RECOMMENDATIONS_DEFAULT_LIMIT
    };

    const applyDiversity = async (recs) => {
      let r = stripAlreadyBooked(recs);
      r = await composeSeasonFirstRecommendations({
        personalizedRecommendations: r,
        allCatalogRows,
        recommendationContext,
        bookedOnlyExcludeSet,
        limit: payload.limit,
        supabase: dbRec,
        popularServices,
        serviceTrends,
        maxPop,
        serviceCategoryById,
        userAffinityCategoryIds,
        rotationUserId: resolvedUserId
      });
      return stripAlreadyBooked(r);
    };

    const finalizeRecs = async (list) =>
      forceTopUpRecommendationsIfShort(
        dbRec,
        list,
        bookedOnlyExcludeSet,
        payload.limit,
        catalogRotationKey,
        recommendationContext
      );

    const { data: mlData, error: mlError } = await recommendServicesForUser(payload);

    if (mlError || !mlData) {
      console.error('ML recommend-services failed, falling back to popularity:', mlError);
      // Simple popularity-based fallback excluding already used services
      const usedSet = bookedOnlyExcludeSet;
      const fallback = popularServices
        .filter((p) => !usedSet.has(normalizeRecServiceId(p.service_id)))
        .slice(0, payload.limit)
        .map((p) => ({
          service_id: p.service_id,
          score: p.count
        }));

      if (!fallback.length) {
        const paddedNone = await backfillRecommendationsEnriched(
          dbRec,
          [],
          payload.limit,
          popularServices,
          usedSet,
          serviceTrends,
          maxPop,
          allCatalogRows,
          catalogRotationKey,
          recommendationContext
        );
        return res.json(
          withSeasonalPresentation(
            await finalizeRecs(await applyDiversity(paddedNone)),
            recommendationContext,
            {
              userId,
              currentServiceId,
              usedMlService: false,
              trendSignalAvailable: Object.keys(serviceTrends).length > 0
            }
          )
        );
      }

      const serviceIds = fallback.map((r) => r.service_id);
      const { data: serviceRows } = await dbRec
        .from('services')
        .select('id, name, description, icon_url, duration, price, offer_price, offer_enabled, category_id')
        .in('id', serviceIds);

      const serviceById = {};
      (serviceRows || []).forEach((s) => {
        serviceById[s.id] = s;
      });

      const recommendations = fallback.map((r) => {
        const s = serviceById[r.service_id] || {};
        const ins = fallbackInsight(r.service_id, serviceTrends, Number(r.score) || 0, maxPop);
        return {
          serviceId: r.service_id,
          score: r.score,
          insightKey: ins.insightKey,
          insightLabel: ins.insightLabel,
          scoreComponents: null,
          name: s.name || '',
          description: s.description || '',
          icon_url: s.icon_url || null,
          duration: s.duration,
          price: s.price,
          offer_price: s.offer_price,
          offer_enabled: s.offer_enabled,
          category_id: s.category_id
        };
      });

      const padded = await backfillRecommendationsEnriched(
        dbRec,
        recommendations,
        payload.limit,
        popularServices,
        bookedOnlyExcludeSet,
        serviceTrends,
        maxPop,
        allCatalogRows,
        catalogRotationKey,
        recommendationContext
      );

      return res.json(
        withSeasonalPresentation(await finalizeRecs(await applyDiversity(padded)), recommendationContext, {
          userId,
          currentServiceId,
          usedMlService: false,
          trendSignalAvailable: Object.keys(serviceTrends).length > 0
        })
      );
    }

    const recommendedList = mlData.recommendations || [];

    if (!recommendedList.length) {
      const paddedEmpty = await backfillRecommendationsEnriched(
        dbRec,
        [],
        payload.limit,
        popularServices,
        bookedOnlyExcludeSet,
        serviceTrends,
        maxPop,
        allCatalogRows,
        catalogRotationKey,
        recommendationContext
      );
      return res.json(
        withSeasonalPresentation(await finalizeRecs(await applyDiversity(paddedEmpty)), recommendationContext, {
          userId,
          currentServiceId,
          usedMlService: true,
          trendSignalAvailable: Object.keys(serviceTrends).length > 0
        })
      );
    }

    const serviceIds = recommendedList.map((r) => r.service_id);
    const { data: serviceRows } = await dbRec
      .from('services')
      .select('id, name, description, icon_url, duration, price, offer_price, offer_enabled, category_id')
      .in('id', serviceIds);

    const serviceById = {};
    (serviceRows || []).forEach((s) => {
      serviceById[s.id] = s;
    });

    let recommendations = recommendedList.map((r) => {
      const s = serviceById[r.service_id] || {};
      return {
        serviceId: r.service_id,
        score: r.score,
        insightKey: r.insight_key || null,
        insightLabel: r.insight_label || null,
        scoreComponents: r.components || null,
        name: s.name || '',
        description: s.description || '',
        icon_url: s.icon_url || null,
        duration: s.duration,
        price: s.price,
        offer_price: s.offer_price,
        offer_enabled: s.offer_enabled,
        category_id: s.category_id
      };
    });

    recommendations = await backfillRecommendationsEnriched(
      dbRec,
      recommendations,
      payload.limit,
      popularServices,
      bookedOnlyExcludeSet,
      serviceTrends,
      maxPop,
      allCatalogRows,
      catalogRotationKey,
      recommendationContext
    );

    recommendations = await applyDiversity(recommendations);

    return res.json(
      withSeasonalPresentation(await finalizeRecs(recommendations), recommendationContext, {
        userId,
        currentServiceId,
        usedMlService: true,
        trendSignalAvailable: Object.keys(serviceTrends).length > 0
      })
    );
  } catch (error) {
    console.error('Get service recommendations error:', error);
    return res.status(500).json({ error: 'Failed to get service recommendations' });
  }
});

// Check service name availability
router.post('/check-name', async (req, res) => {
  try {
    const { name, categoryId, excludeId } = req.body || {};
    
    if (!name || !categoryId) {
      return res.status(400).json({ error: 'Name and category ID are required' });
    }

    const normalizedName = String(name).trim();
    
    // Check if service name exists in the same category
    let query = supabase
      .from('services')
      .select('id, name')
      .eq('category_id', categoryId)
      .ilike('name', normalizedName);
    
    // Exclude current service when editing
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data: existingService, error } = await query.single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      return res.status(500).json({ error: 'Database error' });
    }
    
    const isAvailable = !existingService;
    
    res.json({ 
      available: isAvailable,
      message: isAvailable ? 'Service name is available' : 'Service name already exists in this category'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create service
router.post('/', async (req, res) => {
  try {
    const { categoryId, name, description, iconBase64, iconFileName, iconMimeType, duration, price, offerPrice, offerPercentage, offerEnabled, serviceType = 'individual', active = true } = req.body || {};
    
    console.log('Received service data:', { categoryId, name, duration, price, offerPrice, offerPercentage, offerEnabled });
    
    if (!categoryId || !name || !String(name).trim()) {
      return res.status(400).json({ error: 'Category ID and service name are required' });
    }

    const normalizedName = String(name).trim();
    
    // Check if category exists
    const { data: categoryData, error: categoryError } = await supabase
      .from('service_categories')
      .select('id, name')
      .eq('id', categoryId)
      .single();
    
    if (categoryError || !categoryData) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }

    // Check for duplicate service name within category
    const { data: existingService, error: duplicateError } = await supabase
      .from('services')
      .select('id')
      .eq('category_id', categoryId)
      .ilike('name', normalizedName)
      .single();
    
    if (existingService) {
      return res.status(409).json({ error: 'Service name already exists in this category' });
    }

    // Handle icon upload to Supabase Storage
    let iconUrl = null;
    if (iconBase64 && iconFileName && iconMimeType) {
      try {
        const bucket = 'service_images';
        const ext = (String(iconFileName).split('.').pop() || 'png').toLowerCase();
        const nameSlug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 40) || 'service';
        const objectKey = `${nameSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const buffer = Buffer.from(iconBase64, 'base64');
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectKey, buffer, { 
            contentType: iconMimeType, 
            upsert: true, 
            cacheControl: '3600' 
          });

        if (uploadError) {
          console.error('Service icon upload failed:', uploadError);
          return res.status(500).json({ error: uploadError.message || 'Failed to upload service icon' });
        }

        const { data: publicData } = supabase.storage
          .from(bucket)
          .getPublicUrl(objectKey);
        iconUrl = publicData?.publicUrl || null;
      } catch (uploadErr) {
        console.error('Icon upload error:', uploadErr);
        return res.status(500).json({ error: 'Failed to process icon upload' });
      }
    }

    const payload = {
      category_id: categoryId,
      name: normalizedName,
      description: description || null,
      icon_url: iconUrl,
      duration: duration || null,
      price: price ? parseFloat(price) : null,
      offer_price: offerPrice ? parseFloat(offerPrice) : null,
      offer_percentage: offerPercentage ? parseFloat(offerPercentage) : null,
      offer_enabled: Boolean(offerEnabled),
      service_type: serviceType && ['individual', 'group'].includes(serviceType) ? serviceType : 'individual',
      active: Boolean(active)
    };
    
    console.log('Creating service with payload:', payload);

    const { data, error } = await supabase
      .from('services')
      .insert(payload)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    console.log('Database insert result:', { data, error });
    
    if (error) {
      const message = (error.message || '').toLowerCase();
      if (message.includes('duplicate') || message.includes('unique')) {
        return res.status(409).json({ error: 'Service name already exists in this category' });
      }
      if (error.code === '42501') {
        return res.status(403).json({ error: 'Permission denied. Check RLS policies or use service role key.' });
      }
      return res.status(500).json({ error: message || 'Failed to create service' });
    }

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.status(201).json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single service
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .eq('id', id)
      .single();
    
    if (error) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update service
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, description, iconBase64, iconFileName, iconMimeType, duration, price, offerPrice, offerPercentage, offerEnabled, serviceType, active } = req.body || {};
    
    const update = {};
    
    if (typeof categoryId === 'string' && categoryId.trim()) {
      // Verify category exists
      const { data: categoryData, error: categoryError } = await supabase
        .from('service_categories')
        .select('id')
        .eq('id', categoryId)
        .single();
      
      if (categoryError || !categoryData) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }
      update.category_id = categoryId;
    }
    
    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (!trimmed) return res.status(400).json({ error: 'Service name cannot be empty' });
      update.name = trimmed;
    }
    
    if (typeof description !== 'undefined') update.description = description;
    if (typeof duration !== 'undefined') update.duration = duration;
    if (typeof price !== 'undefined') update.price = price ? parseFloat(price) : null;
    if (typeof offerPrice !== 'undefined') update.offer_price = offerPrice ? parseFloat(offerPrice) : null;
    if (typeof offerPercentage !== 'undefined') update.offer_percentage = offerPercentage ? parseFloat(offerPercentage) : null;
    if (typeof offerEnabled !== 'undefined') update.offer_enabled = Boolean(offerEnabled);
    if (typeof serviceType !== 'undefined') update.service_type = serviceType && ['individual', 'group'].includes(serviceType) ? serviceType : 'individual';
    if (typeof active !== 'undefined') update.active = Boolean(active);
    
    // Handle icon upload to Supabase Storage
    if (iconBase64 && iconFileName && iconMimeType) {
      try {
        const bucket = 'service_images';
        const ext = (String(iconFileName).split('.').pop() || 'png').toLowerCase();
        const nameSlug = (update.name || 'service').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '').slice(0, 40) || 'service';
        const objectKey = `${nameSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const buffer = Buffer.from(iconBase64, 'base64');
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(objectKey, buffer, { 
            contentType: iconMimeType, 
            upsert: true, 
            cacheControl: '3600' 
          });

        if (uploadError) {
          console.error('Service icon upload failed:', uploadError);
          return res.status(500).json({ error: uploadError.message || 'Failed to upload service icon' });
        }

        const { data: publicData } = supabase.storage
          .from(bucket)
          .getPublicUrl(objectKey);
        update.icon_url = publicData?.publicUrl || null;
      } catch (uploadErr) {
        console.error('Icon upload error:', uploadErr);
        return res.status(500).json({ error: 'Failed to process icon upload' });
      }
    }
    
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No fields to update' });
    
    const { data, error } = await supabase
      .from('services')
      .update(update)
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block / Suspend service
router.patch('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: false })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unblock / Activate service
router.patch('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: true })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallbacks for environments without PATCH
router.post('/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: false })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/unblock', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('services')
      .update({ active: true })
      .eq('id', id)
      .select(`
        id, 
        name, 
        description, 
        icon_url,
        duration, 
        price,
        offer_price,
        offer_percentage,
        offer_enabled,
        service_type,
        active, 
        created_at, 
        updated_at,
        service_categories!inner(
          id,
          name
        )
      `)
      .single();
    
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Service not found' });

    // Format response
    const formattedService = {
      ...data,
      category_name: data.service_categories?.name || 'Unknown',
      category: data.service_categories?.id || null
    };

    res.json(formattedService);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete service
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
