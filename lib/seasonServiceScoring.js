/**
 * Seasonal / weather-style multipliers for services (India-centric defaults).
 * Keep in sync with S9-ml-service/app.py: _india_season_phase, _season_multiplier_for_text,
 * and the post_monsoon branch in _build_season_multipliers.
 */

function indiaSeasonPhase(month) {
  if (month >= 6 && month <= 9) return 'monsoon';
  if (month >= 3 && month <= 5) return 'summer';
  if (month === 11 || month === 12 || month === 1 || month === 2) return 'winter';
  return 'neutral';
}

/**
 * @param {string} hay - lowercased name + description
 * @param {string} phase - monsoon | summer | winter | neutral | post_monsoon
 * @param {string} country - uppercased ISO country code
 * @returns {{ multiplier: number, reasonKey: string|null }}
 */
function seasonMultiplierForText(hay, phase, country) {
  const h = hay || '';
  if (country !== 'IN') {
    return { multiplier: 1.0, reasonKey: null };
  }

  if (phase === 'monsoon') {
    const strongAvoid = [
      'exterior paint',
      'outdoor paint',
      'external paint',
      'facade',
      'outer wall',
      'terrace paint',
      'roof paint'
    ];
    for (const kw of strongAvoid) {
      if (h.includes(kw)) {
        return { multiplier: 0.06, reasonKey: 'season_avoid_outdoor_work' };
      }
    }
    const boost = [
      'waterproof',
      'water proof',
      'seepage',
      'damp',
      'dampness',
      'leak',
      'leakage',
      'drain',
      'drainage',
      'gutter',
      'flooding',
      'basement water'
    ];
    for (const kw of boost) {
      if (h.includes(kw)) {
        return { multiplier: 1.28, reasonKey: 'season_boost_monsoon_relevant' };
      }
    }
    const paintish = [
      'painter',
      'painting',
      'whitewash',
      'putty',
      'wallpaper install'
    ];
    for (const kw of paintish) {
      if (h.includes(kw)) {
        return { multiplier: 0.22, reasonKey: 'season_down_paint_monsoon' };
      }
    }
  }

  if (phase === 'summer') {
    // Word-boundary AC / air conditioning (matches "AC repair", "Split AC", etc.)
    if (
      /\bac\b/.test(h) ||
      h.includes('a/c') ||
      h.includes('air condition') ||
      h.includes('air-cool') ||
      h.includes('air cool') ||
      h.includes('hvac')
    ) {
      return { multiplier: 1.24, reasonKey: 'season_boost_summer_cooling' };
    }
    const boost = [
      'ac service',
      'air conditioner',
      'cooler',
      'refrigerator',
      'fridge',
      'cooling'
    ];
    for (const kw of boost) {
      if (h.includes(kw)) {
        return { multiplier: 1.22, reasonKey: 'season_boost_summer_cooling' };
      }
    }
    // Dry heat: indoor painting / touch-ups are commonly booked in summer
    const summerPaint = ['painting', 'painter', 'whitewash', 'putty', 'wallpaper'];
    for (const kw of summerPaint) {
      if (h.includes(kw)) {
        return { multiplier: 1.2, reasonKey: 'season_boost_summer_painting' };
      }
    }
    if (h.includes('exterior paint') || h.includes('outdoor paint')) {
      return { multiplier: 0.75, reasonKey: 'season_soft_down_exterior_summer' };
    }
  }

  if (phase === 'winter') {
    const boost = [
      'geyser',
      'water heater',
      'heater',
      'immersion',
      'solar water',
      'hot water'
    ];
    for (const kw of boost) {
      if (h.includes(kw)) {
        return { multiplier: 1.2, reasonKey: 'season_boost_winter_comfort' };
      }
    }
  }

  return { multiplier: 1.0, reasonKey: null };
}

/**
 * Full rules including October post-monsoon exterior cap (matches ML).
 * @param {string} name
 * @param {string} [description]
 * @param {number} month - 1-12
 * @param {string} [country] - default IN
 */
function computeSeasonScoreForService(name, description, month, country = 'IN') {
  const cc = String(country || 'IN').toUpperCase();
  const m = Math.max(1, Math.min(12, parseInt(String(month), 10) || 1));
  const bits = [name, description].filter(Boolean).map((x) => String(x).toLowerCase());
  const hay = bits.join(' ').slice(0, 2000);

  let phase = indiaSeasonPhase(m);
  if (phase === 'neutral' && cc === 'IN' && m === 10) {
    phase = 'post_monsoon';
  }

  let { multiplier: mult, reasonKey: reason } = seasonMultiplierForText(hay, phase, cc);

  if (phase === 'post_monsoon' && cc === 'IN') {
    const kws = ['exterior paint', 'outdoor paint', 'facade'];
    if (kws.some((k) => hay.includes(k))) {
      mult = Math.min(mult, 0.45);
      if (mult <= 0.45) {
        reason = reason || 'season_soft_post_monsoon_exterior';
      }
    }
  }

  return { multiplier: mult, reasonKey: reason };
}

