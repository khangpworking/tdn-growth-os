// Loaded before the real CLI. No fallback to the original fetch is allowed.
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(process.env.RAWDB_Y_FETCH_CONFIG, 'utf8'));
let ordinal = 0;
globalThis.fetch = async (url, init) => {
  const call = { url: String(url), method: init?.method, body: JSON.parse(String(init?.body)),
    calledAt: new Date().toISOString() };
  fs.appendFileSync(config.log, JSON.stringify(call) + '\n');
  const response = config.responses.find(r => r.text !== undefined &&
    Object.values(call.body.state ?? {}).some(state => state.endsWith('Đánh giá: ' + r.text))) ?? config.responses[ordinal];
  ordinal++;
  if (!response) throw new Error('unexpected synthetic fetch');
  return new Response(response.raw, { status: response.status ?? 200,
    headers: { 'content-type': 'application/json' } });
};
