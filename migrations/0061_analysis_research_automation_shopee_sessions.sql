-- Owner repair of the Shopee public-review collector session (SHP-BRIEF C1/C2).
-- One row per accepted login/confirm request, keyed by the owner's request key,
-- so an exact replay returns the same session receipt without touching the
-- collector again. The collector token is never stored or returned.
-- The run request ledger only admits START/CONFIRM/CANCEL, so these keys live here.
-- Never apply this migration to runtime data as part of implementation tests.
CREATE TABLE research_automation_shopee_sessions (
  request_key TEXT PRIMARY KEY NOT NULL CHECK(length(request_key) = 36),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL CHECK(request_kind IN ('LOGIN', 'CONFIRM')),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN ('READY','AWAITING_USER_LOGIN','LOGIN_REQUIRED','VERIFICATION_REQUIRED','COLLECTOR_BUSY','COLLECTOR_DOWN')),
  checked_at TEXT CHECK(checked_at IS NULL OR (
    julianday(checked_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', checked_at) = checked_at
  )),
  accepted_at TEXT NOT NULL CHECK(
    julianday(accepted_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', accepted_at) = accepted_at
  )
) STRICT;
CREATE INDEX research_automation_shopee_sessions_run
  ON research_automation_shopee_sessions(run_id, accepted_at);
