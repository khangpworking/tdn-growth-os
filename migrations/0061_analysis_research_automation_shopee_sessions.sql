-- Owner repair of the Shopee public-review collector session (SHP-BRIEF C1/C2).
-- One row per reserved login/confirm request, keyed by the owner's request key,
-- so an exact replay returns the same session receipt without touching the
-- collector again. 'DISPATCHING' is a durable reservation written before the
-- collector call; a replay of that state never dispatches a second time.
-- The collector token is never stored or returned.
-- The run request ledger only admits START/CONFIRM/CANCEL, so these keys live here.
-- Never apply this migration to runtime data as part of implementation tests.
CREATE TABLE research_automation_shopee_sessions (
  request_key TEXT PRIMARY KEY NOT NULL CHECK(length(request_key) = 36),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL CHECK(request_kind IN ('LOGIN', 'CONFIRM')),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK(state IN ('DISPATCHING','READY','AWAITING_USER_LOGIN','LOGIN_REQUIRED','VERIFICATION_REQUIRED','COLLECTOR_BUSY','COLLECTOR_DOWN')),
  checked_at TEXT CHECK(checked_at IS NULL OR (
    julianday(checked_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', checked_at) = checked_at
  )),
  reserved_at TEXT NOT NULL CHECK(
    julianday(reserved_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', reserved_at) = reserved_at
  ),
  accepted_at TEXT CHECK(accepted_at IS NULL OR (
    julianday(accepted_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', accepted_at) = accepted_at
  )),
  CHECK((state = 'DISPATCHING') = (accepted_at IS NULL)),
  CHECK(state <> 'DISPATCHING' OR checked_at IS NULL)
) STRICT;
CREATE INDEX research_automation_shopee_sessions_run
  ON research_automation_shopee_sessions(run_id, reserved_at);
