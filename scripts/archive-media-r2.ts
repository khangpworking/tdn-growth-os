import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { createR2MediaArchive } from '../src/platform/artifacts/r2-media-archive.js';
import { archiveRetainedMedia } from '../src/modules/flow/retained-media-archive.js';

const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error('Usage: npm run media:r2:archive -- <database.sqlite> <artifact-root> <exact-image-sha256>');
  process.exitCode = 1;
} else {
  let db: BetterSqlite3.Database | undefined;
  let connection: ReturnType<typeof createR2MediaArchive> | undefined;
  try {
    const [databasePath, artifactRoot, sha256] = args as [string, string, string];
    connection = createR2MediaArchive(process.env);
    db = new BetterSqlite3(path.resolve(databasePath), { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.defaultSafeIntegers(true);
    const result = await archiveRetainedMedia(db, new ContentAddressedArtifactStore(path.resolve(artifactRoot)), connection.archive, sha256);
    console.log(JSON.stringify({ ...result, databaseMutations: 0, localDeletions: 0 }));
  } catch {
    console.error('R2 archive did not complete verification. Local files are unchanged. Check private configuration and the selected retained image; an exact retry is safe.');
    process.exitCode = 1;
  } finally {
    connection?.close();
    db?.close();
  }
}
