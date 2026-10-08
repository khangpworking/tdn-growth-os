import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageRequestConflictError, SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/discovery-workspace-service.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import videoIntakeSchema from '../../contracts/analysis/kalodata-video-intake-v1.schema.json' with { type: 'json' };
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import {
  AutomationKalodataVideoIntake,
  KalodataVideoRejection,
  MAX_VIDEO_TABLE_ROWS,
  MAX_VIDEO_UPLOAD_BYTES,
  MISSING_VIDEO_VALUE_DISPLAY,
  VIDEO_TABLE_HEADERS,
  CREATOR_TABLE_HEADERS,
  buildVideoTable,
  byVideoPath,
  deriveAdShare,
  deriveUnitsPer1000Views,
  expectedVideoMetadata,
  formatMissingVideoValue,
  parseVideoContext,
  parseVideoCsv,
  parseVideoTable,
  parseVideoWorkbook,
  readPreparedKalodataVideoSources,
  verifyPreparedVideoSource,
  videoPackageKey,
  videoPackageKeyPrefix,
  videoRunBindingSha256,
  type VideoRunBinding,
} from '../../src/modules/analysis/research-automation/kalodata-video-intake.js';
import type { KalodataVideoTable } from '../../contracts/analysis/kalodata-video-intake-v1.generated.js';

const now = (): Date => new Date('2026-10-06T00:00:00.000Z');
const PROVIDER_NAME = /kalodata/i;

const VIDEO_CSV = [
  'video,creator,revenue,views,units,ad_spend,publish_date,product_link',
  '"Morning boost","Dalena",1250000,20000,500,100000,2026-09-01,https://shop.example/p/1',
  '"Boost, evening","Dalena",,15000,,,2026-09-02,',
  '"Zero views","Eden",100,0,5,10,2026-09-03,https://shop.example/p/3',
].join('\r\n');

const CREATOR_CSV = [
  'creator,followers,revenue,video_count',
  'Dalena,120000,3400000,42',
  'Eden,,,3',
].join('\n');

type Table = 'video' | 'creator' | 'both';

function request(table: Table, requestKey: string): Record<string, unknown> {
  return {
    contractVersion: 'automation-video-prepare-v1',
    requestKey,
    table,
    sourceLabel: 'Synthetic video export',
    acquiredAt: '2026-10-01T00:00:00.000Z',
  };
}

async function harness(t: test.TestContext): Promise<{
  intake: AutomationKalodataVideoIntake;
  reader: FoundationSourcePackageReader;
  bound: VideoRunBinding;
  changes: () => unknown;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-video-intake-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  t.after(async () => {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const artifactRoot = path.join(root, 'artifacts');
  const intake = new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(artifactRoot), db, now);
  const reader = new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: new ContentAddressedArtifactStore(artifactRoot) }));
  const bound: VideoRunBinding = { runId: randomUUID(), workspaceId: randomUUID() };
  const changes = (): unknown => db.prepare('SELECT total_changes() n').get();
  return { intake, reader, bound, changes };
}

/** Reads the stored cited table back through the ordinary Foundation reader. */
async function readStoredTable(reader: FoundationSourcePackageReader, packageId: string): Promise<KalodataVideoTable> {
  const source = await reader.readFinalizedSourcePackage(packageId);
  const table = source.files.find(file => file.path === 'video/table.json');
  assert.ok(table);
  const parsed = parseVideoTable(table.bytes);
  assert.ok(parsed);
  return parsed;
}

