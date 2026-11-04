// Loaded before the real CLI. No fallback to the original fetch is allowed.
import fs from 'node:fs';
import Database from 'better-sqlite3';

const config = JSON.parse(fs.readFileSync(process.env.RAWDB_Y_FETCH_CONFIG, 'utf8'));
let ordinal = 0;
globalThis.fetch = async (url, init) => {
  if (ordinal === 0 && config.committedReviewsDb) {
    const db = new Database(config.committedReviewsDb, { readonly: true, fileMustExist: true });
    try {
      if (db.prepare('SELECT count(*) FROM review').pluck().get() === 0) {
        throw new Error('S05 reviews must be committed before Jev is called');
      }
    } finally { db.close(); }
  }
  const call = { url: String(url), method: init?.method, body: JSON.parse(String(init?.body)),
    calledAt: new Date().toISOString() };
  fs.appendFileSync(config.log, JSON.stringify(call) + '\n');
  const response = config.responses.find(r => r.text !== undefined &&
    Object.values(call.body.state ?? {}).some(state => state.includes('\nLời viết: ' + r.text + '\n'))) ?? config.responses[ordinal];
  ordinal++;
  if (!response) throw new Error('unexpected synthetic fetch');
  return new Response(response.raw, { status: response.status ?? 200,
    headers: { 'content-type': 'application/json' } });
};
