// Meta ad-library pages (S15) as the Market and Insight reader reports show them. Read-only: nothing is collected or scored here.
//
// The selection is the one the board activity count uses: CONFIRMED views only, and only the distinct L9-INCLUDED (page, ad) pairs.
// Ad copy is third-party seller text. Market shows it as a quoted excerpt, Insight as seller voice ("lời người bán (quảng cáo)");
// it is never customer voice, persona evidence or a frequency input.
import type { CitationInput } from '../citation-registry.js';
import { esc } from '../reader-report/format.js';
import { auditMarketReportHtml } from './market-business-gate.js';
import { technicalLeaks } from './market-14-rules.js';
import type { MetaPageSourceView } from './meta-page-intake.js';
import { webTextHidden } from './web-page-type.js';

export const META_AD_SOURCE_LABEL = 'Quảng cáo trên Meta';
export const META_AD_TITLE = 'Quảng cáo trên Meta của các trang đã xác nhận';
export const META_AD_SRC = 'Thư viện quảng cáo của Meta, các trang đã xác nhận; bản lưu do người vận hành cung cấp, chưa kiểm chứng độc lập.';
export const META_AD_NOTE = 'Số ngày tính tới ngày thu, không chứng minh quảng cáo trả tiền liên tục; chỉ gồm các trang đã xác nhận đúng sản phẩm.';
export const META_AD_SOURCE_NOTE = 'Đã lưu trong lượt này; lời người bán (quảng cáo), không phải ý kiến khách hàng';
/** Insight label for the copy: it is what a seller says about its own product. */
export const META_AD_SELLER_VOICE = 'lời người bán (quảng cáo)';
export const META_AD_EXCERPT_MAX = 160;
/** Shown instead of a copied page name or ad text that a report gate would reject; the full copy stays in the saved capture. */
export const META_AD_NAME_WITHHELD = 'Tên trang được giữ trong bản lưu';
export const META_AD_TEXT_WITHHELD = 'Nội dung quảng cáo được giữ trong bản lưu';

