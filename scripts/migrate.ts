import path from 'node:path';
import { openDatabase } from '../src/platform/db/index.js';

const argument = process.argv[2] ?? path.join('runtime', 'tdn-growth-os.sqlite');
const databasePath = path.resolve(argument);
const { db, migration } = openDatabase({ databasePath });
try {
  console.log(
    JSON.stringify({
      databasePath,
      appliedVersions: migration.applied,
      currentVersion: migration.currentVersion,
      journalMode: db.pragma('journal_mode', { simple: true }),
      foreignKeys: String(db.pragma('foreign_keys', { simple: true })),
      busyTimeoutMs: String(db.pragma('busy_timeout', { simple: true })),
    }),
  );
} finally {
  db.close();
}
