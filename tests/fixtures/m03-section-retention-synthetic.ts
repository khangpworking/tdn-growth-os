import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { renderM03SectionArtifact } from '../../src/modules/analysis/m03-section-artifact.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { m03SectionArtifactChainFixture } from './m03-section-artifact-synthetic.js';
import { syntheticSha } from './m03-verified-metric-set-synthetic.js';

export function m03SectionRetentionFixture() {
  const chain = m03SectionArtifactChainFixture();
  const rendered = renderM03SectionArtifact({
    contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-section-artifact-html-vi-v1',
    narrativeSha256: chain.narrative.narrativeSha256,
  }, chain.metricSet, chain.chartBundle, chain.envelope, chain.narrative);
  const bytes = {
    metricSet: canonicalBytes(chain.metricSet),
    chartBundle: canonicalBytes(chain.chartBundle),
    envelope: canonicalBytes(chain.envelope),
    narrative: canonicalBytes(chain.narrative),
    receipt: canonicalBytes(rendered.artifact),
    html: Buffer.from(rendered.html, 'utf8'),
  };
  const request = {
    contractVersion: '1.0.0' as const,
    sectionId: 'M03' as const,
    rendererProfile: 'm03-section-artifact-html-vi-v1' as const,
    metricSetSha256: chain.metricSet.metricSetSha256,
    chartBundleSha256: chain.chartBundle.chartBundleSha256,
    envelopeSha256: chain.envelope.envelopeSha256,
    narrativeSha256: chain.narrative.narrativeSha256,
    sectionArtifactSha256: rendered.artifact.artifactSha256,
    htmlSha256: rendered.artifact.html.sha256,
  };
  return { chain, rendered, bytes, request };
}

export function seedSyntheticPreparation(db: Database.Database, fixture: ReturnType<typeof m03SectionRetentionFixture>): void {
  const preparation = fixture.chain.metricSet.preparation;
  const sourceSha256 = fixture.chain.metricSet.sources[0]!.sha256;
  const workbookSha256 = syntheticSha('a37-workbook');
  const manifestSha256 = syntheticSha('a37-manifest');
  const receiptSha256 = syntheticSha('a37-normalization-receipt');
  const resultSha256 = syntheticSha('a37-preparation-result');
  const retainedAt = '2026-09-30T00:00:00.000Z';
  const manifests = [
    preparation.normalizedInputArtifactSha256,
    sourceSha256,
    workbookSha256,
    manifestSha256,
    receiptSha256,
    resultSha256,
  ];
  db.exec('BEGIN');
  try {
    const insertManifest = db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at
      ) VALUES (?, 1, 'application/json', ?, ?, '1.0.0', 'active', ?)
    `);
    for (const sha256 of manifests) {
      insertManifest.run(sha256, `sha256/${sha256.slice(0, 2)}/${sha256}`, retainedAt, retainedAt);
    }
    db.prepare(`
      INSERT INTO analysis_metric_dataset_sources(
        normalized_input_sha256, ordinal, source_sha256, label,
        representation_role, evidence_family, provenance_basis
      ) VALUES (?, 0, ?, 'Synthetic A37 source', 'structured', 'synthetic', 'Test fixture only')
    `).run(preparation.normalizedInputArtifactSha256, sourceSha256);
    db.prepare(`
      INSERT INTO analysis_metric_datasets(
        normalized_input_sha256, contract_version, scope_key, platform, selection,
        period_start, period_end, period_basis, acquired_at, profile_id,
        label_codebook_version, wide_unknown_policy, source_count, row_count
      ) VALUES (?, '1.0.0', 'synthetic', 'shopee', 'ON',
        '2026-01-01', '2026-01-31', 'Synthetic only', NULL, 'synthetic-v1',
        'synthetic-v1', 'exclude', 1, 0)
    `).run(preparation.normalizedInputArtifactSha256);
    db.prepare(`
      INSERT INTO analysis_metric_input_preparations(
        preparation_sha256, request_sha256, workspace_id, workspace_snapshot_sha256,
        source_package_id, source_package_manifest_sha256, package_content_sha256,
        workbook_path, workbook_sha256, metric_manifest_path, metric_manifest_sha256,
        labels_path, labels_sha256, normalized_input_sha256,
        normalization_receipt_sha256, result_artifact_sha256
      ) VALUES (?, ?, '11111111-1111-4111-8111-111111111111', ?,
        '22222222-2222-4222-8222-222222222222', ?, ?,
        'metric/workbook.xlsx', ?, 'metric/manifest.json', ?, NULL, NULL, ?, ?, ?)
    `).run(
      preparation.preparationSha256,
      syntheticSha('a37-preparation-request'),
      syntheticSha('a37-workspace-snapshot'),
      syntheticSha('a37-package-manifest'),
      syntheticSha('a37-package-content'),
      workbookSha256,
      manifestSha256,
      preparation.normalizedInputArtifactSha256,
      receiptSha256,
      resultSha256,
    );
    db.exec('COMMIT');
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export async function writeM03SectionRetentionInputs(
  directory: string,
  fixture: ReturnType<typeof m03SectionRetentionFixture>,
): Promise<Record<keyof typeof fixture.bytes, string>> {
  const names: Record<keyof typeof fixture.bytes, string> = {
    metricSet: 'metric-set.json',
    chartBundle: 'chart-bundle.json',
    envelope: 'evidence-envelope.json',
    narrative: 'factual-narrative.json',
    receipt: 'section-artifact.json',
    html: 'section-artifact.html',
  };
  const paths = {} as Record<keyof typeof fixture.bytes, string>;
  for (const key of Object.keys(names) as (keyof typeof fixture.bytes)[]) {
    const target = path.join(directory, names[key]);
    await fs.writeFile(target, fixture.bytes[key], { mode: 0o600 });
    paths[key] = target;
  }
  return paths;
}

export const artifactByteSha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}
