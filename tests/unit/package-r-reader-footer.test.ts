import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { deliverMarketReader, readerText } from '../../src/modules/analysis/research-automation/market-reader-delivery.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { builderControlNames, footerBuilderControl, footerPage, footerProducts, pageFooter, pageHead, pdfBlock, sectionIds, videoBlock } from '../helpers/package-r-reader-footer-fixture.js';

// G round 2: current source-list snapshots remove English product branding (L11(b));
// G: current HTML/trace exhibit pins included defective evidence copy; legacy/Insight pins stay frozen.
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function section(html: string, id: string): string {
  const found = new RegExp(`<section class="sheet" id="${id}">([\\s\\S]*?)</section>`, 'u').exec(html);
  assert.ok(found, `${id} survives delivery`);
  return found[1]!;
}
function inspect(html: string, check: (doc: Document) => void): void {
  const dom = new JSDOM(html);
  try { check(dom.window.document); } finally { dom.window.close(); }
}
function assertQuotes(html: string, id: string, blocks: readonly string[]): void {
  const expected = blocks.flatMap(block => [...block.matchAll(/<blockquote data-quote>[\s\S]*?<\/blockquote>/gu)].map(match => match[0]));
  assert.ok(expected.length > 0, 'the real excerpt builders emitted quotes');
  assert.deepEqual([...section(html, id).matchAll(/<blockquote data-quote>[\s\S]*?<\/blockquote>/gu)].map(match => match[0]), expected,
    `${id}: exact quote markup, text, entities and footer labels`);
  for (const quote of expected) assert.equal(readerText(quote, true), quote, 'readerText already preserves the entire source blockquote');
  inspect(html, doc => {
    const node = doc.getElementById(id)!;
    assert.equal(node.querySelectorAll('blockquote[data-quote] footer').length, expected.length);
    for (const quote of node.querySelectorAll('blockquote[data-quote]')) assert.equal(quote.closest('section')?.id, id);
  });
}

for (const product of footerProducts) for (const captureCopy of [false, true]) {
  test(`Package R: every section after PDF M05 and video M09 receives reader treatment (${product}, capture=${captureCopy})`, () => {
    const pdf = pdfBlock(product), video = videoBlock(product);
    const excerpts = { M05: [pdf], M09: [video] };
    const baseline = deliverMarketReader(footerPage(product), undefined, captureCopy);
    const output = deliverMarketReader(footerPage(product, { excerpts }), undefined, captureCopy);
    assertQuotes(output, 'M05', [pdf]);
    assertQuotes(output, 'M09', [video]);
    // Whole-section equality catches misplaced notes, lost content and treatment that stops partway through an excerpt section.
    for (const id of sectionIds) {
      let actual = section(output, id);
      for (const block of excerpts[id as keyof typeof excerpts] ?? []) actual = actual.replace(readerText(block, captureCopy), '');
      assert.equal(actual, section(baseline, id), `${id}: same reader treatment as the excerpt-free page`);
    }
    inspect(output, doc => {
      for (const id of sectionIds) {
        const node = doc.getElementById(id)!;
        const expectedState = id === 'M02' || id === 'M13' ? [] : [id === 'M06' ? 'Chỉ có số liệu nền cả nước'
          : id === 'M08' ? 'Có giá tham khảo, chưa xác minh' : id === 'M09' ? 'Có một phần số liệu'
            : /^M(?:0[3-9]|1[01])$/u.test(id) ? 'Có số liệu' : 'Chưa đủ dữ liệu'];
        assert.deepEqual([...node.querySelectorAll('.state')].map(chip => chip.textContent), expectedState, `${id}: state chip`);
        assert.equal(node.querySelector('details, [href="#bounded-method-evidence"]'), null, `${id}: traces and method links removed`);
        assert.equal(node.querySelector('.sec-note')?.textContent, '', `${id}: existing readerText removes the method sentence`);
        assert.equal(node.querySelectorAll(':scope > sup.cite').length, 2, `${id}: both trace-summary citations survive`);
        assert.equal(node.querySelector('.reader-probe')!.textContent,
          `${product}: sản phẩm đánh giá gói/biến thể lượt ghi nhận tìm kiếm; 12/01/2026; bằng không; ${captureCopy ? 'mẫu đã lưu' : 'mẫu xuất đã lưu'}.`, `${id}: prose conversions`);
        const dataSection = /^M(?:0[3-9]|1[01])$/u.test(id);
        assert.equal(node.querySelectorAll('.lim').length, dataSection ? 2 : 0, `${id}: notes for table and figure`);
        assert.equal(node.querySelectorAll('.interp').length, dataSection ? 2 : 0, `${id}: interpretations for table and figure`);
        if (dataSection) for (const exhibit of node.querySelectorAll('.table-wrap, figure')) {
          assert.equal(exhibit.nextElementSibling?.className, 'lim', `${id}: note follows its exhibit`);
          assert.equal(exhibit.nextElementSibling?.nextElementSibling?.className, 'interp', `${id}: interpretation follows its note`);
        }
      }
      const register = doc.querySelector('.citation-register')!;
      assert.equal(register.querySelector('details, [href="#bounded-method-evidence"]'), null, 'citation register is in the treated body');
      assert.equal(register.querySelector('p')!.textContent, 'sản phẩm đánh giá 12/01/2026');
      assert.equal(register.querySelector('blockquote')!.textContent, 'review 2026-01-12');
    });
    assert.ok(output.startsWith(pageHead), 'page header stays byte-identical');
    assert.ok(output.endsWith(pageFooter), 'only the page footer and closing document stay untouched');
    assert.doesNotMatch(output.slice(pageHead.length, -pageFooter.length), /hidden-|old-M/u);
  });
}