/**
 * Services with seasonal multiplier > 1 for this month (right season to promote).
 * Used to build the top "season shelf" in recommendations.
 */
function _normRecId(v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  ) {
    return s.toLowerCase();
  }
  return s;
}

function rankSeasonalBoostedServices(rows, month, country, excludeSet, maxTake) {
  const cc = String(country || 'IN').toUpperCase();
  const m = Math.max(1, Math.min(12, parseInt(String(month), 10) || 1));
  const ex = excludeSet instanceof Set ? excludeSet : new Set([...(excludeSet || [])].map(_normRecId));
  const n = Math.max(0, parseInt(String(maxTake), 10) || 0);
  if (n === 0) return [];

  const scored = (rows || [])
    .map((row) => {
      const id = row?.id;
      if (id == null || ex.has(_normRecId(id))) return null;
      const { multiplier, reasonKey } = computeSeasonScoreForService(row.name, row.description, m, cc);
      if (multiplier <= 1.0001) return null;
      return { row, multiplier, reasonKey };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.multiplier - a.multiplier ||
        String(a.row.name || '').localeCompare(String(b.row.name || ''))
    );

  return scored.slice(0, n).map((x) => ({
    ...x.row,
    _seasonMultiplier: x.multiplier,
    _seasonReasonKey: x.reasonKey
  }));
}

/** UI labels aligned with S9-ml-service `app.py` `_season_insight_label` (insightKey drives CSS). */
const SEASON_REASON_UI = {
  season_avoid_outdoor_work: {
    insightKey: 'seasonal',
    insightLabel: 'Outdoor work — better in dry weather'
  },
  season_down_paint_monsoon: {
    insightKey: 'seasonal',
    insightLabel: 'Painting — usually easier after monsoon'
  },
  season_boost_monsoon_relevant: {
    insightKey: 'seasonal',
    insightLabel: 'Fits rainy-season needs'
  },
  season_boost_summer_cooling: {
    insightKey: 'seasonal',
    insightLabel: 'Popular in summer — cooling'
  },
  season_boost_summer_painting: {
    insightKey: 'seasonal',
    insightLabel: 'Good season for painting & touch-ups'
  },
  season_soft_down_exterior_summer: {
    insightKey: 'seasonal',
    insightLabel: 'Heavy exterior work — plan timing'
  },
  season_boost_winter_comfort: {
    insightKey: 'seasonal',
    insightLabel: 'Handy in cooler months'
  },
  season_soft_post_monsoon_exterior: {
    insightKey: 'seasonal',
    insightLabel: 'Exterior work — check weather window'
  }
};

/**
 * Badge copy for a service when name/description matches seasonal rules (same as ML).
 * @returns {{ insightKey: string, insightLabel: string } | null}
 */
function getSeasonUiInsight(name, description, month, country = 'IN') {
  const { reasonKey } = computeSeasonScoreForService(name, description, month, country);
  if (!reasonKey) return null;
  return SEASON_REASON_UI[reasonKey] || {
    insightKey: 'seasonal',
    insightLabel: 'Seasonal pick for this month'
  };
}

/**
 * Panel copy so the dashboard always shows that seasonal rules are active (India calendar).
 */
function getSeasonalPanelContext(month, country = 'IN') {
  const m = Math.max(1, Math.min(12, parseInt(String(month), 10) || 1));
  const cc = String(country || 'IN').toUpperCase();
  if (cc !== 'IN') {
    return {
      month: m,
      phase: 'international',
      headline: 'Recommendations',
      subline: 'Ranked with demand signals and your activity.'
    };
  }
  let phase = indiaSeasonPhase(m);
  if (phase === 'neutral' && m === 10) phase = 'post_monsoon';

  const headlines = {
    monsoon: 'Monsoon-aware recommendations',
    summer: 'Summer-aware recommendations',
    winter: 'Winter-aware recommendations',
    neutral: 'Season-aware recommendations',
    post_monsoon: 'Post-monsoon recommendations'
  };
  const sublines = {
    monsoon:
      'We surface waterproofing and leak-related services first; outdoor painting is shown a little less this season.',
    summer:
      'We highlight cooling and summer-friendly services (like AC and painting) at the top, refreshed daily, then your personal picks.',
    winter: 'We prioritise heating, geysers, and hot-water comfort services, followed by suggestions based on your activity.',
    neutral:
      'Seasonal hints still apply where they match a service; the rest of your list reflects popularity and your preferences.',
    post_monsoon: 'For exterior work, we’ll remind you to pick dry weather windows before you book paint jobs.'
  };

  return {
    month: m,
    phase,
    headline: headlines[phase] || headlines.neutral,
    subline: sublines[phase] || sublines.neutral
  };
}

/** Simple hash for change detection (not cryptographic). */
function fingerprintServiceText(name, description) {
  const s = `${name || ''}\n${description || ''}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

module.exports = {
  indiaSeasonPhase,
  seasonMultiplierForText,
  computeSeasonScoreForService,
  fingerprintServiceText,
  getSeasonUiInsight,
  getSeasonalPanelContext,
  rankSeasonalBoostedServices
};
