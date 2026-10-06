// Reader-report rule lint on the final HTML (F1–F8, plus offline assets).
// Display checks at desktop, 375 px and A4 run separately in a browser.
export type LintResult = { rule: string; ok: boolean; detail: string };
export type LintOptions = { providers?: readonly string[]; sectionIds?: readonly string[] };

// Data providers that must never be named in a report (owner rule).
export const FORBIDDEN_PROVIDER_NAMES: readonly string[] = ['Metric', 'Kalodata', 'TradeInt', 'Dami'];

export function visibleText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

export function lint(html: string, { providers = FORBIDDEN_PROVIDER_NAMES, sectionIds = [] }: LintOptions = {}): LintResult[] {
  const out: LintResult[] = [], add = (rule: string, ok: boolean, detail: string) => { out.push({ rule, ok, detail }); };
  const vis = visibleText(html), svgText = [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0].replace(/<[^>]+>/g, ' ')).join(' ');
  const titleTag = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '';
  const prov = providers.filter(p => new RegExp(`\\b${p}\\b`, 'i').test(vis + ' ' + svgText + ' ' + titleTag));
  add('F1 tên nhà cung cấp số liệu', prov.length === 0, prov.length ? 'thấy: ' + prov.join(', ') : 'không thấy ' + providers.join('/'));

  const ex = [...html.matchAll(/<(figure|div) class="ex">([\s\S]*?)(?=<(figure|div) class="ex">|<\/section>)/g)];
  const noSrc = ex.filter(m => !/class="ex-src">Nguồn:/.test(m[2] ?? '')).map(m => ((m[2] ?? '').match(/class="exn">([^<]+)/) ?? [])[1]);
  const noteInSrc = [...html.matchAll(/class="ex-src">([^<]*)/g)].filter(m => /Chú thích/i.test(m[1] ?? '')).length;
  add('F2 hình/bảng có "Nguồn:", "Chú thích:" tách dòng', noSrc.length === 0 && noteInSrc === 0, `${ex.length} hình/bảng; thiếu nguồn: ${noSrc.join(', ') || 0}; chú thích lẫn trong nguồn: ${noteInSrc}`);

  const junk = vis.match(/\bundefined\b|\bNaN\b|\bnull\b|\{\{|\}\}|Infinity/g) ?? [];
  add('F3 không sót undefined/NaN/null/{{}}', junk.length === 0, junk.length ? junk.slice(0, 5).join(', ') : 'sạch');

  const rank = [...vis.matchAll(/(.{0,30})xếp hạng/g)].filter(m => !/không\s*(phải\s*)?$/i.test(m[1] ?? '')).length;
  const whole = [...vis.matchAll(/(.{0,40})(thị phần|toàn thị trường|quy mô thị trường)/g)].filter(m => !/không|chưa|không phải/.test(m[1] ?? '')).length;
  add('F5 không khẳng định toàn thị trường; "sắp xếp" thay "xếp hạng"', rank === 0 && whole === 0, `xếp hạng không phủ định: ${rank}; thị phần/toàn thị trường không phủ định: ${whole}`);

  const m12 = html.match(/<section id="phan-12">[\s\S]*?<\/section>/)?.[0] ?? '';
  const okRec = /đề xuất/i.test(m12) && /chờ chủ duyệt/i.test(m12), okCls = /đề xuất, chờ (chủ )?duyệt|chờ duyệt/.test(vis);
  add('F6 khuyến nghị và phân loại mang nhãn đề xuất, chờ duyệt', okRec && okCls, `Phần 12: ${okRec ? 'có' : 'THIẾU'}; phân loại: ${okCls ? 'có' : 'THIẾU'}`);

  const have = new Set([...html.matchAll(/class="exn">(Hình|Bảng) ([\w.]+)</g)].map(m => `${m[1]} ${m[2]}`));
  const refs = [...vis.matchAll(/(Hình|Bảng) (\d+\.\d+|PL\.\d+)((?:,\s*\d+\.\d+)*)/g)]
    .flatMap(m => [`${m[1]} ${m[2]}`, ...(m[3] ?? '').split(',').map(s => s.trim()).filter(Boolean).map(s => `${m[1]} ${s}`)]);
  const dangling = [...new Set(refs.filter(r => !have.has(r)))];
  const parts = [...vis.matchAll(/Phần (\d+)/g)].map(m => Number(m[1])).filter(x => x < 1 || x > 12);
  const pl = [...have].filter(x => /PL\./.test(x)).map(x => Number(x.split('.')[1])).sort((a, b) => a - b);
  const plOk = pl.every((v, i) => v === i + 1);
  add('F7 tham chiếu chéo trỏ tới thứ có thật; PL liên tục', dangling.length === 0 && parts.length === 0 && plOk, `${refs.length} tham chiếu; treo: ${dangling.join(', ') || 0}; Phần ngoài 1–12: ${parts.length}; PL: ${pl.join(',')}`);

  const cov = html.match(/<header class="cover"[\s\S]*?<\/header>/)?.[0].replace(/style="[^"]*"/, '') ?? '';
  const covTxt = cov.replace(/<[^>]+>/g, ' ');
  const covBad = /\d[\d.]*\s*(sản phẩm|gian hàng)|Nguồn ảnh|ảnh:|badge/.test(covTxt + cov.replace(/class="cover[^"]*"/g, ''));
  add('F8 bìa đúng mẫu (không số sản phẩm, nhãn, nguồn ảnh)', !!cov && !covBad, cov ? (covBad ? 'bìa có chữ cấm' : 'đúng mẫu') : 'không có bìa');

  // CSS loads only from <style> blocks and style attributes; the same words in
  // escaped page text (e.g. a quoted web snippet) load nothing.
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>|\bstyle="([^"]*)"/gi)].map(m => m[1] ?? m[2] ?? '').join('\n');
  const remote = [
    ...html.matchAll(/<link\b[^>]*>|<script\b[^>]*\bsrc=|\b(?:src|href)="(?:https?:)?\/\//gi),
    ...css.matchAll(/url\(\s*(?:['"]|&quot;|&#39;)?\s*(?:https?:)?\/\/|@import\b/gi),
  ].map(m => m[0].slice(0, 40));
  add('F0 không tải tài nguyên ngoài (font, ảnh, script cục bộ)', remote.length === 0, remote.length ? remote.slice(0, 3).join(' | ') : 'cục bộ');

  const secs = [...html.matchAll(/<section id="([^"]+)"/g)].map(m => m[1] ?? '');
  if (sectionIds.length) add('Cấu trúc: đủ Phần 1–12 và Phụ lục', sectionIds.every(s => secs.includes(s)), secs.join(' '));
  return out;
}
