import fs from 'node:fs/promises';
import type { TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import { fixture, startRun } from '../helpers/autorun-harness.js';
import type { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';

export const RETRIEVED_AT = '2026-11-03T08:00:00+07:00';
export const QUERY = 'synthetic jar uses';
export const ANSWER = {
  text_blocks: [
    { type: 'heading', snippet: 'Synthetic heading' },
    { type: 'paragraph', snippet: 'Synthetic paragraph', reference_indexes: [7] },
    { type: 'list', list: [
      { snippet: 'Synthetic first item', reference_indexes: [7, 3] },
      { snippet: 'Synthetic second item', reference_indexes: [3] },
    ] },
  ],
  references: [
    { index: 7, title: 'Synthetic source A', link: 'https://example.test/a', source: 'Example A', snippet: 'Exact reference A snippet' },
    { index: 3, title: 'Synthetic source B', link: 'https://example.test/b', source: 'Example B', snippet: 'Exact reference B snippet' },
  ],
};
export const GOOGLE_TABLES = ['search_suggestion', 'ai_overview_block', 'ai_overview_reference', 'raw_capture'] as const;

export function snapshot(db: Database.Database, tables: readonly string[] = GOOGLE_TABLES) {
  return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

/** A stored synthetic provider response, using the existing immutable capture/manifest contracts. */
export async function saveGoogleCapture(
  f: { db: Database.Database; artifacts: ContentAddressedArtifactStore; runId: string },
  operation: 'google.suggest' | 'serpapi.google.search' | 'serpapi.google_ai_overview',
  body: unknown, ordinal: number,
) {
  const stored = await f.artifacts.put(Buffer.from(JSON.stringify(body)));
  f.db.prepare(`INSERT OR IGNORE INTO artifact_manifests
    (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,created_at)
    VALUES (?,?,'application/json',?,?,'synthetic-google-response-v1',?)`)
    .run(stored.sha256, stored.byteSize, stored.relativePath, RETRIEVED_AT, RETRIEVED_AT);
  f.db.prepare(`INSERT INTO analysis_research_automation_captures
    (run_id,step_id,ordinal,artifact_sha256,media_type,provider,operation,retrieved_at,truncated,retained_at)
    VALUES (?,'COLLECTION',?,?,'application/json',?,?,?,0,?)`)
    .run(f.runId, ordinal, stored.sha256, operation === 'google.suggest' ? 'google-suggest' : 'serpapi', operation, RETRIEVED_AT, RETRIEVED_AT);
  return stored;
}

export async function googleFixture(t: TestContext) {
  const f = await fixture(t, 'off');
  return { ...f, runId: await startRun(f.service, ['INSIGHT']) };
}

export const SUGGESTION_FILE = new URL('./raw-db-v1-google-suggestions.synthetic.json', import.meta.url);
export async function suggestionFile() {
  const bytes = await fs.readFile(SUGGESTION_FILE);
  return { bytes, value: JSON.parse(bytes.toString('utf8')) as {
    records: { prefix: string; httpStatus: number; requestedAt: string; suggestions: string[]; raw: unknown }[];
  } };
}
