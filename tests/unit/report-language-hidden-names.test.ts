import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HIDDEN_NAMES, findHiddenNames, hasHiddenName, maskHiddenNames,
  type HiddenName, type TextAudience,
} from '../../src/modules/analysis/report-language/index.js';
import { FORBIDDEN_PROVIDER_NAMES, CAPTURED_PROVIDER_NAMES } from '../../src/modules/analysis/reader-report/lint.js';
import { CITATION_FORBIDDEN_NAMES } from '../../src/modules/analysis/citation-registry.js';
import { PUBLIC_REVIEW_FORBIDDEN_NAMES } from '../../src/modules/analysis/research-automation/public-review-report.js';
import { MARKET_READER_TERMS } from '../../src/modules/analysis/research-automation/market-reader-glossary.js';
import { GLOSSARY } from '../../src/modules/analysis/research-automation/market-14-rules.js';

const AUDIENCES: readonly TextAudience[] = ['READER', 'CITATION', 'COPIED', 'TRACE'];
const NEUTRAL_TEXT = ['Shopee', 'TikTok Shop', 'dữ liệu bán hàng ước tính', 'review công khai trên Shopee'];

test('row 1: the frozen table preserves every spelling, group and order', () => {
  const groups: readonly (readonly [HiddenName['group'], readonly string[]])[] = [
    ['DATA', ['Metric', 'Kalodata', 'TradeInt', 'Dami']],
    ['TOOL', ['SerpApi', 'Apify', 'PageIndex', 'Agent-Reach', 'OpenCLI', 'zen-studio']],
    ['AI_SEARCH', ['Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM', 'Gemini', 'Google', 'Nemotron', 'NVIDIA']],
    ['PUBLIC_REVIEW', ['CloakBrowser', 'Cloak Browser', 'cloak-browser', 'cloak_browser', 'ShopeePublicReviewCollector', 'shopee-public-review']],
  ];
  assert.deepEqual(HIDDEN_NAMES, groups.flatMap(([group, names]) => names.map(name => ({ name, group }))));
});

for (const audience of ['READER', 'CITATION', 'COPIED'] as const) {
  test(`row 1: every table name is found in a Vietnamese sentence for ${audience}`, () => {
    for (const { name, group } of HIDDEN_NAMES) {
      const text = `Theo ${name}, đây là dữ liệu trong mẫu.`;
      assert.ok(findHiddenNames(text, audience).some(hit => hit.name === name && hit.group === group && hit.match === name), `${audience}: ${name}`);
      assert.equal(hasHiddenName(text, audience), true, `${audience}: ${name}`);
    }
  });
}

test('row 1: TRACE permits every name and model id', () => {
  for (const text of [...HIDDEN_NAMES.map(({ name }) => `Dấu vết: ${name}.`), 'gpt-6.1-sol', 'claude-opus-5-5']) {
    assert.deepEqual(findHiddenNames(text, 'TRACE'), [], text);
    assert.equal(hasHiddenName(text, 'TRACE'), false, text);
  }
});

test('row 1 control: platform names and neutral source descriptions pass every audience', () => {
  for (const audience of AUDIENCES) {
    for (const text of NEUTRAL_TEXT) {
      assert.deepEqual(findHiddenNames(text, audience), [], `${audience}: ${text}`);
      assert.equal(hasHiddenName(text, audience), false, `${audience}: ${text}`);
    }
  }
});

const GEMINI_CASES = [
  // Today's web-page-type.ts webTextHidden misses Gemini in a copied web title.
  { label: 'web title', text: 'Gemini: ghi nhận mới về hành vi mua hàng', audience: 'COPIED' },
  // Today's pdf-excerpt.ts PROVIDER_WORDS misses Gemini in a PDF excerpt sentence.
  { label: 'PDF excerpt', text: 'Báo cáo sử dụng Gemini để tổng hợp nội dung.', audience: 'COPIED' },
  // Today's reader-plain-text.ts READER_PROVIDER misses Gemini in an Insight quote.
  { label: 'Insight quote', text: '“Tôi đã tham khảo Gemini trước khi mua.”', audience: 'READER' },
] as const;

for (const { label, text, audience } of GEMINI_CASES) {
  test(`row 2: Gemini is found in a ${label}`, () => {
    assert.deepEqual(findHiddenNames(text, audience), [{ name: 'Gemini', group: 'AI_SEARCH', match: 'Gemini' }]);
  });
}

const METRIC_CASES = [
  { audience: 'READER', found: ['Metric', 'METRIC'], allowed: ['metric', 'metric-scope-v1'] },
  { audience: 'CITATION', found: ['metric', 'metric-scope-v1'], allowed: ['thước đo trong mẫu'] },
  { audience: 'COPIED', found: ['m e t r i c'], allowed: ['thước đo trong mẫu'] },
] as const;

