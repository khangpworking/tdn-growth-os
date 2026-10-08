import type { ReaderReportData } from './build.js';
import { PLATFORM_LABEL } from './layout.js';

export type MarketFinding = { id: string; template: string; exhibit: string; classified: boolean; metricIds: string[] };

/** Fixed topic order, never an importance/revenue ordering. Missing operands
 * remove a quantitative claim; absence counts describe the retained inventory. */
export function marketFindings(data: ReaderReportData): MarketFinding[] {
  if (data.input.contractVersion !== '1.4.0' || data.input.rowLineage === undefined) return [];
  const findings: MarketFinding[] = [];
  const add = (id: string, exhibit: string, classified: boolean,
    platformClaim: (platform: 'shopee' | 'tiktok') => { text: string; ids: string[] }): void => {
    const parts = data.input.platforms.map(platformClaim).filter(part => part.ids.every(key => data.bundle.value(key) !== null));
    if (!parts.length) return;
    findings.push({ id, exhibit, classified, template: parts.map(part => part.text).join('; ') + '.', metricIds: parts.flatMap(part => part.ids) });
  };
  add('inventory', 'Bảng 2.1', false, P => ({ text: `${PLATFORM_LABEL[P]} giữ {{${P}.all.n}} dòng sản phẩm trong mẫu`, ids: [`${P}.all.n`] }));
  add('demand', 'Bảng 3.1', true, P => ({ text: `${PLATFORM_LABEL[P]}: nhu cầu, đo bằng doanh số (ước tính) trong mẫu lõi, là {{${P}.core.rev}} doanh thu và {{${P}.core.units}} đơn vị bán`, ids: [`${P}.core.rev`, `${P}.core.units`] }));
  add('structure', 'Bảng 4.1', true, P => {
    const ids = data.profile.core.map(k => `${P}.seg.${k}.revShare`);
    // Names are supplied separately as escaped retained profile labels by renderer.
    return { text: `${PLATFORM_LABEL[P]}: các nhóm lõi theo thứ tự hồ sơ đã lưu chiếm ${ids.map(id => `{{${id}}}`).join('; ')} doanh thu lõi trong mẫu`, ids };
  });
  add('dates', 'Bảng 6.1', true, P => ({ text: `${PLATFORM_LABEL[P]}: trong mẫu lõi, {{${P}.coh.known}} dòng có ngày mở bán và {{${P}.coh.nodate}} dòng chưa rõ ngày`, ids: [`${P}.coh.known`, `${P}.coh.nodate`] }));
  add('price', 'Bảng 8.1', true, P => ({ text: `${PLATFORM_LABEL[P]}: giá bán trung bình suy từ doanh thu và đơn vị bán lõi là {{${P}.core.asp}}; đây không phải giá niêm yết hay giá theo đơn vị chuẩn`, ids: [`${P}.core.asp`] }));
  add('missing', 'Bảng 2.1', false, P => ({ text: `${PLATFORM_LABEL[P]}: {{${P}.all.rev.missing}} dòng thiếu doanh thu và {{${P}.all.units.missing}} dòng thiếu đơn vị bán trong mẫu; phần thiếu không thay bằng số không`, ids: [`${P}.all.rev.missing`, `${P}.all.units.missing`] }));
  return findings.slice(0, 6);
}
