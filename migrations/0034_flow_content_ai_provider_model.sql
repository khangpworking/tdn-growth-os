-- The exact provider model each Content Studio AI attempt was dispatched to (review R1 on #68).
-- `model` stays the product id users choose; the route from product id to CLIProxy model can change
-- later, so the provider id is recorded per attempt and never rewritten. Rows written before v34 keep
-- NULL (provider model not recorded); every new row must carry it.
ALTER TABLE flow_content_ai_attempts ADD COLUMN provider_model TEXT
  CHECK(provider_model IS NULL OR (
    length(provider_model) BETWEEN 1 AND 128 AND provider_model GLOB '[A-Za-z0-9]*' AND provider_model NOT GLOB '*[^A-Za-z0-9._:-]*'
  ));

CREATE TRIGGER flow_content_ai_attempts_provider_model_required
BEFORE INSERT ON flow_content_ai_attempts
WHEN NEW.provider_model IS NULL
BEGIN SELECT RAISE(ABORT, 'flow_content_ai_attempt_provider_model_required'); END;

CREATE TRIGGER flow_content_ai_attempts_provider_model_immutable
BEFORE UPDATE ON flow_content_ai_attempts
WHEN NEW.provider_model IS NOT OLD.provider_model
BEGIN SELECT RAISE(ABORT, 'flow_content_ai_attempt_provider_model_immutable'); END;