for (const { audience, found, allowed } of METRIC_CASES) {
  test(`row 3: Metric follows the owner Q2 policy for ${audience}`, () => {
    for (const text of found) {
      assert.ok(findHiddenNames(text, audience).some(hit => hit.name === 'Metric' && hit.group === 'DATA'), `${audience}: ${text}`);
    }
    for (const text of allowed) assert.deepEqual(findHiddenNames(text, audience), [], `${audience}: ${text}`);
  });
}

test('row 4: COPIED finds separated, invisible, encoded and full-width names', () => {
  const cases = [
    ['K a l o d a t a', 'Kalodata', 'K a l o d a t a'],
    ['Kalo-data', 'Kalodata', 'Kalo-data'],
    ['Kalo\u200bdata', 'Kalodata', 'Kalo\u200bdata'],
    ['googleplay', 'Google', 'google'],
    ['%4B%61lodata', 'Kalodata', 'Kalodata'],
    ['Ｋａｌｏｄａｔａ', 'Kalodata', 'Kalodata'],
  ] as const;
  for (const [text, name, match] of cases) {
    assert.deepEqual(findHiddenNames(text, 'COPIED'), [{ name, group: name === 'Google' ? 'AI_SEARCH' : 'DATA', match }], text);
  }
});

test('row 4 controls: READER permits googleplay, and Damien and Damian pass READER and COPIED', () => {
  assert.deepEqual(findHiddenNames('googleplay', 'READER'), []);
  for (const audience of ['READER', 'COPIED'] as const) {
    for (const text of ['Damien', 'Damian']) assert.deepEqual(findHiddenNames(text, audience), [], `${audience}: ${text}`);
  }
});

test('row 4: model ids have their own hit group and a bare gpt is allowed', () => {
  const cases = [
    ['gpt-6.1-sol', 'READER'], ['claude-opus-5-5', 'READER'], ['gpt - 5', 'COPIED'],
  ] as const;
  for (const [text, audience] of cases) {
    assert.deepEqual(findHiddenNames(text, audience), [{ name: 'MODEL_ID', group: 'MODEL_ID', match: text }], text);
  }
  assert.deepEqual(findHiddenNames('gpt', 'READER'), []);
});

test('row 5: public-review implementation names are hidden without a flag', () => {
  for (const audience of ['READER', 'CITATION'] as const) {
    for (const name of PUBLIC_REVIEW_FORBIDDEN_NAMES) {
      assert.ok(findHiddenNames(`Nguồn: ${name}.`, audience).some(hit => hit.name === name && hit.group === 'PUBLIC_REVIEW'), `${audience}: ${name}`);
    }
    assert.deepEqual(findHiddenNames('review công khai trên Shopee', audience), []);
  }
});

test('row 6: CITATION decodes decimal and hexadecimal numeric entities', () => {
  for (const text of ['Kalo&#100;ata', 'Kalo&#x64;ata']) {
    assert.deepEqual(findHiddenNames(text, 'CITATION'), [{ name: 'Kalodata', group: 'DATA', match: 'Kalodata' }], text);
  }
  assert.deepEqual(findHiddenNames('Nguồn bán hàng', 'CITATION'), []);
});

test('row 6: CITATION AI_SEARCH names use word boundaries and ignore digest-like text and majevi', () => {
  assert.deepEqual(findHiddenNames('Jev', 'CITATION'), [{ name: 'Jev', group: 'AI_SEARCH', match: 'Jev' }]);
  const hex = 'deadbeef'.repeat(8);
  for (const text of [hex, `${hex} majevi`, 'majevi']) assert.deepEqual(findHiddenNames(text, 'CITATION'), [], text);
  for (const { name } of HIDDEN_NAMES.filter(entry => entry.group === 'AI_SEARCH')) {
    for (const text of [`ma${name.toLowerCase()}vi`, `á${name}ệ`, `_${name}_`]) {
      assert.deepEqual(findHiddenNames(text, 'CITATION'), [], text);
    }
  }
});

test('row 6: CITATION deliberately keeps DATA substring matching for Damian', () => {
  assert.deepEqual(findHiddenNames('Damian', 'CITATION'), [{ name: 'Dami', group: 'DATA', match: 'Dami' }]);
  assert.deepEqual(findHiddenNames('Damien', 'READER'), []);
});

test('row 7: masking replaces only the hidden span and preserves the surrounding bytes', () => {
  const prefix = 'Theo ', suffix = ', giá 120.000đ';
  const text = `${prefix}Kalodata${suffix}`;
  for (const audience of ['READER', 'CITATION'] as const) {
    const masked = maskHiddenNames(text, audience);
    assert.equal(masked, 'Theo […], giá 120.000đ', audience);
    assert.deepEqual(Buffer.from(masked.slice(0, prefix.length)), Buffer.from(prefix), audience);
    assert.deepEqual(Buffer.from(masked.slice(-suffix.length)), Buffer.from(suffix), audience);
  }
});

