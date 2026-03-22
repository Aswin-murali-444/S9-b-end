-- Precomputed seasonal / weather relevance per service per calendar month (India-centric rules).
-- Refreshed daily by: node scripts/refresh-service-seasonal-scores.js
-- Recommendations read rows for the active month and pass overrides to the ML service.

CREATE TABLE IF NOT EXISTS service_seasonal_scores (
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  calendar_month SMALLINT NOT NULL CHECK (calendar_month >= 1 AND calendar_month <= 12),
  multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  reason_key TEXT,
  source_text_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_id, calendar_month)
);

CREATE INDEX IF NOT EXISTS idx_service_seasonal_scores_month
  ON service_seasonal_scores (calendar_month);

COMMENT ON TABLE service_seasonal_scores IS 'Daily job: scores from service name/description vs month; ML uses for ranking.';
COMMENT ON COLUMN service_seasonal_scores.source_text_hash IS 'Optional fingerprint of name+description when score was computed.';
