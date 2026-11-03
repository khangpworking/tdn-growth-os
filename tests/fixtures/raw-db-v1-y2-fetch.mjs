import fs from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const config = JSON.parse(fs.readFileSync(process.env.RAWDB_Y2_FETCH_CONFIG, 'utf8'));
let ordinal = 0;
globalThis.fetch = async (url, init) => {
  fs.appendFileSync(config.log, JSON.stringify({ url: String(url), method: init?.method,
    body: JSON.parse(String(init?.body)), calledAt: new Date().toISOString() }) + '\n');
  const response = config.responses[ordinal++];
  if (!response) throw new Error('unexpected synthetic Y2 fetch');
  while (config.release && !fs.existsSync(config.release)) await setTimeout(25);
  return new Response(response.raw, { status: 200, headers: { 'content-type': 'application/json' } });
};
// Finish the CLI's expensive dependency initialization before the parent measures a lock wait.
// This only warms real modules; it neither opens the app DB nor substitutes any application behavior.
await Promise.all([
  '../../src/modules/raw-db/shopee-reviews-loader.js',
  '../../src/modules/raw-db/google-search-loader.js',
  '../../src/modules/raw-db/tiktok-comments-loader.js',
  '../../src/modules/raw-db/kalodata-video-loader.js',
  '../../src/modules/raw-db/video-reading-loader.js',
  '../../src/modules/raw-db/review-code-loader.js',
  '../../src/modules/raw-db/review-labeller.js',
  '../../src/platform/artifacts/index.js',
  '../../src/platform/ai/typesafe-jev-client.js',
  '../../src/platform/collectors/apify-tiktok-comments-free.js',
].map(module => import(new URL(module, import.meta.url).href)));
fs.writeFileSync(config.ready, 'preload ready');
