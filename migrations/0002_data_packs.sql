CREATE TABLE foundation_data_packs (
  pack_id TEXT PRIMARY KEY CHECK (length(pack_id) = 36),
  pack_key TEXT NOT NULL CHECK (
    length(pack_key) BETWEEN 3 AND 160 AND
    instr(pack_key, ':') > 1 AND
    pack_key NOT GLOB '*[[:space:]]*'
  ),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version > 0),
  purpose TEXT NOT NULL CHECK (length(trim(purpose)) BETWEEN 1 AND 500),
  request_sha256 TEXT NOT NULL CHECK (
    length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  manifest_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  supersedes_pack_id TEXT REFERENCES foundation_data_packs(pack_id) ON DELETE RESTRICT,
  finalized_at TEXT CHECK (finalized_at IS NULL OR length(trim(finalized_at)) > 0),
  UNIQUE (pack_key, version),
  CHECK (supersedes_pack_id IS NULL OR supersedes_pack_id <> pack_id)
) STRICT;

CREATE TABLE foundation_data_pack_items (
  pack_id TEXT NOT NULL REFERENCES foundation_data_packs(pack_id) ON DELETE RESTRICT,
  observation_id INTEGER NOT NULL REFERENCES foundation_observations(observation_id) ON DELETE RESTRICT,
  PRIMARY KEY (pack_id, observation_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX foundation_data_pack_supersedes_idx
  ON foundation_data_packs(supersedes_pack_id);
CREATE INDEX foundation_data_pack_item_observation_idx
  ON foundation_data_pack_items(observation_id);

CREATE TRIGGER foundation_data_packs_finalized_no_update
BEFORE UPDATE ON foundation_data_packs
WHEN OLD.finalized_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'foundation_data_pack_finalized_immutable');
END;

CREATE TRIGGER foundation_data_packs_no_delete
BEFORE DELETE ON foundation_data_packs
BEGIN
  SELECT RAISE(ABORT, 'foundation_data_pack_immutable');
END;

CREATE TRIGGER foundation_data_pack_items_no_insert_after_finalize
BEFORE INSERT ON foundation_data_pack_items
WHEN (SELECT finalized_at FROM foundation_data_packs WHERE pack_id = NEW.pack_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'foundation_data_pack_membership_immutable');
END;

CREATE TRIGGER foundation_data_pack_items_no_update
BEFORE UPDATE ON foundation_data_pack_items
BEGIN
  SELECT RAISE(ABORT, 'foundation_data_pack_membership_immutable');
END;

CREATE TRIGGER foundation_data_pack_items_no_delete
BEFORE DELETE ON foundation_data_pack_items
BEGIN
  SELECT RAISE(ABORT, 'foundation_data_pack_membership_immutable');
END;
