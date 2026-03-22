-- Season placement per real catalog row (filled by scripts/refresh-service-season-profiles.js).
-- Recommendations use this + rotation so many services get surfaced across days/users.

CREATE TABLE IF NOT EXISTS service_season_profile (
  service_id UUID PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  primary_phase TEXT NOT NULL DEFAULT 'neutral'
    CHECK (primary_phase IN ('summer', 'monsoon', 'winter', 'neutral', 'all_year')),
  match_source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_season_profile_phase
  ON service_season_profile (primary_phase);

COMMENT ON TABLE service_season_profile IS 'Which calendar season a service is primarily associated with; built from DB services + categories only.';