for (const [name, options] of [
  ['no page footer', { pageFooter: false }],
  ['empty citation register', { emptyRegister: true }],
] as const) test(`Package R: nested footers with ${name}`, () => {
  const product = footerProducts[1], excerpts = { M05: [pdfBlock(product)], M09: [videoBlock(product)] };
  const output = deliverMarketReader(footerPage(product, { ...options, excerpts }));
  const baseline = deliverMarketReader(footerPage(product, options));
  for (const id of sectionIds) {
    let actual = section(output, id);
    for (const block of excerpts[id as keyof typeof excerpts] ?? []) actual = actual.replace(readerText(block), '');
    assert.equal(actual, section(baseline, id), `${id}: complete treatment with ${name}`);
  }
  assertQuotes(output, 'M05', excerpts.M05);
  assertQuotes(output, 'M09', excerpts.M09);
  inspect(output, doc => {
    assert.equal(doc.querySelector('.page-footer') === null, 'pageFooter' in options && options.pageFooter === false);
    if ('emptyRegister' in options) assert.equal(doc.querySelectorAll('.citation-register li').length, 0);
    assert.equal(doc.querySelector('.citation-register details'), null);
  });
});

for (const pageFooterPresent of [false, true]) test(`Package R: several excerpts in the last section, page footer=${pageFooterPresent}`, () => {
  const product = footerProducts[2], blocks = [pdfBlock(product), videoBlock(product), pdfBlock(product, 3), videoBlock(product, 5)];
  const output = deliverMarketReader(footerPage(product, { pageFooter: pageFooterPresent, excerpts: { M14: blocks } }));
  const baseline = deliverMarketReader(footerPage(product, { pageFooter: pageFooterPresent }));
  let last = section(output, 'M14');
  for (const block of blocks) last = last.replace(readerText(block), '');
  assert.equal(last, section(baseline, 'M14'), 'last-section traces, wording and badge are treated after all four excerpt footers');
  for (const id of sectionIds.slice(0, -1)) assert.equal(section(output, id), section(baseline, id), id);
  assertQuotes(output, 'M14', blocks);
  inspect(output, doc => {
    assert.equal(doc.querySelector('.citation-register p')!.textContent, 'sản phẩm đánh giá 12/01/2026');
    assert.equal(doc.querySelector('.citation-register details'), null);
  });
});

test('Package R: several PDF and video excerpts in one data section keep each exhibit annotated once', () => {
  const product = footerProducts[0], blocks = [pdfBlock(product), videoBlock(product), pdfBlock(product, 3)];
  const output = deliverMarketReader(footerPage(product, { excerpts: { M07: blocks } }));
  const baseline = deliverMarketReader(footerPage(product));
  for (const id of sectionIds) {
    let actual = section(output, id);
    if (id === 'M07') for (const block of blocks) actual = actual.replace(readerText(block), '');
    assert.equal(actual, section(baseline, id), id);
  }
  assertQuotes(output, 'M07', blocks);
});

// These inputs were also checked on main: no exhibit interpretations or partial-gap chip is added twice.
for (const nested of [false, true]) test(`Package R: previously idempotent text-only delivery, nested footers=${nested}`, () => {
  const product = footerProducts[0];
  const input = footerPage(product, { exhibits: false, ...(nested ? { excerpts: { M05: [pdfBlock(product)], M09: [videoBlock(product)] } } : {}) });
  const once = deliverMarketReader(input);
  assert.equal(deliverMarketReader(once), once);
});

test('Package R: missing sections container remains a byte-identical no-op', () => {
  const input = pageHead + pdfBlock(footerProducts[2]) + pageFooter;
  assert.equal(deliverMarketReader(input), input);
});

