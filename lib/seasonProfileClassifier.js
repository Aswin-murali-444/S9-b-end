/**
 * Classify a service row using ONLY data that exists in your DB (name, description, category name).
 * Patterns are hints — the script only writes rows for services that actually exist in `services`.
 * Edit categoryPatterns / textPatterns to match your real category names from Supabase.
 */

const PHASE_ORDER = ['monsoon', 'summer', 'winter', 'neutral'];

/** Category name (lowercase) substring → primary phase (first match wins by phase priority below). */
const categoryPatterns = {
  monsoon: ['plumb', 'water', 'proof', 'leak', 'drain', 'rain', 'roof', 'gutter', 'seep', 'damp'],
  summer: ['cool', 'hvac', 'fridge', 'refrig', 'paint', 'interior', 'electric', 'air cond'],
  winter: ['heat', 'geyser', 'warm', 'solar water', 'care', 'blanket'],
  all_year: ['clean', 'pest', 'cook', 'garden', 'transport', 'tech', 'it ', 'repair']
};

/** Extra hints from service title + description (lowercase haystack). */
const textPatterns = {
  monsoon: [
    'waterproof',
    'water proof',
    'seepage',
    'leak',
    'drainage',
    'gutter',
    'damp',
    'plumb'
  ],
  summer: [
    ' ac',
    'ac ',
    'ac/',
    'a/c',
    'air condition',
    'cooling',
    'split ac',
    'painting',
    'painter',
    'whitewash',
    'putty',
    'wallpaper'
  ],
  winter: ['geyser', 'water heater', 'heater', 'hot water', 'immersion']
};

function haystack(name, description, categoryName) {
  const bits = [name, description, categoryName].filter(Boolean).map((x) => String(x).toLowerCase());
  return bits.join(' \n ');
}

/**
 * @returns {{ primary_phase: string, match_source: string }}
 */
function classifyServiceSeason({ name, description, categoryName }) {
  const h = haystack(name, description, categoryName);
  const cat = String(categoryName || '').toLowerCase();

  const hits = [];

  for (const phase of ['monsoon', 'summer', 'winter']) {
    const cps = categoryPatterns[phase] || [];
    for (const sub of cps) {
      if (cat.includes(sub)) {
        hits.push({ phase, src: `category:${sub}` });
        break;
      }
    }
    const tps = textPatterns[phase] || [];
    for (const sub of tps) {
      if (h.includes(sub)) {
        hits.push({ phase, src: `text:${sub}` });
        break;
      }
    }
  }

  if (hits.length === 0) {
    const allYearSubs = categoryPatterns.all_year || [];
    for (const sub of allYearSubs) {
      if (cat.includes(sub)) {
        return { primary_phase: 'all_year', match_source: `category:${sub}` };
      }
    }
    return { primary_phase: 'neutral', match_source: 'none' };
  }

  // Priority: monsoon > summer > winter when multiple match
  const rank = { monsoon: 0, summer: 1, winter: 2 };
  hits.sort((a, b) => rank[a.phase] - rank[b.phase]);
  const best = hits[0];
  return { primary_phase: best.phase, match_source: best.src };
}

module.exports = {
  classifyServiceSeason,
  PHASE_ORDER,
  categoryPatterns,
  textPatterns
};