export interface MetaAdCapture { readonly sha256: string; readonly capturedAt: string }
export interface MetaAdPage {
  readonly pageId: string;
  /** Verbatim page name; null when it is withheld. */
  readonly pageName: string | null;
  /** Distinct confirmed, L9-included ads of this page. */
  readonly adCount: number;
  /** YYYY-MM-DD of the earliest start date among those ads. */
  readonly earliestStart: string;
  /** Days from that start date to the day its capture was taken. */
  readonly daysRun: number;
  /** Verbatim start of the earliest ad's text, at most META_AD_EXCERPT_MAX characters; null when withheld. */
  readonly excerpt: string | null;
  /** True when the ad text was longer than the excerpt. */
  readonly excerptCut: boolean;
  /** Every saved capture the counted ads come from, oldest first. */
  readonly captures: readonly MetaAdCapture[];
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** The longest prefix of at most `max` characters that ends between two characters (never inside a surrogate pair or a letter with its marks). */
export function metaAdExcerpt(text: string, max = META_AD_EXCERPT_MAX): { readonly text: string; readonly cut: boolean } {
  let taken = 0, end = 0;
  for (const { segment } of segmenter.segment(text)) {
    const size = Array.from(segment).length;
    if (taken + size > max) return { text: text.slice(0, end), cut: true };
    taken += size; end += segment.length;
  }
  return { text, cut: false };
}

const BENIGN = '<p><span data-quote>Bình giữ nhiệt inox</span></p>';
const failingRules = (html: string): string[] => auditMarketReportHtml(html, { presentation: false }).filter(item => !item.ok).map(item => item.rule);
let baseline: ReadonlySet<string> | undefined;
// Wording the Market rules read in any visible text, quotation or not.
const RESERVED_WORDING = /Ghi chú\s*:|Chú thích\s*:|Chú thích mang|(?<![\p{L}\p{N}])M(?:0[1-9]|1[0-3])(?![\p{L}\p{N}])|(?:thị phần|quy mô thị trường)\s+(?:là|đạt|tăng|giảm|chiếm)\s*\d/iu;
/** Copied third-party text is shown only when the Market gates would accept it as a quotation; otherwise the report says it is kept in the saved capture. */
export function metaTextReportSafe(text: string): boolean {
  const normalized = text.normalize('NFKC');
  if (text.trim() === '' || normalized.includes('%') || webTextHidden(text) || RESERVED_WORDING.test(normalized)) return false;
  const quoted = `<p><span data-quote>${esc(text)}</span></p>`;
  if (technicalLeaks(quoted).length > 0) return false;
  baseline ??= new Set(failingRules(BENIGN));
  return failingRules(quoted).every(rule => baseline!.has(rule));
}

interface Counted {
  readonly ad: MetaPageSourceView['projection']['observations'][number];
  readonly capture: MetaAdCapture;
  /** The retained literal is the byte-exact source; synthetic/unit views may only provide the projection. */
  readonly pageName: string;
  readonly text: string;
}

/**
 * Confirmed pages with their L9-included ads. A (page, ad) pair seen in several confirmed captures counts once and is read from the
 * newest one. The order is stable and is not a ranking.
 */
export function selectMetaAdPages(views: readonly MetaPageSourceView[]): MetaAdPage[] {
  const pairs = new Map<string, Counted>();
  for (const view of views) {
    if (view.state !== 'CONFIRMED') continue;
    const { projection } = view, included = new Set(projection.includedLibraryIds);
    const capture: MetaAdCapture = { sha256: projection.captureSha256, capturedAt: projection.capturedAt };
    const savedAds = new Map((view.capture?.ads ?? []).map(ad => [ad.libraryId.value, ad]));
    for (const ad of projection.observations) {
      if (!included.has(ad.libraryId)) continue;
      const saved = savedAds.get(ad.libraryId);
      const key = `${projection.pageId}#${ad.libraryId}`, prior = pairs.get(key);
      if (prior === undefined || newer(capture, prior.capture)) pairs.set(key, {
        ad, capture, pageName: saved?.pageName.value ?? ad.pageName, text: saved?.text.value ?? ad.textFirst200,
      });
    }
  }
  const pages = new Map<string, Counted[]>();
  for (const [key, counted] of pairs) {
    const pageId = key.slice(0, key.indexOf('#'));
    pages.set(pageId, [...(pages.get(pageId) ?? []), counted]);
  }
  return [...pages].map(([pageId, ads]): MetaAdPage => {
    ads.sort((a, b) => a.ad.startDate.localeCompare(b.ad.startDate) || b.ad.ageDaysToCapture - a.ad.ageDaysToCapture || a.ad.libraryId.localeCompare(b.ad.libraryId));
    const first = ads[0]!, cut = metaAdExcerpt(first.text);
    const captures = [...new Map(ads.map(item => [item.capture.sha256, item.capture])).values()]
      .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || a.sha256.localeCompare(b.sha256));
    return { pageId, pageName: metaTextReportSafe(first.pageName) ? first.pageName : null, adCount: ads.length, earliestStart: first.ad.startDate,
      daysRun: first.ad.ageDaysToCapture, excerpt: metaTextReportSafe(cut.text) ? cut.text : null, excerptCut: cut.cut, captures };
  }).sort((a, b) => a.earliestStart.localeCompare(b.earliestStart) || a.pageId.localeCompare(b.pageId));
}
function newer(a: MetaAdCapture, b: MetaAdCapture): boolean {
  const delta = Date.parse(a.capturedAt) - Date.parse(b.capturedAt);
  return delta !== 0 ? delta > 0 : a.sha256 > b.sha256;
}

/** dd/mm/yyyy for a YYYY-MM-DD date, the way the report shows its period. */
export const metaAdDate = (iso: string): string => iso.split('-').reverse().join('/');

/** The citation of one saved capture, the same in the Market and Insight reports. */
export const metaAdCitation = (capture: MetaAdCapture): CitationInput => ({ sourceKind: 'CAPTURE', identity: capture.sha256, locator: null,
  label: 'Bản lưu trang quảng cáo trên Meta', retrievedAt: new Date(capture.capturedAt).toISOString(), url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
