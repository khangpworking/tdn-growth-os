import fs from 'node:fs/promises';
import path from 'node:path';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';
import { FoundationService } from '../src/modules/foundation/index.js';

const [databaseArgument, artifactsArgument, inputArgument] = process.argv.slice(2);
if (!databaseArgument || !artifactsArgument || !inputArgument) {
  console.error('Usage: npm run foundation:ingest -- <database.sqlite> <artifact-root> <input.json>');
  process.exit(2);
}

const databasePath = path.resolve(databaseArgument);
const artifactRoot = path.resolve(artifactsArgument);
const inputPath = path.resolve(inputArgument);
const input = JSON.parse(await fs.readFile(inputPath, 'utf8')) as unknown;
const { db } = openDatabase({ databasePath });
try {
  const service = new FoundationService({
    db,
    artifactStore: new ContentAddressedArtifactStore(artifactRoot),
  });
  const imported = await service.importManualObservation(input);
  const lineage = imported.observationIds.map((observationId) => service.getLineage(observationId));
  console.log(JSON.stringify({ imported, lineage }, bigintReplacer, 2));
} finally {
  db.close();
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
