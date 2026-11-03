import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';

// Independent storage contract: data/raw-sources/KHUON-CSDL.md §5, scoped by COMMON.md.
const columns = {
  raw_capture: `capture_id:TEXT run_id:TEXT source_code:TEXT provider:TEXT operation:TEXT endpoint:TEXT
    request_params_json:TEXT keyword:TEXT period_start:TEXT period_end:TEXT requested_at:TEXT completed_at:TEXT
    http_status:INTEGER outcome:TEXT billing:TEXT cost_unit:TEXT cost_amount:REAL response_sha256:TEXT raw_path:TEXT response_sha256_basis:TEXT`,
  product: `product_key:TEXT platform:TEXT item_id:TEXT shop_id:TEXT shop_name:TEXT product_name:TEXT brand:TEXT
    category_path:TEXT product_url:TEXT launch_date:TEXT first_capture_id:TEXT`,
  review: `review_key:TEXT source_code:TEXT platform:TEXT kind:TEXT external_id:TEXT product_key:TEXT video_url:TEXT
    reviewer_key:TEXT reviewer_name:TEXT reviewer_name_state:TEXT rating_star:INTEGER text:TEXT variation:TEXT
    attributes_json:TEXT posted_at:TEXT like_count:INTEGER reply_count:INTEGER replies_to_external_id:TEXT
    media_count:INTEGER state:TEXT collected_at:TEXT capture_id:TEXT source_position:TEXT`,
  run_review: 'run_id:TEXT review_key:TEXT capture_id:TEXT source_position:TEXT',
} as const;
type Table = keyof typeof columns;
const required: Record<Table, readonly string[]> = {
  raw_capture: ['capture_id', 'source_code', 'provider', 'operation', 'requested_at', 'outcome'],
  product: ['product_key', 'platform', 'item_id', 'product_name', 'first_capture_id'],
  review: ['review_key', 'source_code', 'platform', 'kind', 'external_id', 'reviewer_name_state', 'state',
    'collected_at', 'capture_id', 'source_position'],
  run_review: ['run_id', 'review_key', 'capture_id'],
};
const primaryKeys: Record<Table, readonly string[]> = {
  raw_capture: ['capture_id'], product: ['product_key'], review: ['review_key'], run_review: ['run_id', 'review_key'],
};

function migrated(t: TestContext) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

function seedParents(db: Database.Database) {
  db.prepare(`INSERT INTO raw_capture(capture_id,run_id,source_code,provider,operation,requested_at,completed_at,outcome)
    VALUES ('capture-a','run-a','S05','synthetic','shopee.public_reviews.listing',?,?,'OK')`)
    .run('2026-11-03T00:00:00Z', '2026-11-03T00:00:09Z');
  db.prepare(`INSERT INTO product(product_key,platform,item_id,product_name,first_capture_id)
    VALUES ('shopee:101','shopee','101','Synthetic product','capture-a')`).run();
}

const validReview = {
  review_key: 'S05:review-a', source_code: 'S05', platform: 'shopee', kind: 'product_review',
  external_id: 'review-a', product_key: 'shopee:101', reviewer_name_state: 'not_provided', rating_star: 5,
  collected_at: '2026-11-03T00:00:09Z', capture_id: 'capture-a', source_position: 'page=1,row=0',
};
function insertReview(db: Database.Database, override: Record<string, string | number | null> = {}) {
  return db.prepare(`INSERT INTO review(${Object.keys(validReview).join(',')})
    VALUES (${Object.keys(validReview).map(key => `@${key}`).join(',')})`).run({ ...validReview, ...override });
}

test('RAWDB rule 1: applyMigrations exposes the four STRICT db-v1 table contracts and writer_count', t => {
  const db = migrated(t);
  for (const table of Object.keys(columns) as Table[]) {
    const expected = columns[table];
    const info = db.pragma(`table_info(${table})`) as { name: string; type: string; notnull: number; pk: number; dflt_value: string | null }[];
    assert.deepEqual(info.map(c => `${c.name}:${c.type}`), expected.trim().split(/\s+/), table);
    assert.deepEqual(info.filter(c => c.notnull).map(c => c.name), required[table], `${table} required columns`);
    assert.deepEqual(info.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name), primaryKeys[table], `${table} primary key`);
    assert.deepEqual(info.filter(c => c.dflt_value !== null).map(c => [c.name, c.dflt_value]),
      table === 'review' ? [['state', "'VALID'"]] : [], `${table} defaults`);
    const metadata = db.prepare('SELECT type,strict FROM pragma_table_list WHERE name=?').get(table);
    assert.deepEqual(metadata, { type: 'table', strict: 1 }, table);
  }
  assert.deepEqual(db.prepare("SELECT type FROM sqlite_schema WHERE name='writer_count'").get(), { type: 'view' });
  assert.deepEqual((db.pragma('table_info(writer_count)') as { name: string }[]).map(c => c.name),
    ['platform', 'product_key', 'writers', 'counted_by_review']);
  for (const column of ['product_key', 'reviewer_key']) {
    const indexes = db.prepare("SELECT name FROM pragma_index_list('review')").all() as { name: string }[];
    assert.ok(indexes.some(index => {
      const members = db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(index.name) as { name: string }[];
      return members.length === 1 && members[0]!.name === column;
    }), `review index on ${column}`);
  }
});

test('RAWDB rule 2: CHECK constraints reject invalid stars, outcomes, product linkage and name state', t => {
  const db = migrated(t);
  seedParents(db);
  // A valid control prevents a different broken constraint from making these negatives pass.
  insertReview(db);
  for (const override of [{ rating_star: 6 }, { product_key: null }, { reviewer_name_state: 'unknown' }]) {
    assert.throws(() => insertReview(db, { review_key: 'S05:invalid', external_id: 'invalid', ...override }),
      { code: 'SQLITE_CONSTRAINT_CHECK' });
  }
  assert.throws(() => db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('invalid','S05','synthetic','listing','2026-11-03T00:00:00Z','UNKNOWN')`).run(),
  { code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('RAWDB rule 3: source/external review identity is unique and all four tables reject UPDATE and DELETE', t => {
  const db = migrated(t);
  seedParents(db);
  insertReview(db);
  assert.throws(() => insertReview(db, { review_key: 'a-different-primary-key' }),
    { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  db.prepare(`INSERT INTO run_review(run_id,review_key,capture_id,source_position)
    VALUES ('run-a','S05:review-a','capture-a','page=1,row=0')`).run();
  const mutableColumn: Record<Table, string> = {
    raw_capture: 'keyword', product: 'product_name', review: 'text', run_review: 'source_position',
  };
  // Children first: DELETE must be rejected by immutability, not merely a foreign key.
  for (const table of ['run_review', 'review', 'product', 'raw_capture'] as const) {
    const before = db.prepare(`SELECT * FROM ${table}`).all();
    for (const statement of [`UPDATE ${table} SET ${mutableColumn[table]}='changed'`, `DELETE FROM ${table}`]) {
      assert.throws(() => db.exec(statement), {
        code: 'SQLITE_CONSTRAINT_TRIGGER', message: `immutable_raw_db_v1_${table}`,
      });
      assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), before);
    }
  }
});