// Independently generated with main 71128df9, Node 24.15.0. No nested footer in these controls.
// Filled from the main checkout, never from the implementation under test.
const handBuiltMainHashes: Record<string, string> = {
  "Nimbus seed tray|false|false": "18be7a8e30a9cbc688a0d0c809eb72c7f17a05f3d320376d5979b7011edff975",
  "Nimbus seed tray|false|true": "57741d9544697dea57b0bde3f1446a1593c2f1d7e708a76377406fa1420995cc",
  "Nimbus seed tray|true|false": "1741202a4aa1aa94ae397f8383f8a7df087fcf4d8a3e039907a15995ab32ce32",
  "Nimbus seed tray|true|true": "6249bcdfb1f3238311e2ec49b3bd3d70ae5dbbae00aeade32546ece71f2fc842",
  "Pebble felt lantern|false|false": "5f3c35fff4d90efa1a4a9baf8551f1bf3a651dfc273795080ee7187af4a328a4",
  "Pebble felt lantern|false|true": "57a3a75b6f6074271ae4534d7f823c613735678e5d97a0a131637b61864e94e1",
  "Pebble felt lantern|true|false": "21863655de7551daf21dc83ca65a5e88f0821b0f76d520bec9fa94c4b6f8c8da",
  "Pebble felt lantern|true|true": "6c2e486260514afb42e5581c0fdb02a8afea0827448630f47700b5a8c3bfdb70",
  "Orbit paper wallet|false|false": "b98151a055d24d7d6583525a3f1859223bf544d35566144b7f383f499722d051",
  "Orbit paper wallet|false|true": "73295f4af5815cb3f90c5aad0fc95c8ede9b4a8649afd9174eb6180ef161f09a",
  "Orbit paper wallet|true|false": "2cfe58bbca2b6af72211f68b5d2093c7cfc63bb24ac6a2fe474e6ddb364b8565",
  "Orbit paper wallet|true|true": "84aaec6cf5638827cbaccf3c05eeb058104c3acf79be1197cba2be401f0c8531"
};
const builderMainHashes: Record<string, { html: string; trace: string | null; semantic: string }> = {
  "capture-market": {
    "html": "3abd254fededcc10b68a8cf8fbdfe6eea3a5b02685fc78695ce45d1f706dd511",
    "trace": "36a2e1a697fdf8f1b36888938a03f03dcad9e28af0141d332eacdd0caccf7419",
    "semantic": "7c67a4170987b988b8e9f18ff7294fef370a185d3613d8e2a5b6767475e4cf8d"
  },
  "no-capture-market": {
    "html": "0375a88d3b5b73b58a92f77f190e6ebb9ad8a9b8af501b03a88b334c37fe0b5c",
    "trace": "c6f29e17fbe672e96c17abd49b965b3623c0721e153af411b087adc82df0701e",
    "semantic": "de585c1f267a1d36644443579f4b684e9767a6fa1b7502f3b87c465e3224c3fc"
  },
  "capture-insight": {
    "html": "7163940cc6c424f6c1a2fc73c7af9458e1a50d3957adaa8d43802a8caf6ba08d",
    "trace": null,
    "semantic": "21c5fa1d4be2b577cc196d0508e84342b0953f1a16ed6505eccbb784b8f05294"
  },
  "no-capture-insight": {
    "html": "7163940cc6c424f6c1a2fc73c7af9458e1a50d3957adaa8d43802a8caf6ba08d",
    "trace": null,
    "semantic": "21c5fa1d4be2b577cc196d0508e84342b0953f1a16ed6505eccbb784b8f05294"
  },
  "legacy-market": {
    "html": "92ada31fa0a8a276d05aedc38fe418c3b5204f0750ef89020453a998526c6da9",
    "trace": null,
    "semantic": "89b388819561c90b6082847afb079b85aa911457862ca7d542d5335860c3f8a5"
  },
  "legacy-insight": {
    "html": "7163940cc6c424f6c1a2fc73c7af9458e1a50d3957adaa8d43802a8caf6ba08d",
    "trace": null,
    "semantic": "21c5fa1d4be2b577cc196d0508e84342b0953f1a16ed6505eccbb784b8f05294"
  }
};


for (const product of footerProducts) for (const footer of [false, true]) for (const emptyRegister of [false, true]) {
  test(`Package R main byte control: hand-built ${product}, footer=${footer}, empty-register=${emptyRegister}`, () => {
    const input = footerPage(product, { pageFooter: footer, emptyRegister });
    const key = `${product}|${footer}|${emptyRegister}`;
    assert.equal((input.match(/<footer\b/gu) ?? []).length, footer ? 1 : 0);
    assert.equal(hash(deliverMarketReader(input)), handBuiltMainHashes[key], 'complete reader bytes equal main');
  });
}
for (const name of builderControlNames) test(`Package R main byte control: real builder ${name}`, async () => {
  const { input, kind } = await footerBuilderControl(name);
  const before = canonicalJson(input);
  const report = buildResearchAutomationReport(input, kind);
  const expected = builderMainHashes[name];
  assert.ok(expected, 'independent main control exists');
  const html = report.html.toString();
  assert.equal((html.match(/<footer\b/gu) ?? []).length, 1, 'builder control has only the page footer');
  assert.equal(hash(report.html), expected.html, 'entire reader HTML equals main');
  assert.equal(report.traceHtml ? hash(report.traceHtml) : null, expected.trace, 'reviewed current copy or frozen historical technical HTML');
  assert.equal(hash(canonicalJson(report.semantic)), expected.semantic, 'reviewed current copy or frozen historical semantic bytes');
  assert.equal(canonicalJson(input), before, 'building the reader does not mutate the fixture');
});
