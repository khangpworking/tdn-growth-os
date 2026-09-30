import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { LocatedInsightMethods, Provenance } from '../../contracts/analysis/located-insight-methods.generated.js';
import type { VerifiedSourcePackageFile } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { locatedInsightFixture, locatedSpan } from './located-insight-fixture.js';

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`);

/** Synthetic comments and declared coding, not a provider or owner-approved research result. */
export function locatedInsightPackageFixture() {
  const texts = [
    'Tôi là người mua. Tôi tìm viên nhỏ ở nhà rồi mua A vì dễ nuốt. Tôi muốn dùng mỗi ngày nhưng viên quá lớn nên chưa dùng đều. Tôi thích hộp, không thích vị chua. <script>synthetic</script>',
    'Nghe nói A dễ nuốt, tôi chưa thử.',
    'Tôi chưa dùng sản phẩm.',
  ];
  const source = json({ records: texts.map(text => ({ text })) });
  const descriptor = locatedInsightFixture();
  descriptor.question = 'Trong các bình luận giả lập này, điều gì được nói về việc sử dụng?';
  descriptor.sources = [{ logicalPath: 'located/source.json', sha256: sha(source) }];
  descriptor.records = texts.map((text, index) => ({
    sourceSha256: sha(source), locator: `/records/${index}/text`, text,
    sourceAttribution: 'Bình luận giả lập; không phải bằng chứng người dùng thật', timeText: null,
    disposition: 'INCLUDED', dispositionReason: null,
  }));
  const declared: Provenance = { basis: 'DECLARED', coderRole: 'synthetic fixture author', adjudication: null, disagreement: null };
  const span = (quote: string) => locatedSpan(texts[0]!, quote);
  const stated = (quote: string) => ({ state: 'SOURCE_STATED' as const, span: span(quote) });
  const missing = { state: 'NOT_STATED' as const, span: null };
  const base = { recordIndex: 0, provenance: declared, qualifiers: [], counterevidence: [] };
  const supplied = (text: string) => ({ state: 'SUPPLIED' as const, text });
  descriptor.brief = {
    version: 'synthetic-v1', questionText: supplied(descriptor.question),
    decisionToInform: supplied('Kiểm tra trích dẫn và thống kê trong mẫu giả lập'),
    intendedAudience: supplied('Người kiểm thử báo cáo'), scope: supplied('Ba bình luận giả lập'),
    knownConstraints: { state: 'UNSET', text: null }, selectedSectionIds: ['I01', 'I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I13'],
  };
  descriptor.i02 = [{ ...base, role: stated('người mua'), situation: missing, task: stated('tìm viên nhỏ'), setting: stated('ở nhà'), time: missing }];
  descriptor.i04 = [{ ...base, span: span('mua A'), eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' }];
  descriptor.i05 = [
    { ...base, span: span('thích hộp'), polarity: 'POSITIVE', target: stated('hộp'), speakerAttribution: stated('Tôi') },
    { ...base, span: span('không thích vị chua'), polarity: 'NEGATIVE', target: stated('vị chua'), speakerAttribution: stated('Tôi') },
  ];
  const relation = (context: string, link: string) => ({ context: span(context), link: span(link) });
  descriptor.i06 = [{ ...base, firstEvent: span('tìm viên nhỏ'), secondEvent: span('mua A'), relation: relation('Tôi tìm viên nhỏ ở nhà rồi mua A vì dễ nuốt.', 'rồi') }];
  descriptor.i07 = [{ ...base, choiceText: span('mua A'), reasonClause: span('dễ nuốt'), relation: relation('mua A vì dễ nuốt', 'vì'), reasonFacet: 'PRODUCT_ATTRIBUTE', reasonPolarity: 'AFFIRMED', speakerBasis: 'SELF_STATED', resultState: missing }];
  descriptor.i08 = [{ ...base, attemptedTask: span('muốn dùng mỗi ngày'), obstacleClause: span('viên quá lớn'), relation: relation('muốn dùng mỗi ngày nhưng viên quá lớn nên chưa dùng đều', 'nhưng'), barrierFacet: 'PRODUCT_ATTRIBUTE', resolutionState: stated('chưa dùng đều') }];
  descriptor.i09 = [{ ...base, desiredState: span('dùng mỗi ngày'), currentState: span('chưa dùng đều'), relation: relation('muốn dùng mỗi ngày nhưng viên quá lớn nên chưa dùng đều', 'nên'), workaround: missing }];
  const corpus: LocatedInsightMethods['input']['corpora'][number] = {
    sectionId: 'I10', recordIndexes: [0, 1, 2], question: descriptor.question,
    unit: 'Bản ghi bình luận', period: 'Kỳ giả lập; không xác minh thời điểm bình luận',
    frame: 'Ba bình luận do bộ kiểm thử tạo', channel: 'synthetic', inclusionRule: 'Cả ba bản ghi',
    membershipComplete: true, multiCode: true, externalSampling: 'UNKNOWN',
    codebook: { revision: 'synthetic-v1', codes: [
      { code: 'T001', label: 'Dễ nuốt', phrase: 'dễ nuốt', firstRecordIndex: 0, firstSpan: span('dễ nuốt') },
      { code: 'T002', label: 'Kích thước viên', phrase: 'viên quá lớn', firstRecordIndex: 0, firstSpan: span('viên quá lớn') },
    ] },
    assignments: [
      { recordIndex: 0, code: 'T001', span: span('dễ nuốt'), provenance: declared },
      { recordIndex: 1, code: 'T001', span: locatedSpan(texts[1]!, 'dễ nuốt'), provenance: declared },
      { recordIndex: 0, code: 'T002', span: span('viên quá lớn'), provenance: declared },
    ],
    dispositions: [0, 1, 2].map(recordIndex => ({ recordIndex, state: recordIndex === 2 ? 'UNCODED' : 'CODED', provenance: declared })),
  };
  descriptor.corpora = [corpus];
  descriptor.i13Mentions = [0, 1].map(recordIndex => ({ recordIndex, span: locatedSpan(texts[recordIndex]!, 'A'), provenance: declared }));
  const logicalPath = 'located/input.json';
  const file = (path: string, bytes: Buffer, evidenceFamily: string, mediaType = 'application/json'): VerifiedSourcePackageFile => ({
    path, bytes, sha256: sha(bytes), byteSize: bytes.length, mediaType, evidenceFamily,
    representationRole: 'structured', independence: 'non_independent', providerProvenance: 'synthetic',
    provenanceBasis: 'Synthetic declarations, exact adopted method-authority files',
  });
  const files = [
    file(logicalPath, json(descriptor), 'synthetic-located-descriptor'),
    file('located/source.json', source, 'synthetic-comments'),
    file('located/qualitative-profile.md', readFileSync(new URL('../../docs/research/method-configurations-v1/qualitative-profile.md', import.meta.url)), 'method-authority', 'text/markdown'),
    file('located/adoption.md', readFileSync(new URL('../../docs/research/method-configurations-v1-adoption.md', import.meta.url)), 'method-authority', 'text/markdown'),
  ];
  return { logicalPath, descriptor, files };
}