test('exact header constants and missing display text', () => {
  assert.deepEqual([...VIDEO_TABLE_HEADERS], ['video', 'creator', 'revenue', 'views', 'units', 'ad_spend', 'publish_date', 'product_link']);
  assert.deepEqual([...CREATOR_TABLE_HEADERS], ['creator', 'followers', 'revenue', 'video_count']);
  assert.equal(MISSING_VIDEO_VALUE_DISPLAY, 'không có dữ liệu');
  assert.equal(formatMissingVideoValue(null), 'không có dữ liệu');
  assert.equal(formatMissingVideoValue('25'), '25');
  assert.deepEqual([{ path: 'b' }, { path: 'a' }].sort(byVideoPath).map(entry => entry.path), ['a', 'b']);
  const runId = randomUUID();
  assert.equal(videoPackageKeyPrefix(runId), `automation-video:${runId}-`);
  assert.equal(videoPackageKey(runId, 'key'), `automation-video:${runId}-key`);
  assert.match(videoRunBindingSha256({ runId, workspaceId: randomUUID() }), /^[0-9a-f]{64}$/);
  assert.ok(MAX_VIDEO_TABLE_ROWS >= 1 && MAX_VIDEO_UPLOAD_BYTES > 0);
});

test('derived metrics never divide by zero and never invent zero', () => {
  assert.equal(deriveUnitsPer1000Views('500', '20000'), '25');
  assert.equal(deriveUnitsPer1000Views('1', '3000'), '0.33');
  assert.equal(deriveAdShare('100000', '1250000'), '0.08');
  assert.equal(deriveAdShare('1', '3000'), '0.0003');
  assert.equal(deriveUnitsPer1000Views(null, '20000'), null);
  assert.equal(deriveUnitsPer1000Views('500', null), null);
  assert.equal(deriveUnitsPer1000Views('5', '0'), null);
  assert.equal(deriveUnitsPer1000Views('0', '20000'), '0');
  assert.equal(deriveAdShare(null, '1250000'), null);
  assert.equal(deriveAdShare('100000', null), null);
  assert.equal(deriveAdShare('10', '0'), null);
  assert.equal(deriveAdShare('0.0000000001', '0.0000000002'), '0.5');
  assert.equal(deriveAdShare('1.2345499999', '1'), '1.2345');
  assert.equal(deriveAdShare('1.2345500000', '1'), '1.2346');
  assert.equal(deriveAdShare('0', '0.0000000001'), '0');
  assert.equal(deriveAdShare('1', '0.0000000000'), null);
});

test('csv parsing keeps quoted commas and rejects malformed quotes', () => {
  const grid = parseVideoCsv(Buffer.from('"a,b",c\r\n1,2\r\n'));
  assert.deepEqual(grid, [['a,b', 'c'], ['1', '2']]);
  assert.deepEqual(parseVideoCsv(Buffer.from('"a""b",c')), [['a"b', 'c']]);
  assert.throws(() => parseVideoCsv(Buffer.from('"unterminated,cell\n')), /MALFORMED_CSV_QUOTE/);
  assert.throws(() => parseVideoCsv(Buffer.from([0xff, 0xfe])), /INVALID_CSV_UTF8/);
});

test('stored CSV lineage retains blank source records for both table profiles', async t => {
  const { intake, reader, bound } = await harness(t);
  for (const [table, csv] of [['video', VIDEO_CSV], ['creator', CREATOR_CSV]] as const) {
    const [header, ...rows] = csv.split(/\r?\n/);
    const width = table === 'video' ? VIDEO_TABLE_HEADERS.length : CREATOR_TABLE_HEADERS.length;
    const withBlanks = [header, '', rows[0], ','.repeat(width - 1), '   ', ...rows.slice(1), ''].join('\r\n');
    const receipt = await intake.prepare(request(table, randomUUID()), Buffer.from(withBlanks), 'export.csv', bound);
    const stored = await readStoredTable(reader, receipt.packageId);
    assert.deepEqual((table === 'video' ? stored.videos : stored.creators).map(row => row.line),
      rows.map((_, index) => `csv:row:${index === 0 ? 3 : index + 5}`));
  }
});

