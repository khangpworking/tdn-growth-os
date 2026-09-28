-- A target can have at most one live provider dispatch across all application connections.
-- Closed attempts remain immutable history and may be retried only by an explicit retry_of.
CREATE UNIQUE INDEX flow_content_ai_attempts_active_target
  ON flow_content_ai_attempts(target_type, target_id)
  WHERE state = 'running';
