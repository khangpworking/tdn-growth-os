import type { CaptureQualityRow } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { relevanceArchive, relevanceHash } from './capture-relevance-fixture.js';

export const inventedProducts = [
  { keyword: 'đèn lumo', accessory: 'Vỏ dùng cho đèn lumo', gift: 'Túi mẫu tặng đèn lumo' },
  { keyword: 'giày vesa', accessory: 'Bao dùng cho giày vesa', gift: 'Hộp mẫu tặng giày vesa' },
  { keyword: 'bánh nori', accessory: 'Hộp đựng bánh nori', gift: 'Túi mẫu tặng bánh nori' },
  { keyword: 'bình zeno', accessory: 'Vỏ tương thích với bình zeno', gift: 'Hộp mẫu tặng bình zeno' },
] as const;
export const genuineProducts = [
  { keyword: 'quạt điện', title: 'Cho phòng nhỏ: quạt điện để bàn' },
  { keyword: 'giày thể thao', title: 'Cho bé: giày thể thao đế mềm' },
  { keyword: 'son môi', title: 'Dành cho môi khô: son môi dưỡng màu' },
  { keyword: 'bánh quy', title: 'Cho bữa sáng: bánh quy yến mạch' },
  { keyword: 'nước lau sàn', title: 'Cho sàn gỗ: nước lau sàn đậm đặc' },
] as const;
export const normalRow = (title: string, categoryText = 'Danh mục hiếm mẫu'): CaptureQualityRow =>
  ({ title, categoryText, platform: 'shopee', price: 100, revenue: 100, units: 1 });
export const referenceRows = (keyword: string) => Array.from({ length: 40 }, (_, i) => normalRow(`${keyword} mẫu ${i}`, 'Danh mục chính mẫu'));

/** Real capture bytes, distinct synthetic shops, and a manifest bound to those exact bytes. */
export async function methodCArchive(keyword: string, rows: readonly CaptureQualityRow[]) {
  const archive = await relevanceArchive();
  const snapshot = archive.snapshot;
  snapshot.scope.keywords = [keyword];
  snapshot.scope.platforms = rows.some(row => row.platform === 'tiktok') ? rows.some(row => row.platform === 'shopee') ? ['shopee', 'tiktok'] : ['tiktok'] : ['shopee'];
  const numericPlatform = (platform: string): 'shopee' | 'tiktok' | 'unknown' => platform === 'shopee' || platform === 'tiktok' ? platform : 'unknown';
  snapshot.groups.W12_topProducts = { columns: ['name', 'shop', 'platform', 'category', 'price', 'revenue', 'units'], rows: rows.map((row, i) => ({ cells: {
    name: { label: 'Title', text: row.title, sourcePointer: `rows[${i}].name` },
    shop: { label: 'Shop', text: `Synthetic shop ${i}`, sourcePointer: `rows[${i}].shop` },
    platform: { label: 'Platform', text: row.platform, sourcePointer: `rows[${i}].platform` },
    category: { label: 'Category', text: row.categoryText ?? '', sourcePointer: `rows[${i}].category` },
    price: { label: 'Price', displayed: String(row.price ?? ''), value: row.price ?? null, unit: 'VND', precision: 'exact', platform: numericPlatform(row.platform), period: snapshot.scope.period, sourcePointer: `rows[${i}].price` },
    revenue: { label: 'Revenue', displayed: String(row.revenue ?? ''), value: row.revenue, unit: 'VND', precision: 'exact', platform: numericPlatform(row.platform), period: snapshot.scope.period, sourcePointer: `rows[${i}].revenue` },
    units: { label: 'Units', displayed: String(row.units ?? ''), value: row.units, unit: 'COUNT', precision: 'exact', platform: numericPlatform(row.platform), period: snapshot.scope.period, sourcePointer: `rows[${i}].units` },
  } })) };
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = JSON.parse(archive.manifestBytes.toString());
  manifest.appliedFilters = snapshot.scope;
  manifest.resultCount = rows.length;
  manifest.productPagination = { cap: rows.length, totalShown: rows.length, pageSize: rows.length, pagesRead: 1, rowsRead: rows.length, truncated: false };
  manifest.files = [{ path: 'snapshot.json', sha256: relevanceHash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }];
  return { snapshot, snapshotBytes, manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}