/** A valid flat workbook with synthetic inert padding members. */
function paddedWorkbook(paddingSizes: readonly number[], rowXml = '<c r="A2" t="inlineStr"><is><t>Synthetic creator</t></is></c>'): Buffer {
  const header = CREATOR_TABLE_HEADERS.map((value, index) =>
    `<c r="${String.fromCharCode(65 + index)}1" t="inlineStr"><is><t>${value}</t></is></c>`).join('');
  const members: [string, Buffer][] = [
    ['xl/workbook.xml', Buffer.from('<workbook><sheets><sheet name="creators" r:id="rId1"/></sheets></workbook>')],
    ['xl/_rels/workbook.xml.rels', Buffer.from('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')],
    ['xl/worksheets/sheet1.xml', Buffer.from(`<worksheet><sheetData><row r="1">${header}</row><row r="2">${rowXml}</row></sheetData></worksheet>`)],
    ...paddingSizes.map((size, index): [string, Buffer] => [`padding/${index}.xml`, Buffer.alloc(size, 32)]),
  ];
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of members) {
    const filename = Buffer.from(name);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const entry = Buffer.alloc(30);
    entry.writeUInt32LE(0x04034b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(8, 8);
    entry.writeUInt32LE(checksum, 14);
    entry.writeUInt32LE(compressed.length, 18);
    entry.writeUInt32LE(data.length, 22);
    entry.writeUInt16LE(filename.length, 26);
    local.push(entry, filename, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += entry.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

test('XLSX inflation honors member and aggregate limits with typed size errors', () => {
  const mib = 1024 * 1024;
  assert.equal(buildVideoTable(paddedWorkbook([9 * mib]), 'export.xlsx', 'creator').creators.length, 1);
  for (const sizes of [[33 * mib], [32 * mib, 32 * mib]]) {
    assert.throws(() => buildVideoTable(paddedWorkbook(sizes), 'export.xlsx', 'creator'),
      (error: unknown) => error instanceof KalodataVideoRejection && error.code === 'WORKBOOK_SIZE_LIMIT');
  }
});

test('XLSX preserves entity text and rejects ambiguous or unsupported cells', async t => {
  await t.test('entity escapes are decoded exactly once', () => {
    const workbook = paddedWorkbook([], '<c r="A2" t="inlineStr"><is><t>Literal &amp;#65; &amp;lt; &#65; &#x1F600;</t></is></c>');
    assert.equal(buildVideoTable(workbook, 'export.xlsx', 'creator').creators[0]?.creator, 'Literal &#65; &lt; A 😀');
  });
  for (const entity of ['&#1114112;', '&#0;', '&#xD800;']) {
    await t.test(`invalid XML codepoint ${entity} is a typed rejection`, () => {
      assert.throws(() => buildVideoTable(paddedWorkbook([], `<c r="A2" t="inlineStr"><is><t>${entity}</t></is></c>`), 'export.xlsx', 'creator'),
        (error: unknown) => error instanceof KalodataVideoRejection && error.code === 'UNSUPPORTED_XML');
    });
  }
  await t.test('unterminated ampersand runs are rejected before cell mapping', () => {
    assert.throws(() => buildVideoTable(paddedWorkbook([], `<c r="A2" t="inlineStr"><is><t>${'&'.repeat(10000)}</t></is></c>`), 'export.xlsx', 'creator'),
      (error: unknown) => error instanceof KalodataVideoRejection && error.code === 'UNSUPPORTED_XML');
  });
  await t.test('duplicate references cannot overwrite evidence', () => {
    assert.throws(() => buildVideoTable(paddedWorkbook([], '<c r="C2"><v>1250000</v></c><c r="C2"><v>9</v></c>'), 'export.xlsx', 'creator'), /DUPLICATE_CELL/);
  });
  for (const formula of ['<f/>', '<f t="shared"/>', '<f>1+1</f>']) {
    await t.test(`formula ${formula} is rejected even with a cached value`, () => {
      assert.throws(() => buildVideoTable(paddedWorkbook([], `<c r="C2">${formula}<v>2</v></c>`), 'export.xlsx', 'creator'), /FORMULA_NOT_ALLOWED/);
    });
  }
});

test('CSV does not repair characters after a closing quote or impossible dates', async t => {
  const header = VIDEO_TABLE_HEADERS.join(',');
  for (const revenue of ['"1"2', '"1" ', '"1"x']) {
    await t.test(`malformed numeric ${revenue}`, () => {
      assert.throws(() => buildVideoTable(Buffer.from(`${header}\nv,c,${revenue},1,1,1,,`), 'export.csv', 'video'), /MALFORMED_CSV_QUOTE/);
    });
  }
  for (const date of ['2026-02-31', '2026-04-31', '2100-02-29']) {
    await t.test(`invalid calendar date ${date}`, () => {
      assert.throws(() => buildVideoTable(Buffer.from(`${header}\nv,c,1,1,1,1,${date},`), 'export.csv', 'video'), /INVALID_DATE_VALUE/);
    });
  }
  for (const date of ['2024-02-29', '2000-02-29', '2026-04-30']) {
    assert.equal(buildVideoTable(Buffer.from(`${header}\nv,c,1,1,1,1,${date},`), 'export.csv', 'video').videos[0]?.publishDate, date);
  }
});

test('package read budgets reject expanded members and total bytes before storage', async t => {
  const { intake, reader, bound, changes } = await harness(t);
  for (const [title, count] of [['x'.repeat(10000), 450], ['\u0001'.repeat(10000), 150]] as const) {
    const caseBound = { ...bound, runId: randomUUID() };
    const csv = Buffer.from([VIDEO_TABLE_HEADERS.join(','), ...Array.from({ length: count }, () => `${title},creator,1,1,1,1,,`)].join('\n'));
    assert.ok(csv.length < MAX_VIDEO_UPLOAD_BYTES);
    buildVideoTable(csv, 'export.csv', 'video');
    const key = randomUUID();
    const before = changes();
    await assert.rejects(intake.prepare(request('video', key), csv, 'export.csv', caseBound),
      (error: unknown) => error instanceof KalodataVideoRejection && error.code === 'VIDEO_PACKAGE_TOO_LARGE');
    assert.deepEqual(changes(), before);
    assert.equal(intake.hasRequest(caseBound.runId, key), false);
    assert.deepEqual((await readPreparedKalodataVideoSources(reader, caseBound)).sources, []);
    const retried = await intake.prepare(request('video', key), Buffer.from(VIDEO_CSV), 'export.csv', caseBound);
    assert.equal(retried.exactRetry, false);
    assert.equal((await readStoredTable(reader, retried.packageId)).videos.length, 3);
  }
});

test('workbook reader rejects non-archives', () => {
  assert.throws(() => parseVideoWorkbook(Buffer.from('not a workbook'.padEnd(64, '.'))), /WORKBOOK_ARCHIVE_INVALID/);
  assert.throws(() => parseVideoWorkbook(Buffer.alloc(0)), /FILE_SIZE_LIMIT/);
});

test('stored table parsing is closed and canonical', () => {
  assert.equal(parseVideoTable(Buffer.from('{}')), undefined);
  assert.equal(parseVideoTable(Buffer.from('not json')), undefined);
  assert.equal(parseVideoContext(Buffer.from('{}')), undefined);
  assert.equal(parseVideoContext(Buffer.from('not json')), undefined);
});

test('video csv with missing cells prepares cited rows with nulls, never zeros', async t => {
  const { intake, reader, bound, changes } = await harness(t);
  const key = randomUUID();
  const before = changes();
  const receipt = await intake.prepare(request('video', key), Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound);
  assert.equal(receipt.contractVersion, 'automation-video-prepared-v1');
  assert.equal(receipt.state, 'PREPARED_NOT_ADMITTED');
  assert.equal(receipt.exactRetry, false);
  assert.equal(receipt.videoCount, 3);
  assert.equal(receipt.creatorCount, 0);
  assert.equal(receipt.provenance, 'OPERATOR_SUPPLIED_UNVERIFIED');
  assert.equal(receipt.files.length, 4);
  assert.deepEqual(receipt.files.map(file => file.path), [...receipt.files.map(file => file.path)].sort());
  assert.ok(receipt.files.some(file => file.path === 'video/export.csv'));
  assert.ok(receipt.files.some(file => file.path === 'video/table.json'));
  assert.ok(intake.hasRequest(bound.runId, key));
  assert.ok(!intake.hasRequest(bound.runId, randomUUID()));
  assert.notDeepEqual(changes(), before);

  const stored = await readStoredTable(reader, receipt.packageId);
  assert.equal(stored.exportKind, 'csv');
  assert.deepEqual(stored.tables, ['video']);
  assert.equal(stored.missingDisplay, 'không có dữ liệu');
  const [first, second, third] = stored.videos;
  assert.equal(first?.line, 'csv:row:2');
  assert.equal(first?.unitsPer1000Views, '25');
  assert.equal(first?.adShare, '0.08');
  assert.equal(second?.line, 'csv:row:3');
  assert.equal(second?.video, 'Boost, evening');
  assert.equal(second?.revenue, null);
  assert.equal(second?.units, null);
  assert.equal(second?.adSpend, null);
  assert.equal(second?.productLink, null);
  assert.equal(second?.unitsPer1000Views, null);
  assert.equal(second?.adShare, null);
  assert.equal(third?.line, 'csv:row:4');
  assert.equal(third?.views, '0');
  assert.equal(third?.unitsPer1000Views, null);
  assert.equal(third?.adShare, '0.1');
  // Observed zero stays an explicit zero and is distinct from a missing value.
  assert.ok(stored.videos.some(row => row.views === '0'));
  assert.ok(stored.videos.some(row => row.views === null || row.units === null));
  assert.ok(!PROVIDER_NAME.test(canonicalJson(receipt)), 'no provider name in the owner-facing receipt');
  assert.ok(!PROVIDER_NAME.test(canonicalJson(stored)), 'no provider name in the cited table');
});

test('creator csv prepares and reloads through the prepared inventory', async t => {
  const { intake, reader, bound } = await harness(t);
  const key = randomUUID();
  const receipt = await intake.prepare(request('creator', key), Buffer.from(CREATOR_CSV, 'utf8'), 'creators.csv', bound);
  assert.equal(receipt.videoCount, 0);
  assert.equal(receipt.creatorCount, 2);
  const stored = await readStoredTable(reader, receipt.packageId);
  assert.equal(stored.creators[0]?.line, 'csv:row:2');
  assert.equal(stored.creators[0]?.followers, '120000');
  assert.equal(stored.creators[1]?.followers, null);
  assert.equal(stored.creators[1]?.videoCount, '3');

  const list = await readPreparedKalodataVideoSources(reader, bound);
  assert.equal(list.contractVersion, 'automation-video-prepared-list-v1');
  assert.equal(list.workspaceId, bound.workspaceId);
  assert.equal(list.runId, bound.runId);
  assert.equal(list.sources.length, 1);
  assert.equal(list.sources[0]?.packageId, receipt.packageId);
  assert.equal(list.sources[0]?.creatorCount, 2);
  assert.deepEqual(list.sources[0]?.request, request('creator', key));
  assert.ok(!PROVIDER_NAME.test(canonicalJson(list)), 'no provider name in the owner-facing list');
});

test('xlsx workbook with both sheets prepares cited rows with sheet lineage', async () => {
  const workbook = await fs.readFile(new URL('../fixtures/kalodata-video-both.xlsx', import.meta.url));
  const table = buildVideoTable(workbook, 'export.xlsx', 'both');
  assert.deepEqual(table.tables, ['video', 'creator']);
  assert.equal(table.videos.length, 3);
  assert.equal(table.creators.length, 2);
  assert.equal(table.videos[0]?.line, 'xlsx:videos:row:2');
  assert.equal(table.videos[0]?.unitsPer1000Views, '25');
  assert.equal(table.videos[1]?.revenue, null);
  assert.equal(table.videos[1]?.unitsPer1000Views, null);
  assert.equal(table.videos[2]?.unitsPer1000Views, null);
  assert.equal(table.creators[1]?.line, 'xlsx:creators:row:3');
  assert.equal(table.creators[1]?.followers, null);
});

test('xlsx both-tables upload is stored and readable for later report blocks', async t => {
  const { intake, reader, bound } = await harness(t);
  const workbook = await fs.readFile(new URL('../fixtures/kalodata-video-both.xlsx', import.meta.url));
  const receipt = await intake.prepare(request('both', randomUUID()), workbook, 'export.xlsx', bound);
  assert.equal(receipt.videoCount, 3);
  assert.equal(receipt.creatorCount, 2);
  const list = await readPreparedKalodataVideoSources(reader, bound);
  assert.equal(list.sources.length, 1);
  const stored = await readStoredTable(reader, receipt.packageId);
  assert.equal(stored.videos[0]?.productLink, 'https://shop.example/p/1');
  assert.equal(stored.exportKind, 'xlsx');
});

test('wrong headers are rejected with typed errors and store nothing', async t => {
  const cases: [string, string, Table, RegExp][] = [
    ['video,creator,revenue,views,units,ad_spend,publish_date\n"v","c",1,2,3,4,2026-09-01', 'export.csv', 'video', /HEADER_MISMATCH/],
    ['video,creator,WRONG,views,units,ad_spend,publish_date,product_link\n"v","c",1,2,3,4,2026-09-01,https://x.example', 'export.csv', 'video', /HEADER_MISMATCH/],
    ['video,creator,revenue,views,units,ad_spend,publish_date,product_link,extra\n"v","c",1,2,3,4,2026-09-01,https://x.example,z', 'export.csv', 'video', /HEADER_MISMATCH/],
    ['creator,followers,revenue\nDalena,1,2', 'creators.csv', 'creator', /HEADER_MISMATCH/],
  ];
  for (const [body, filename, table, reason] of cases) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-video-header-'));
    const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
    try {
      const intake = new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(path.join(root, 'artifacts')), db, now);
      const bound: VideoRunBinding = { runId: randomUUID(), workspaceId: randomUUID() };
      const before = db.prepare('SELECT total_changes() n').get();
      await assert.rejects(intake.prepare(request(table, randomUUID()), Buffer.from(body, 'utf8'), filename, bound), reason);
      assert.deepEqual(db.prepare('SELECT total_changes() n').get(), before);
    } finally {
      db.close();
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

test('unsupported file types, kind mismatches and bad values are rejected', async t => {
  const { intake, bound } = await harness(t);
  const video = request('video', randomUUID());
  await assert.rejects(intake.prepare(video, Buffer.from(VIDEO_CSV, 'utf8'), 'export.txt', bound), /UNSUPPORTED_FILE_TYPE/);
  await assert.rejects(intake.prepare(request('both', randomUUID()), Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound), /TABLE_KIND_MISMATCH/);
  await assert.rejects(intake.prepare({ ...video, requestKey: 'not-a-uuid' }, Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound), /REQUEST_INVALID/);
  const bad = (row: string): Buffer =>
    Buffer.from(`video,creator,revenue,views,units,ad_spend,publish_date,product_link\n${row}`, 'utf8');
  await assert.rejects(intake.prepare(video, bad('"v","c",abc,2,3,4,2026-09-01,https://x.example'), 'export.csv', bound), /INVALID_NUMERIC_VALUE/);
  await assert.rejects(intake.prepare(video, bad('"v","c",1,2,3,4,09-01-2026,https://x.example'), 'export.csv', bound), /INVALID_DATE_VALUE/);
  await assert.rejects(intake.prepare(video, bad('"v","c",1,2,3,4,2026-09-01,nota-link'), 'export.csv', bound), /INVALID_LINK_VALUE/);
  await assert.rejects(
    intake.prepare(video, Buffer.from('video,creator,revenue,views,units,ad_spend,publish_date,product_link', 'utf8'), 'export.csv', bound),
    /ROW_RANGE_MISMATCH|EMPTY_TABLE/,
  );
  const workbook = await fs.readFile(new URL('../fixtures/kalodata-video-both.xlsx', import.meta.url));
  await assert.rejects(intake.prepare(request('video', randomUUID()), workbook, 'export.xlsx', bound), /SHEET_SET_MISMATCH/);
});

test('oversize files are rejected before any mutation', async t => {
  const { intake, bound, changes } = await harness(t);
  const before = changes();
  await assert.rejects(
    intake.prepare(request('video', randomUUID()), Buffer.alloc(MAX_VIDEO_UPLOAD_BYTES + 1), 'export.csv', bound),
    /FILE_SIZE_LIMIT/,
  );
  assert.deepEqual(changes(), before);
});

test('exact retries deduplicate and conflicting content is rejected', async t => {
  const { intake, bound, changes } = await harness(t);
  const key = randomUUID();
  const first = await intake.prepare(request('video', key), Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound);
  assert.equal(first.exactRetry, false);
  const before = changes();
  const second = await intake.prepare(request('video', key), Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound);
  assert.equal(second.exactRetry, true);
  assert.equal(second.packageId, first.packageId);
  assert.deepEqual(changes(), before);
  await assert.rejects(
    intake.prepare(request('video', key), Buffer.from(VIDEO_CSV.replace('20000', '20001'), 'utf8'), 'export.csv', bound),
    SourcePackageRequestConflictError,
  );
});

test('prepared inventory fails closed on binding mismatch and reads empty runs', async t => {
  const { intake, reader, bound } = await harness(t);
  const receipt = await intake.prepare(request('video', randomUUID()), Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound);
  const empty = await readPreparedKalodataVideoSources(reader, { runId: randomUUID(), workspaceId: bound.workspaceId });
  assert.deepEqual(empty.sources, []);
  const source = await reader.readFinalizedSourcePackage(receipt.packageId);
  const entry = { packageId: receipt.packageId, packageKey: source.manifest.packageKey, manifestArtifactSha256: receipt.manifestArtifactSha256, version: 1 };
  const verified = await verifyPreparedVideoSource(reader, bound, source, entry);
  assert.equal(verified.packageId, receipt.packageId);
  assert.equal(verified.videoCount, 3);
  await assert.rejects(
    verifyPreparedVideoSource(reader, { runId: bound.runId, workspaceId: randomUUID() }, source, entry),
    /ORIGIN_BINDING_MISMATCH/,
  );
});

test('metadata helper returns undefined without the export member', () => {
  assert.equal(expectedVideoMetadata(randomUUID(), new Map([['video/table.json', new Uint8Array([1])]])), undefined);
  const runId = randomUUID();
  const bytes = new Map([
    ['video/export.csv', Buffer.from('x')],
    ['video/table.json', Buffer.from('y')],
    ['video/context.json', Buffer.from('z')],
    ['normalized/automation-video-source.json', Buffer.from('w')],
  ]);
  const files = expectedVideoMetadata(runId, bytes);
  assert.equal(files?.length, 4);
  assert.deepEqual(files?.map(file => file.path), [...(files?.map(file => file.path) ?? [])].sort());
});

test('owner-facing messages never name the source provider', async t => {  const { intake, reader, bound } = await harness(t);
  const messages: string[] = [];
  for (const attempt of [
    intake.prepare(request('video', randomUUID()), Buffer.from(VIDEO_CSV, 'utf8'), 'export.txt', bound),
    intake.prepare(request('both', randomUUID()), Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound),
    intake.prepare(request('video', randomUUID()), Buffer.alloc(MAX_VIDEO_UPLOAD_BYTES + 1), 'export.csv', bound),
  ]) {
    await assert.rejects(attempt, (error: unknown) => {
      assert.ok(error instanceof KalodataVideoRejection);
      messages.push(error.message);
      return true;
    });
  }
  const receipt = await intake.prepare(request('video', randomUUID()), Buffer.from(VIDEO_CSV, 'utf8'), 'export.csv', bound);
  messages.push(canonicalJson(receipt));
  messages.push(canonicalJson(await readStoredTable(reader, receipt.packageId)));
  messages.push(canonicalJson(await readPreparedKalodataVideoSources(reader, bound)));
  assert.ok(messages.length >= 6);
  for (const message of messages) assert.ok(!PROVIDER_NAME.test(message), `owner-facing text must not name the provider: ${message.slice(0, 80)}`);
});

// Owns the new upload route only: authentication, run binding, exact bytes and
// the read inventory. Parsing and storage semantics stay covered above.
test('video upload route prepares an exact cited table without confirmation', async () => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ strict: true, allErrors: false });
  addFormats(ajv);
  ajv.addSchema(videoIntakeSchema);
  const validateReceipt = ajv.compile({ $ref: `${videoIntakeSchema.$id}#/$defs/receipt` });
  const validateList = ajv.compile({ $ref: `${videoIntakeSchema.$id}#/$defs/preparedList` });

  const ownerToken = 'owner-token-video-route-test-0123456789abcdef';
  const routeWorkspaceId = '22222222-2222-4222-8222-222222222222';
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-video-route-'));
  const databasePath = path.join(root, 'research.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  try {
    const setup = openDatabase({ databasePath, now });
    const workspaces = new DiscoveryWorkspaceService({
      db: setup.db,
      artifactStore: new ContentAddressedArtifactStore(artifactRoot),
      uuid: () => routeWorkspaceId,
      now,
    });
    await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'video-route-test', title: 'Video route test workspace' });
    setup.db.close();

    const probe = http.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) => probe.close(error => (error ? reject(error) : resolve())));
    const base = `http://127.0.0.1:${port}`;
    const application = openResearchAutomationApi({
      databasePath,
      artifactRoot,
      origin: base,
      providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
      owner: { writeEnabled: true, databasePath, artifactRoot, token: ownerToken, allowedOrigin: base, actorId: 'owner:research' },
    });
    const server = http.createServer(application.handler);
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
    try {
      const started = await fetch(`${base}/owner-api/workspaces/${routeWorkspaceId}/research-automation/runs`, {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          contractVersion: 'research-automation-start-v1',
          requestKey: randomUUID(),
          mode: 'CATEGORY',
          requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' },
          keyword: 'synthetic video research',
          reports: ['MARKET', 'INSIGHT'],
        }),
      });
      assert.equal(started.status, 202);
      const runId = ((await started.json()) as { run: { runId: string } }).run.runId;
      const route = `${base}/owner-api/workspaces/${routeWorkspaceId}/research-automation/runs/${runId}/sources/kalodata-video`;
      const listUrl = `${base}/api/workspaces/${routeWorkspaceId}/research-automation/runs/${runId}/sources/kalodata-video`;
      const metadata = request('video', randomUUID());
      const upload = (body: unknown = metadata, bytes: Buffer = Buffer.from(VIDEO_CSV, 'utf8'), authorized = true): Promise<Response> => {
        const form = new FormData();
        form.set('metadata', JSON.stringify(body));
        form.set('file', new Blob([new Uint8Array(bytes)], { type: 'text/csv' }), 'export.csv');
        return fetch(route, { method: 'POST', headers: { Origin: base, ...(authorized ? { Authorization: `Bearer ${ownerToken}` } : {}) }, body: form });
      };

      assert.equal((await upload(metadata, Buffer.from(VIDEO_CSV, 'utf8'), false)).status, 401);
      const rejected = await upload({ ...metadata, table: 'video', requestKey: randomUUID() }, Buffer.from(VIDEO_CSV.replace('views', 'WRONG'), 'utf8'));
      assert.equal(rejected.status, 400);
      const rejection = (await rejected.json()) as { error: { code: string; message: string } };
      assert.equal(rejection.error.code, 'source_input_rejected');
      assert.equal(rejection.error.message, 'Tệp video không đúng cấu trúc được hỗ trợ.');
      assert.ok(!PROVIDER_NAME.test(rejection.error.message));

      const created = await upload();
      assert.equal(created.status, 201);
      const receipt = (await created.json()) as Record<string, unknown>;
      assert.equal(validateReceipt(receipt), true);
      assert.equal(receipt['state'], 'PREPARED_NOT_ADMITTED');
      assert.equal(receipt['videoCount'], 3);
      assert.ok(!PROVIDER_NAME.test(JSON.stringify(receipt)));

      const listed = await fetch(listUrl);
      assert.equal(listed.status, 200);
      const list = (await listed.json()) as { sources: { packageId: string }[] };
      assert.equal(validateList(list), true);
      assert.equal(list.sources.length, 1);
      assert.equal(list.sources[0]?.packageId, receipt['packageId']);

      const retried = await upload();
      assert.equal(retried.status, 200);
      assert.deepEqual(await retried.json(), { ...receipt, exactRetry: true });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
      await application.close();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
