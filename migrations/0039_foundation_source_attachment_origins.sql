-- Storage provenance, not provider authentication or Analysis admission.
-- Authored attachments are marked inside their original Foundation intake.
-- Referencing an existing manual package never retroactively marks it.
CREATE TABLE foundation_source_attachment_origins (
  package_id TEXT PRIMARY KEY NOT NULL REFERENCES foundation_source_packages(package_id) ON DELETE RESTRICT,
  origin_kind TEXT NOT NULL CHECK(origin_kind = 'AUTOMATION_ATTACHMENT'),
  binding_sha256 TEXT NOT NULL CHECK(length(binding_sha256) = 64 AND binding_sha256 NOT GLOB '*[^0-9a-f]*'),
  manifest_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  marked_at TEXT NOT NULL CHECK(length(trim(marked_at)) > 0)
) STRICT;

CREATE TRIGGER foundation_source_attachment_origins_insert
BEFORE INSERT ON foundation_source_attachment_origins
WHEN NOT EXISTS (
  SELECT 1 FROM foundation_source_packages p
  WHERE p.package_id = NEW.package_id AND p.finalized_at IS NULL
    AND p.manifest_artifact_sha256 = NEW.manifest_artifact_sha256
)
BEGIN SELECT RAISE(ABORT, 'source_attachment_origin_requires_original_intake'); END;

CREATE TRIGGER foundation_source_attachment_origins_no_update
BEFORE UPDATE ON foundation_source_attachment_origins
BEGIN SELECT RAISE(ABORT, 'immutable_source_attachment_origin'); END;

CREATE TRIGGER foundation_source_attachment_origins_no_delete
BEFORE DELETE ON foundation_source_attachment_origins
BEGIN SELECT RAISE(ABORT, 'immutable_source_attachment_origin'); END;
