import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCaptureSpec, isAutorunCaptureStopCode } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { runMetricCapture } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';

// A1-A3 own the derivation contract. The production caller still supplies one
// keyword, per the owner decision documented in the P1 code result.
const period = { startDate: '2026-09-03', endDate: '2026-10-02' };

test('A1 confirmed scope keeps the first two terms in order with Smart query on', () => {
  const spec = buildCaptureSpec(['viên uống kẽm', 'viên kẽm', 'kẽm'], period);
  assert.deepEqual(spec.keywords, ['viên uống kẽm', 'viên kẽm']);
  assert.equal(spec.smartQuery, true);
  assert.equal(spec.category, null);
});

test('A2 one confirmed term produces one keyword', () => {
  const spec = buildCaptureSpec(['viên uống kẽm'], period);
  assert.deepEqual(spec.keywords, ['viên uống kẽm']);
});

test('A3 case, surrounding space and NFC-equivalent duplicates use one keyword slot', () => {
  const spec = buildCaptureSpec([
    '  Viên uống kẽm  ', 'VIÊN UỐNG KẼM', 'viên uống kẽm'.normalize('NFD'), 'viên kẽm', 'kẽm',
  ], period);
  assert.deepEqual(spec.keywords, ['Viên uống kẽm', 'viên kẽm']);
});

function assertA4(spec: Record<string, unknown>): void {
  assert.equal(spec.smartQuery, true, 'A4 adapter payload must request smartQuery: true');
}

// Derived from metric-capture-runner.test.ts: replay the READY response and
// manifest read-back without starting OpenCLI or accessing a browser/provider.
async function capture(readBack: boolean | undefined) {
  const root = await mkdtemp(join(tmpdir(), 'v3plug-p1-'));
  const manifest = new TextEncoder().encode('synthetic adapter manifest for tests');
  const payloads: Record<string, unknown>[] = [];
  try {
    const result = await runMetricCapture({
      enabledEnv: '1', captureRoot: root, adapterManifestPath: '/synthetic/adapter/manifest.json',
      adapterManifestSha256: createHash('sha256').update(manifest).digest('hex'),
    }, {
      runId: '00000000-0000-4000-8000-000000000001', keyword: 'viên uống kẽm',
      requestedPeriod: { startDate: '2025-10-05', endDate: '2026-10-02' },
    }, {
      sourceEnv: {}, readManifest: async () => manifest,
      createProcessRunner: () => async (_executable, argv) => {
        // Observe the actual file selected by the real executor's --spec arg:
        // this is the final app-side payload consumed by the adapter.
        const specPath = argv[argv.indexOf('--spec') + 1];
        const outputDir = argv[argv.indexOf('--out') + 1];
        assert.ok(specPath && outputDir, 'adapter invocation names its spec and output');
        payloads.push(JSON.parse(await readFile(specPath, 'utf8')) as Record<string, unknown>);
        await mkdir(outputDir, { recursive: true });
        await writeFile(join(outputDir, 'manifest.json'), JSON.stringify({
          appliedFilters: readBack === undefined ? {} : { smartQuery: readBack },
        }));
        return {
          child: { kill: () => true },
          completion: Promise.resolve({ exitCode: 0, stdout: '[{"status":"READY"}]', stderr: '' }),
        };
      },
    });
    return { result, payloads };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('A4 Smart query reaches the adapter payload at the last app-side hop', async () => {
  const { result, payloads } = await capture(true);
  assert.equal(result.ok, true);
  assert.equal(payloads.length, 1, 'the adapter received one capture request');
  assertA4(payloads[0]!);
});

test('A5 adapter Smart query false or absent stops with CAPTURE_SMART_QUERY_OFF', async () => {
  for (const readBack of [false, undefined]) {
    const { result } = await capture(readBack);
    assert.equal(result.ok, false, `read-back ${String(readBack)} must stop the capture`);
    assert.ok(!result.ok);
    assert.equal(result.code, 'CAPTURE_SMART_QUERY_OFF');
    assert.equal(result.executorCalls, 1, 'do not retry or proceed with the wrong search');
    assert.equal(isAutorunCaptureStopCode(result.code), true);
  }
});

test('A4 negative control: omitting Smart query fails the same payload check', async () => {
  const { result, payloads } = await capture(true);
  assert.equal(result.ok, true);
  assert.equal(payloads.length, 1);
  assertA4(payloads[0]!);
  const wrongSpec = { ...payloads[0]! };
  delete wrongSpec.smartQuery;
  assert.throws(() => assertA4(wrongSpec), {
    code: 'ERR_ASSERTION', message: /A4 adapter payload must request smartQuery: true/,
  });
});