test('row 7 control: masking returns name-free text unchanged', () => {
  const text = 'Shopee — dữ liệu bán hàng ước tính, giá 120.000đ.\n';
  for (const audience of ['READER', 'CITATION'] as const) assert.equal(maskHiddenNames(text, audience), text, audience);
});

// Literal inventories are intentional: these non-exported matchers cannot be imported.
const LEGACY_NAME_LISTS: readonly (readonly [string, readonly string[]])[] = [
  ['FORBIDDEN_PROVIDER_NAMES', FORBIDDEN_PROVIDER_NAMES],
  ['CAPTURED_PROVIDER_NAMES', CAPTURED_PROVIDER_NAMES],
  ['CITATION_FORBIDDEN_NAMES', CITATION_FORBIDDEN_NAMES],
  ['PUBLIC_REVIEW_FORBIDDEN_NAMES', PUBLIC_REVIEW_FORBIDDEN_NAMES],
  // src/modules/analysis/research-automation/market-business-gate.ts:247 (literal additions).
  ['market gate', ['Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM', 'Gemini', 'Google']],
  // src/modules/analysis/research-automation/pdf-excerpt.ts:46 (literal additions).
  ['PDF excerpt', ['PageIndex', 'Google', 'Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM']],
  // src/modules/analysis/research-automation/web-page-type.ts:13 (literal additions).
  ['copied web text', ['Google', 'Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM']],
  // src/modules/analysis/research-automation/reader-plain-text.ts:35.
  ['plain reader text', ['Metric', 'Kalodata', 'TradeInt', 'Dami', 'Apify', 'SerpApi', 'Jev', 'TypeSafe']],
  // src/modules/analysis/research-automation/comtrade-lane.ts:111-113.
  ['trade lane', ['google', 'kalodata', 'tradeint', 'dami', 'apify', 'serpapi', 'pageindex', 'gemini', 'Metric', 'METRIC', 'metric', 'agent-reach', 'opencli', 'zen-studio', 'jev', 'typesafe', 'cliproxy', 'openai', 'anthropic', 'glm']],
  // src/modules/analysis/research-automation/official-statistics-lane.ts:98.
  ['official statistics lane', ['google', 'kalodata', 'tradeint', 'dami', 'apify', 'serpapi', 'pageindex', 'gemini', 'metric', 'opencli']],
  // src/modules/analysis/research-automation/test-review-sample.ts:50 (including Nemotron and NVIDIA).
  ['review sample', ['Gemini', 'Google', 'Nemotron', 'NVIDIA']],
];

function missingHiddenNames(names: readonly string[]): string[] {
  const table = new Map(HIDDEN_NAMES.map(entry => [entry.name.toLowerCase(), entry]));
  return names.filter(name => {
    const canonical = table.get(name.toLowerCase());
    // Historical lowercase inventories use the canonical spelling for Metric's READER exception.
    return canonical === undefined || !findHiddenNames(canonical.name, 'READER').some(hit => hit.name.toLowerCase() === name.toLowerCase());
  });
}

test('row 8: READER and the table cover every legacy name inventory', () => {
  for (const [label, names] of LEGACY_NAME_LISTS) assert.deepEqual(missingHiddenNames(names), [], label);
});

test('row 8 control: the superset helper reports an absent name', () => {
  assert.deepEqual(missingHiddenNames(['Kalodata', 'Lazada']), ['Lazada']);
});

function glossaryParityIssues(terms: readonly (readonly [string, string])[]): string[] {
  const issues: string[] = [];
  for (const [term, meaning] of terms) {
    const entries = GLOSSARY.filter(([pattern]) => pattern.test(term));
    if (!entries.some(([, explanation]) => explanation.test(meaning))) issues.push(`${term}: missing term or meaning`);
  }
  for (const [pattern] of GLOSSARY) {
    if (!terms.some(([term]) => pattern.test(term))) issues.push(`${pattern.source}: missing reader term`);
  }
  return issues;
}

test('row 9: every reader glossary term and meaning agrees with the checker in both directions', () => {
  assert.deepEqual(glossaryParityIssues(MARKET_READER_TERMS), []);
});

test('row 9 control: the same parity helper rejects one changed meaning', () => {
  const changed: readonly (readonly [string, string])[] = MARKET_READER_TERMS.map(([term, meaning], index) => [term, index === 0 ? 'nghĩa đã bị thay đổi' : meaning]);
  assert.deepEqual(glossaryParityIssues(changed), ['listing: missing term or meaning']);
});
