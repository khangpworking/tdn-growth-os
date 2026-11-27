// App 1.3.5 (tdn-shopee-app #5): each closed list of display text the desktop page holds for a server value
// names exactly the values the server schema allows. A new server value without app text fails here.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL('../../' + path, import.meta.url), 'utf8');
const html = await read('tools/shopee-desktop/index.html');
const outputs = JSON.parse(await read('skills/tdn-shopee-flow/chuan/module-outputs-v1.schema.json'));
const step4 = JSON.parse(await read('contracts/foundation/shopee-module-review-process.schema.json'));

/** The keys of `var NAME = { ... };` in the page (a plain object literal of text). */
function pageMap(name: string): string[] {
  const start = html.indexOf('var ' + name + ' = {');
  assert.ok(start >= 0, name + ' is in the page');
  const open = html.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < html.length; end += 1) {
    if (html[end] === '{') depth += 1;
    if (html[end] === '}' && --depth === 0) break;
  }
  return Object.keys(new Function('return ' + html.slice(open, end + 1))()).sort();
}
const values = (list: unknown[]) => list.filter((value) => value !== null).map(String).sort();

// | server list (schema)                               | page text map           |
// |----------------------------------------------------|-------------------------|
// | module-outputs-v1 linkIssue.reason                 | LINK_ISSUE_REASON       |
// | module-outputs-v1 m2.shortageReason (not null)     | M2_SHORTAGE_TEXT        |
// | review-process errorCode                           | STEP4_ERROR_TEXT        |
// | review-process check.id                            | STEP4_CHECK_LABELS      |
// | review-process source.state                        | STEP4_SOURCE_STATE_TEXT |
test('app 1.3.5: the page has text for exactly the server values of each display list', () => {
  for (const [label, server, page] of [
    ['linkIssue.reason', outputs.$defs.linkIssue.properties.reason.enum, 'LINK_ISSUE_REASON'],
    ['m2.shortageReason', outputs.properties.m2.properties.shortageReason.enum, 'M2_SHORTAGE_TEXT'],
    ['step 4 errorCode', step4.$defs.errorCode.enum, 'STEP4_ERROR_TEXT'],
    ['step 4 check id', step4.$defs.check.properties.id.enum, 'STEP4_CHECK_LABELS'],
    ['step 4 source state', step4.$defs.source.properties.state.enum, 'STEP4_SOURCE_STATE_TEXT'],
  ] as const) {
    assert.deepEqual(pageMap(page), values(server), label + ' <-> ' + page);
  }
});
