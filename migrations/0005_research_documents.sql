CREATE TABLE foundation_research_documents (
  document_id TEXT PRIMARY KEY CHECK (length(document_id) = 36),
  evidence_id TEXT NOT NULL UNIQUE REFERENCES foundation_evidence(evidence_id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL CHECK (document_type IN ('news_article', 'report', 'web_page', 'transcript', 'other')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 500),
  source_locator TEXT NOT NULL CHECK (length(trim(source_locator)) BETWEEN 1 AND 2000),
  language_tag TEXT NOT NULL CHECK (length(trim(language_tag)) BETWEEN 1 AND 80),
  published_at TEXT,
  rights_status TEXT NOT NULL CHECK (rights_status IN ('unknown', 'permitted', 'restricted')),
  rights_basis TEXT NOT NULL CHECK (length(trim(rights_basis)) BETWEEN 1 AND 1000),
  raw_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  CHECK (published_at IS NULL OR julianday(published_at) IS NOT NULL)
) STRICT;

CREATE TABLE foundation_research_packs (
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
  supersedes_pack_id TEXT REFERENCES foundation_research_packs(pack_id) ON DELETE RESTRICT,
  finalized_at TEXT CHECK (finalized_at IS NULL OR julianday(finalized_at) IS NOT NULL),
  UNIQUE (pack_key, version),
  CHECK (supersedes_pack_id IS NULL OR supersedes_pack_id <> pack_id)
) STRICT;

CREATE TABLE foundation_research_pack_items (
  pack_id TEXT NOT NULL REFERENCES foundation_research_packs(pack_id) ON DELETE RESTRICT,
  document_id TEXT NOT NULL REFERENCES foundation_research_documents(document_id) ON DELETE RESTRICT,
  PRIMARY KEY (pack_id, document_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX foundation_research_documents_artifact_idx
  ON foundation_research_documents(raw_artifact_sha256);
CREATE INDEX foundation_research_packs_supersedes_idx
  ON foundation_research_packs(supersedes_pack_id);
CREATE INDEX foundation_research_pack_items_document_idx
  ON foundation_research_pack_items(document_id);

CREATE TRIGGER foundation_research_documents_no_update
BEFORE UPDATE ON foundation_research_documents
BEGIN
  SELECT RAISE(ABORT, 'foundation_research_document_immutable');
END;

CREATE TRIGGER foundation_research_documents_no_delete
BEFORE DELETE ON foundation_research_documents
BEGIN
  SELECT RAISE(ABORT, 'foundation_research_document_immutable');
END;

CREATE TRIGGER foundation_research_packs_finalized_no_update
BEFORE UPDATE ON foundation_research_packs
WHEN OLD.finalized_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'foundation_research_pack_finalized_immutable');
END;

CREATE TRIGGER foundation_research_packs_no_delete
BEFORE DELETE ON foundation_research_packs
BEGIN
  SELECT RAISE(ABORT, 'foundation_research_pack_immutable');
END;

CREATE TRIGGER foundation_research_pack_items_no_insert_after_finalize
BEFORE INSERT ON foundation_research_pack_items
WHEN (SELECT finalized_at FROM foundation_research_packs WHERE pack_id = NEW.pack_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'foundation_research_pack_membership_immutable');
END;

CREATE TRIGGER foundation_research_pack_items_no_update
BEFORE UPDATE ON foundation_research_pack_items
BEGIN
  SELECT RAISE(ABORT, 'foundation_research_pack_membership_immutable');
END;

CREATE TRIGGER foundation_research_pack_items_no_delete
BEFORE DELETE ON foundation_research_pack_items
BEGIN
  SELECT RAISE(ABORT, 'foundation_research_pack_membership_immutable');
END;
