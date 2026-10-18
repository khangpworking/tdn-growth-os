import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { descriptiveMarketFixture } from './descriptive-market-fixture.js';

/** Synthetic declarations exercise the renderer without captures, services or providers. */
export function descriptiveReaderFixture(methodVersion: '1.0.0' | '1.1.0' = '1.1.0') {
  const { descriptor } = descriptiveMarketFixture();
  const scope = { ...descriptor.scope, geography: 'Truy vấn Việt Nam (VN); từ chối phản hồi có quốc gia mâu thuẫn.' };
  const base = descriptor.m05[0]!;
  const observations = ['Bình nhỏ', 'Bình lớn'].flatMap((entityLabel, productIndex) =>
    ['2026-01-01', '2026-02-01'].flatMap((start, windowIndex) => ['revenue', 'sales_volume'].map((measureLiteral, measureIndex) => {
      const index = productIndex * 4 + windowIndex * 2 + measureIndex;
      const value = index === 0 ? '0' : measureIndex === 0 ? '111598280.07' : '7082';
      return { ...base, source: { ...base.source, locator: `/observations/${index}` }, entityLabel, measureLiteral,
        measureDefinition: measureLiteral, sourceWording: JSON.stringify({ [measureLiteral]: value }),
        unit: measureIndex === 0 ? 'VND' : 'đơn vị', scope, aggregation: null,
        period: { start, end: windowIndex === 0 ? '2026-01-31' : '2026-02-28', timezone: '+07:00',
          basis: 'Khoảng ngày đã truy vấn; +07:00 là quy ước hiển thị Việt Nam của ứng dụng. Chưa xác minh ranh giới ngày hoặc độ phủ của nguồn.' },
        observation: { state: index === 0 ? 'observed_zero' as const : 'observed_value' as const, value, precision: 'non_exact' as const },
      };
    })));
  const supply = { ...observations[0]!, measureLiteral: 'stock', unit: 'đơn vị',
    source: { ...base.source, locator: '/supply/stock' },
    observation: { state: 'observed_value' as const, value: '24', precision: 'exact' as const } };
  const events = ['2024-08-31', '2026-01-15', '2026-03-01', null].map((eventDate, index) => ({
    source: { ...base.source, locator: `/events/${index}` }, statementType: 'UNCLASSIFIED' as const,
    sourceWording: JSON.stringify({ launch_date: eventDate ?? 'ngày không hợp lệ' }),
    attribution: 'Nguồn khai báo ngày; chưa xác minh độc lập.', publicationDate: null, eventDate,
    dateBasis: 'Ngày do nguồn khai báo tại launch_date. Giá trị sai định dạng được giữ nguyên, không tự sửa.',
    namedScope: index === 1 ? 'synthetic:product-b' : 'synthetic:product-a',
    targetLink: { ...base.source, locator: `/events/${index}/namedScope` }, affectedMetricLiteral: null, conflictRefs: [],
  }));
  return buildDescriptiveMarketMethods({ ...descriptor, scope, m05: observations, m07: observations,
    m06: [observations[0]!, supply].map(observation => ({ observation, objectLiteral: 'Bản ghi sản phẩm', statusLiteral: null, dateMeaning: 'Kỳ truy vấn của thước đo.' })),
    m09: events, sourcePackage: { packageId: '66666666-6666-4666-8666-666666666666', version: 1,
      manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
  }, { methodVersion }).output;
}
