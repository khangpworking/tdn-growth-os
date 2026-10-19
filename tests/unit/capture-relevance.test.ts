import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { classifyCaptureRelevance, captureTitleSha256, captureRelevanceKeyword, readCaptureRelevanceRecord,
  type CaptureRelevanceAi, type CaptureRelevanceClassifier, type CaptureRelevanceLabel } from '../../src/modules/analysis/research-automation/capture-relevance.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { assessCaptureRows, CAPTURE_ROW_PROFILE, CAPTURE_ROW_PROFILE_V2, assessCaptureRowsTitleOnly } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { pickShopeeLinks } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { relevanceKeyword, relevanceRows, relevancePickRows } from '../helpers/capture-relevance-fixture.js';

const configuration = captureRelevanceConfiguration('synthetic-lumo-model');
const ai = (classify: CaptureRelevanceClassifier['classify']): CaptureRelevanceAi => ({ configuration, classifier: { classify } });
const allMain: CaptureRelevanceClassifier['classify'] = async ({ items }) => items.map(({ id }) => ({ id, label: 'MAIN' }));
const titles = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Lumo pod invented ${i}`, categoryText: 'Invented lumoware' }));
const notes = (batches: number, retriedBatches = 0, failedBatches = 0, cappedTitles = 0) => ({ batches, retriedBatches, failedBatches, cappedTitles });

test('classifier deduplicates exact titles across platforms and normalized keywords, skips blanks, and batches forty titles', async () => {
  const calls: Parameters<CaptureRelevanceClassifier['classify']>[0][] = [];
  const rows = [...titles(81), { title: '' }, { title: '   ' }, { title: 'Lumo pod invented 0', categoryText: 'Last synthetic category' }];
  const record = await classifyCaptureRelevance(rows, [' LUMO--POD ', 'lumo pod', 'mây sao'.normalize('NFD'), 'MÂY SAO', ' '], ai(async input => { calls.push(input); return allMain(input); }));
  assert.deepEqual(calls.map(call => [call.keyword, call.items.length]), [['lumo pod',40],['lumo pod',40],['lumo pod',1],['mây sao',40],['mây sao',40],['mây sao',1]]);
  assert.deepEqual(record.methodNotes, notes(6));
  assert.equal(record.decisions.length, 162);
  assert.equal(calls[0]!.items[0]!.category, 'Last synthetic category');
  assert.equal(record.contractVersion, 'capture-relevance-record-v1');
  assert.equal(record.promptVersion, 'capture-relevance-prompt-v1');
  assert.equal(record.modelIdentity, 'cliproxy:synthetic-lumo-model');
  assert.deepEqual(record.configuration, configuration);
  assert.deepEqual(Object.keys(record).sort(), ['configuration','contractVersion','decisions','methodNotes','modelIdentity','promptVersion']);
  assert.deepEqual(record.decisions[0], { keyword: 'lumo pod', titleSha256: createHash('sha256').update(rows[0]!.title, 'utf8').digest('hex'), label: 'MAIN' });
  assert.notEqual(captureTitleSha256('Mây'), captureTitleSha256('MÂY'));
  assert.notEqual(captureTitleSha256('Mây'), captureTitleSha256('Mây'.normalize('NFD')));
  assert.equal(captureRelevanceKeyword('MÂY--SAO'.normalize('NFD')), 'mây sao');
  let blankCalls = 0;
  const blank = await classifyCaptureRelevance([{title:''},{title:' '}], [relevanceKeyword], ai(async input => { blankCalls++; return allMain(input); }));
  assert.equal(blankCalls, 0); assert.deepEqual(blank.decisions, []); assert.deepEqual(blank.methodNotes, notes(0));
});

const invalidReplies: Record<string, (items: readonly { id: string }[]) => unknown> = {
  'missing id': items => items.slice(1).map(({id}) => ({id,label:'MAIN'})),
  'duplicate id': items => items.map(() => ({id:items[0]!.id,label:'MAIN'})),
  'foreign id': items => items.map(({id},i) => ({id:i ? id : 'foreign-synthetic-id',label:'MAIN'})),
  'extra field': items => items.map(({id}) => ({id,label:'MAIN',explanation:'invented'})),
  'invalid label': items => items.map(({id}) => ({id,label:'MAYBE'})),
};
for (const [name, invalid] of Object.entries(invalidReplies)) for (const recovers of [true,false]) test(`strict ${name}: retry once then ${recovers ? 'recover' : 'null the whole batch'}`, async () => {
  let calls = 0;
  const seen: string[][] = [];
  const record = await classifyCaptureRelevance(titles(2), [relevanceKeyword], ai(async input => {
    seen.push(input.items.map(row => row.id)); calls++;
    return recovers && calls === 2 ? allMain(input) : invalid(input.items) as Awaited<ReturnType<CaptureRelevanceClassifier['classify']>>;
  }));
  assert.equal(calls, 2, 'exactly one retry');
  assert.deepEqual(seen[0], seen[1], 'retry the same ids atomically');
  assert.deepEqual(record.methodNotes, notes(1,1,recovers ? 0 : 1));
  assert.deepEqual(record.decisions.map(row => row.label), [recovers ? 'MAIN' : null, recovers ? 'MAIN' : null]);
});

for (const kind of ['error','timeout','abort'] as const) test(`${kind} follows retry-then-null and retains no partial labels`, async () => {
  let calls = 0;
  const record = await classifyCaptureRelevance(titles(2), [relevanceKeyword], ai(async () => {
    calls++; throw kind === 'error' ? new Error('invented failure') : new DOMException('invented failure', kind === 'timeout' ? 'TimeoutError' : 'AbortError');
  }));
  assert.equal(calls, 2); assert.deepEqual(record.methodNotes, notes(1,1,1));
  assert.deepEqual(record.decisions.map(row => row.label), [null,null]);
});

test('caller abort signal reaches the classifier and the aborted retry cannot dispatch again', async () => {
  const controller = new AbortController(); let calls = 0;
  const record = await classifyCaptureRelevance(titles(2), [relevanceKeyword], ai(async ({signal}) => {
    calls++; assert.equal(signal, controller.signal); controller.abort(); signal!.throwIfAborted(); return [];
  }), controller.signal);
  assert.equal(calls, 1); assert.deepEqual(record.methodNotes, notes(1,1,1));
  assert.deepEqual(record.decisions.map(row => row.label), [null,null]);
});

test('forty logical batches cap the whole execution across keywords, including retried and failed batches', async () => {
  let calls = 0;
  const record = await classifyCaptureRelevance(titles(81), Array.from({length:14},(_,i) => `lumo pod ${i}`), ai(async input => {
    calls++; if (input.keyword === 'lumo pod 0') throw new Error('invented failure');
    return allMain(input);
  }));
  assert.equal(calls, 43); // forty logical batches plus retries of the first three
  assert.deepEqual(record.methodNotes, notes(40,3,3,41));
  assert.equal(record.decisions.length, 1134);
  assert.deepEqual(record.decisions.slice(-41).map(row => row.label), Array(41).fill(null));
  assert.deepEqual(record.decisions.slice(0,81).map(row => row.label), Array(81).fill(null));
  assert.ok(record.decisions.slice(81,-41).every(row => row.label === 'MAIN'));
});

async function labelled(rows: readonly {title:string}[], keywords: readonly string[], labels: (title:string,keyword:string) => CaptureRelevanceLabel | null) {
  const record = await classifyCaptureRelevance(rows, keywords, ai(allMain));
  record.decisions = record.decisions.map(row => ({...row, label: labels(rows.find(item => captureTitleSha256(item.title) === row.titleSha256)!.title,row.keyword)}));
  return readCaptureRelevanceRecord(record, rows, keywords);
}

test('decision rule: floor OR NOT_MAIN; MAIN, UNSURE and null never undo the floor', async () => {
  const rows = [
    {title:'Sleeve dùng cho lumo pod',platform:'shopee',revenue:100,units:1},
    {title:'Lumo pod amber',platform:'shopee',revenue:100,units:1},
  ];
  for (const label of ['MAIN','NOT_MAIN','UNSURE',null] as const) {
    const record = await labelled(rows,[relevanceKeyword],() => label);
    assert.deepEqual([...assessCaptureRows(rows,[relevanceKeyword],'BATCH',record).exclusions],
      label === 'NOT_MAIN' ? [[0,'NOT_MAIN_PRODUCT'],[1,'NOT_MAIN_PRODUCT']] : [[0,'NOT_MAIN_PRODUCT']], String(label));
  }
});

test('several keywords use conservative union separately for the floor and AI branches', async () => {
  const rows = [{title:'Sleeve dùng cho lumo pod',platform:'shopee',revenue:100,units:1}];
  const keywords = [relevanceKeyword, 'mây sao'];
  for (const labels of [['MAIN','MAIN'],['NOT_MAIN','MAIN'],['MAIN','NOT_MAIN'],['NOT_MAIN','UNSURE'],['NOT_MAIN',null],['NOT_MAIN','NOT_MAIN']] as const) {
    const record = await labelled(rows,keywords,(_title,keyword) => labels[keyword === relevanceKeyword ? 0 : 1]);
    assert.deepEqual([...assessCaptureRows(rows,keywords,'BATCH',record).exclusions], labels.every(label => label === 'NOT_MAIN') ? [[0,'NOT_MAIN_PRODUCT']] : [], JSON.stringify(labels));
  }
  const both = [{...rows[0]!, title:'Sleeve dùng cho lumo pod; pouch dùng cho mây sao'}];
  const main = await labelled(both,keywords,() => 'MAIN');
  assert.deepEqual([...assessCaptureRows(both,keywords,'BATCH',main).exclusions], [[0,'NOT_MAIN_PRODUCT']]);
});

test('relevance precedes missing units and changes the outlier candidate set, separately per platform', async () => {
  const rows = [100,100,2001,50000,60000,70000].map((revenue,i) => ({title:`Lumo pod candidate ${i}`,platform:'shopee',revenue,units:1}));
  rows.push({title:'Lumo pod no units',platform:'shopee',revenue:100,units:0});
  rows.push({title:'Lumo pod other platform',platform:'tiktok',revenue:9000000,units:1});
  const record = await labelled(rows,[relevanceKeyword],title => /candidate [345]|no units/u.test(title) ? 'NOT_MAIN' : 'UNSURE');
  const filtered = assessCaptureRows(rows,[relevanceKeyword],'BATCH',record);
  assert.deepEqual([...filtered.exclusions].sort((a,b) => a[0]-b[0]), [[2,'UNIT_REVENUE_OUTLIER'],[3,'NOT_MAIN_PRODUCT'],[4,'NOT_MAIN_PRODUCT'],[5,'NOT_MAIN_PRODUCT'],[6,'NOT_MAIN_PRODUCT']]);
  assert.equal(assessCaptureRows(rows,[relevanceKeyword]).exclusions.get(2), undefined, 'without relevance removals the median is higher');
  assert.equal(filtered.exclusions.has(7), false, 'TikTok has its own median');
});

test('title-only picker applies retained decisions and keeps sorting, guards, diversity and the five-link cap', async () => {
  const raw = relevancePickRows().slice(0,6);
  const record = await labelled(relevanceRows,[relevanceKeyword], title => title.endsWith('rival') ? 'NOT_MAIN' : 'UNSURE');
  const options = {profile:CAPTURE_ROW_PROFILE,relevance:record};
  const picked = pickShopeeLinks(raw,[relevanceKeyword],options);
  assert.deepEqual(picked.links.map(row => row.productBaseId), [raw[0]!.product_base_id,raw[2]!.product_base_id]);
  assert.ok(picked.excludedRows.some(row => row.productBaseId === raw[3]!.product_base_id && row.reason === 'NOT_MAIN_PRODUCT'));
  assert.deepEqual(assessCaptureRowsTitleOnly(relevanceRows,[relevanceKeyword],CAPTURE_ROW_PROFILE,record).exclusions,
    assessCaptureRows(relevanceRows,[relevanceKeyword],'TITLE_ONLY',record).exclusions);
  assert.equal(pickShopeeLinks(raw,[relevanceKeyword]).pickRuleVersion,'autorun-pick-v2');
  assert.deepEqual(pickShopeeLinks(raw,[relevanceKeyword]),pickShopeeLinks(raw,[relevanceKeyword],{profile:CAPTURE_ROW_PROFILE_V2}));
  const extra = Array.from({length:9},(_,i) => ({product_base_id:`1__${501+i}__${601+i}`,product_name:`Lumo pod extra ${i}`,revenue_custom:100,order_custom:1,brand:`Brand ${i}`,shop_base_id:`Shop ${i}`}));
  extra[1]!.brand = extra[0]!.brand;
  extra[2]!.shop_base_id = extra[0]!.shop_base_id;
  const invalid = [
    {...extra[0]!,product_base_id:'bad',product_name:'Lumo pod invalid id'},
    {...extra[0]!,product_base_id:'1__901__901',is_deleted:true},
    {...extra[0]!,product_base_id:'1__902__902',product_name:'Lumo podling lexical'},
    {...extra[0]!,product_base_id:'1__903__903',product_name:'Unrelated invented item'},
  ];
  for (const profile of [CAPTURE_ROW_PROFILE_V2,CAPTURE_ROW_PROFILE]) {
    const result = pickShopeeLinks([...extra,...invalid],[relevanceKeyword],{profile});
    assert.deepEqual(result.links.map(row => row.productBaseId),[0,3,4,5,6].map(i => extra[i]!.product_base_id));
    assert.equal(result.links.length,5); assert.equal(result.counts.deleted,1);
    assert.equal(new Set(result.links.map(row => row.shopId)).size,5);
  }
});


test('metadata floor stays per platform and cannot be rescued by MAIN, UNSURE or null', async () => {
  const anchors = Array.from({length:40},(_,i) => ({title:`Lumo pod anchor ${i}`,platform:'shopee',revenue:100,units:1,categoryText:'Invented lumoware',price:100}));
  const rows = [...anchors,
    {title:'Odd lumo pod attachment',platform:'shopee',revenue:100,units:1,categoryText:'Invented cloudware',price:10},
    {title:'Odd lumo pod attachment',platform:'tiktok',revenue:100,units:1,categoryText:'Invented cloudware',price:10},
    {title:'Lumo pod tiny',platform:'shopee',revenue:100,units:1,categoryText:'Invented lumoware',price:1},
  ];
  for (const label of ['MAIN','UNSURE',null] as const) {
    const record = await labelled(rows,[relevanceKeyword],() => label);
    const result = assessCaptureRows(rows,[relevanceKeyword],'BATCH',record);
    assert.deepEqual([...result.exclusions],[[40,'NOT_MAIN_PRODUCT']]);
    assert.equal(result.decisions[40]!.reason,'TITLE_CATEGORY_MISMATCH');
    assert.equal(result.exclusions.has(41),false,'TikTok has no category reference');
    assert.equal(result.exclusions.has(42),false,'low price alone is not a floor drop');
    assert.deepEqual([...assessCaptureRowsTitleOnly(rows,[relevanceKeyword],CAPTURE_ROW_PROFILE,record).exclusions],[],'title-only assessment has no metadata reference');
  }
});
