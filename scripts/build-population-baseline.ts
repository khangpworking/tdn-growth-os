// Builds the S28 whole-population baseline file from the distribution CSV. The output stays on the server; it is not committed.
// Usage: npx tsx scripts/build-population-baseline.ts --csv <persona_dist.csv> --revision <text> --out <file.json>
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildPopulationBaseline } from '../src/modules/analysis/research-automation/population-baseline-build.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

try {
  const { values } = parseArgs({ options: { csv: { type: 'string' }, revision: { type: 'string' }, out: { type: 'string' } }, strict: true });
  if (!values.csv || !values.revision || !values.out) throw new Error('Usage: build-population-baseline --csv <persona_dist.csv> --revision <text> --out <file.json>');
  const baseline = buildPopulationBaseline(await fs.readFile(path.resolve(values.csv), 'utf8'), values.revision, new Date().toISOString());
  const out = path.resolve(values.out);
  await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
  const handle = await fs.open(out, 'wx', 0o600);
  try { await handle.writeFile(`${canonicalJson(baseline)}\n`, 'utf8'); }
  finally { await handle.close(); }
  console.log(JSON.stringify({ rowCount: baseline.rowCount, total: baseline.total, sexAgeRows: baseline.sexAge.rows.length,
    regionRows: baseline.region.rows.length, zoneRows: baseline.zone.rows.length, bytes: (await fs.stat(out)).size }));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Population baseline build failed');
  process.exitCode = 1;
}
