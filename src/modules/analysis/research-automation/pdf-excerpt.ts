// Verified PDF document excerpts in the Market report (S25). Read-only: the excerpts are selected from the quotes the run already
// stored, never asked for again. No reworded text, no guessed metadata, no grade: every excerpt is shown as "chưa xếp hạng độ tin cậy".
import { CitationRegistry, type CitationInput } from '../citation-registry.js';
import { PAGEINDEX_ELIGIBLE_SECTIONS, toCitationInput, type PageIndexQuotesArtifact } from '../pageindex-questions.js';
import { HIDDEN_NAMES as REPORT_HIDDEN_NAMES, hasHiddenName } from '../report-language/index.js';
import { readerTextSafe } from './reader-plain-text.js';
import type { StepPdfDiscovery } from './model.js';

/** The Market section that holds the block: "Động lực và rủi ro" is the context section for outside documents. */
export const PDF_EXCERPT_SECTION = 'M09' as const;
export const PDF_EXCERPT_MAX_PER_DOCUMENT = 3;
export const PDF_EXCERPT_MAX_WORDS = 30;
export const PDF_EXCERPT_TITLE = 'Trích đoạn nguyên văn từ tài liệu PDF của lượt này';
export const PDF_EXCERPT_UNRECORDED = 'chưa ghi';
export const PDF_EXCERPT_UNRATED = 'chưa xếp hạng độ tin cậy';
export const PDF_EXCERPT_NOTE = 'Các đoạn trích này lấy nguyên văn từ tài liệu PDF trong hồ sơ nguồn của lượt này (do chủ đính kèm hoặc tải về khi thu thập). Mỗi đoạn nói về phạm vi của chính tài liệu đó, không nói về sản phẩm này; số trong đó không so sánh được với số liệu mẫu và không được cộng vào số liệu mẫu.';
export const PDF_EXCERPT_SRC = 'Tài liệu PDF đã lưu trong hồ sơ nguồn của lượt này.';
export const PDF_DISCOVERY_SOURCE_LABEL = 'Tài liệu ngành dạng PDF';
export const PDF_DISCOVERY_MISSING = 'Chưa tìm thấy tài liệu phù hợp trong lượt này.';
export const PDF_DISCOVERY_NOT_READ_IN_TIME = 'Đã tìm thấy tài liệu nhưng chưa đọc kịp trong lượt này.';
export const PDF_DISCOVERY_NOT_READ = 'Đã tìm thấy tài liệu nhưng chưa đọc được trong lượt này.';

/** A stored attempt with no report excerpt gets one plain source-status row; receipts never become citations. */
export function pdfDiscoverySourceRows(discovery: StepPdfDiscovery | undefined, excerpts: readonly PdfExcerpt[]): readonly (readonly [string, string])[] {
  if (discovery === undefined || excerpts.length > 0) return [];
  return [[PDF_DISCOVERY_SOURCE_LABEL, discovery.readState === 'NOT_READ_IN_TIME' ? PDF_DISCOVERY_NOT_READ_IN_TIME
    : discovery.readState === 'NOT_READ' ? PDF_DISCOVERY_NOT_READ : PDF_DISCOVERY_MISSING]];
}
/** Longest document name shown; a longer title reads as a pasted heading or sentence, so the order wording is used instead. */
export const PDF_DOCUMENT_TITLE_MAX = 160;
/** The name of a document whose own title is missing or not plain reader text: its order among such documents in the block. */
export const pdfUntitledName = (ordinal: number): string => `Tài liệu PDF số ${ordinal}`;

export type PdfExcerptLeftOutReason = 'NOT_ATTESTED' | 'NOT_MARKET_SECTION' | 'OVER_30_WORDS' | 'OVER_3_PER_DOCUMENT' | 'NOT_FOR_THIS_RUN' | 'NOT_READER_SAFE' | 'EMPTY_QUOTE';

/** One verbatim excerpt as stored with the report. The label is the reader text; the grade, publisher and year are fixed wording at render time. */
export interface PdfExcerpt {
  readonly sourceSha256: string;
  readonly page: number;
  readonly text: string;
  readonly label: string;
}
export interface PdfExcerptLeftOut { readonly sourceSha256: string; readonly page: number; readonly reason: PdfExcerptLeftOutReason }
export interface PdfExcerptSelection { readonly excerpts: readonly PdfExcerpt[]; readonly leftOut: readonly PdfExcerptLeftOut[] }

// R-L01 names: an excerpt is copied text, so a name leaves the excerpt out (report-language COPIED rule).
const providerNamed = (text: string): boolean => hasHiddenName(text, 'COPIED');
/**
 * Text that could expose a path, link, address, account or secret is not shown. The report's own leak gates do not catch every
 * shape (an ordinary `/tmp/...` path passes them), so these are checked here, beside the shared reader-text check.
 */
const LEAK_PATTERNS: readonly RegExp[] = [
  /[A-Za-z]:[\\/]|\\\\[\w.-]+\\|(?<![\p{L}\p{N}])[A-Za-z]:(?=[\p{L}\p{N}_.~-])/u, // Windows drive, drive-relative or network path
  /\b[\w.-]+\/[\w.-]+\.(?:html?|php|aspx?|jsp|pdf|json|xml|csv|xlsx?|docx?|txt|png|jpe?g|gif|svg|js|css)\b|\b(?:href|src)\s*=|[?&][\w-]+=[\w%.-]/iu, // relative link
  /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|(?<![\p{L}\p{N}_@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|gov|edu|info|biz|io|vn|asia|int)\b/iu, // web address
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu, // e-mail
  /(?<!\d\.?)(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\.?\d)|(?:\b[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}\b)?|\b(?:[0-9a-f]{1,4}:){5,}[0-9a-f]{1,4}\b/iu, // IP address
  /\bBearer\s|\b(?:sk|pk|rk)-[A-Za-z0-9]|\b(?:ghp|gho|ghu|ghs|github_pat|xox[abprs])[_-]|\bAKIA[0-9A-Z]{12,}|\beyJ[\w-]{8,}|\b(?:api[_\s-]?key|access[_\s-]?token|secret|password|passwd)\b\s*[:=]/iu, // secret
  /(?<![\p{L}\p{N}])(?=[\w+\/=]*\d)(?=[\w+\/=]*[A-Za-z])[\w+\/=]{24,}/u, // token-shaped run of letters and digits; hyphenated file names pass
];
/**
 * Leak shapes are allowed out, not hunted: seven review rounds each found more shapes a deny-list missed. Text is shown only when
 * it is plain Vietnamese prose: every letter is an ASCII letter or "đ" once the Vietnamese accent marks are taken off (so no small
 * capital, look-alike or extra mark), digits are ASCII, punctuation is ordinary (no backslash, "@", "=", "_", look-alike slash or
 * format character), every word is in the closed word set (`vietnameseWord`) or the closed number grammar (`NUMBER_SHAPES`), two
 * numbers never stand side by side and no access-code label or spelled-out address is shown. A quote that is not plain prose is
 * left out whole.
 */
const PLAIN_BASE = /^[A-Za-zĐđ0-9 \t\r\n .,;:!?()[\]"'“”‘’«»\-–—…/%+&*#~°×₫≥≤≈±→²³]*$/u;
const VIETNAMESE_MARKS = /[\u0300\u0301\u0302\u0303\u0306\u0309\u031B\u0323]/gu;
const plainLetters = (text: string): boolean => PLAIN_BASE.test(text.normalize('NFD').replace(VIETNAMESE_MARKS, ''));
const FULLWIDTH = /[＀-￯]/u;
/** Letters and digits only, lower case, so no space, dash or dot can split a name ("Page Index", "Agent–Reach", "api  key"). */
const squash = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const HIDDEN_NAMES = [...REPORT_HIDDEN_NAMES.map(entry => entry.name), 'token', 'password', 'passwd', 'secret', 'apikey', 'bearer', 'accesskey', 'mật khẩu', 'mã truy cập',
  'khóa bí mật', 'khoá bí mật'].map(name => squash(name.normalize('NFC')));
/** A provider name or secret label anywhere in the text once it is joined up; an ordinary word that holds one is left out too. */
const namesHidden = (text: string): boolean => { const joined = squash(text.normalize('NFC')); return HIDDEN_NAMES.some(name => joined.includes(name)); };
const OPENING = /^[(["'“‘«]+/u;
const CLOSING = /[)\]"'”’»,.;:!?…]+$/u;
/** A label that names an access code, card or account is never shown, whatever the value after it looks like (dashes read as spaces). */
const SECRET_LABEL = /(?<![\p{L}\p{N}])(?:mã\s*(?:xác\s*(?:thực|nhận|minh)|bảo\s*mật|số|khóa|otp|pin|kích\s*hoạt|đăng\s*nhập|khôi\s*phục|giao\s*dịch|thẻ)|otp|cvv|cvc|số\s*(?:tài\s*khoản|thẻ|serial|sê\s*ri)|tài\s*khoản\s*số|serial|license\s*key|mật\s*mã)(?![\p{L}\p{N}])/iu;
/** Lowercase "pin" is also an ordinary Vietnamese battery word; block it as a secret only when it carries a bare code number. */
const PIN_CODE = /(?<![\p{L}\p{N}])pin\s*[:#-]?\s*\d{1,8}(?!\s*(?:mAh|mah|V|v)\b)(?![\p{L}\p{N}])/iu;
/** An address spelled out in words ("a còng", "chấm com", "203 chấm 0"). */
const SPELLED_ADDRESS = /(?<![\p{L}\p{N}])(?:a\s+còng|chấm\s+(?:com|vn|net|org)|\d+\s+chấm\s+\d)(?![\p{L}])/iu;
/** Dotted abbreviations that are not addresses (v.v = "and so on", TP.HCM). */
const DOTTED_ABBREVIATION = /^(?:v\.v|T[Pp]\.\p{Lu}{2,4})$/u;

/**
 * The closed word set. A word without a digit is shown only when it is written Vietnamese: one syllable, read on the letters left
 * once the accent marks are taken off (an onset, then a rhyme of the written language; a rhyme that ends in c, ch, p or t carries
 * the sắc or nặng mark, as every written syllable does), a single letter, a listed acronym in capitals, or a listed unit, loanword
 * or marketplace name. Host names, commands, English labels, provider names and codes are not Vietnamese syllables, so they are
 * left out as one class rather than shape by shape.
 */
const ONSET = '(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|b|c|d|đ|g|h|k|l|m|n|p|r|s|t|v|x)?';
const RHYME = '(?:a|e|i|y|o|u|ai|ao|au|ay|eo|eu|ia|iu|ieu|yeu|oa|oai|oao|oay|oe|oeo|oi|ua|uay|ue|ui|uoi|uo|uu|uou|uy|uya|uyu'
  + '|am|em|im|om|um|iem|yem|uom|oam|an|en|in|on|un|ien|yen|uan|uon|oan|oen|uen|uyen|uyn'
  + '|ang|eng|ong|ung|ieng|yeng|uong|oang|uang|oong|anh|enh|inh|oanh|uenh|uynh|ynh'
  + '|ac|ec|oc|uc|iec|uoc|oac|uac|ooc|ach|ech|ich|oach|uech|uych|ap|ep|ip|op|up|iep|yep|uop|oap|uyp'
  + '|at|et|it|ot|ut|iet|yet|uot|oat|oet|uat|uyet|uyt)';
const SYLLABLE = new RegExp(`^${ONSET}${RHYME}$`, 'u');
const ACRONYMS = new Set(['USD', 'VND', 'VNĐ', 'GDP', 'GRDP', 'FMCG', 'CAGR', 'KOL', 'KOC', 'CPI', 'FDI', 'ASEAN', 'EU', 'WTO', 'HCM', 'TP', 'VN',
  'TMĐT', 'SME', 'UBND', 'ĐBSCL', 'SKU', 'OEM', 'ODM']);
const LISTED_WORDS = new Set(['online', 'offline', 'livestream', 'marketing', 'video', 'sale', 'hot', 'top', 'trend', 'review', 'brand', 'combo',
  'voucher', 'freeship', 'mini', 'size', 'set', 'shop', 'shopee', 'tiktok', 'lazada', 'tiki', 'sendo', 'inox', 'vitamin', 'canxi', 'protein',
  'collagen', 'nilon', 'silicon', 'gel', 'serum', 'cotton',
  'kg', 'mg', 'ml', 'cm', 'mm', 'km', 'ha', 'kwh', 'kw', 'mah', 'gb', 'mb', 'tb', 'vnđ', 'vnd', 'tr']);
function vietnameseWord(word: string): boolean {
  if (/^\p{L}$/u.test(word) || ACRONYMS.has(word)) return true;
  if (/^[A-Z]{2,}$/u.test(word)) return false; // an unlisted code in capitals (PIN, ABCD)
  const lower = word.toLowerCase();
  if (LISTED_WORDS.has(lower)) return true;
  const marked = lower.normalize('NFD');
  const base = marked.replace(VIETNAMESE_MARKS, '');
  return SYLLABLE.test(base) && (!/(?:c|ch|p|t)$/u.test(base) || /[̣́]/u.test(marked));
}

/** Words that may follow a slash as "per" (đồng/chiếc, 250.000đ/tháng, lần/ngày). */
const PER_WORD = 'tháng|năm|ngày|tuần|quý|giờ|phút|lần|người|hộp|chai|gói|chiếc|cái|đơn|kg|g|ml|l|lít|m|m2|cm|km|ha|tấn|đồng|suất|ly|cốc|lon|túi|hũ|thùng|lốc|két|bộ|đôi|sp';
const PER = new RegExp(`^(?:${PER_WORD})$`, 'iu');
/** A slash between two words only as "per", or between two Vietnamese words (và/hoặc); server/share, tmp/a are paths. */
function letterSlash(word: string): boolean {
  const parts = /^(\p{L}+)\/(\p{L}+)$/u.exec(word);
  return parts !== null && vietnameseWord(parts[1]!)
    && (PER.test(parts[2]!) || (vietnameseWord(parts[2]!) && /[^\u0000-\u007f]/u.test(parts[1]!) && /[^\u0000-\u007f]/u.test(parts[2]!)));
}

/**
 * The closed number grammar. A word that holds a digit is shown only when the whole word is one of these shapes: no leading zero,
 * at most four ungrouped digits, thousands groups, a short decimal, a percentage, a closed unit, a range of two, a date, a time, a
 * one-digit ratio or a short upper-case code. Everything else with a digit (an address, a grouped code, a token) is left out.
 */
const UNITS = 'vnđ|vnd|usd|₫|đ|tr|k|kg|mg|g|ml|l|cm|mm|km|m2|m3|m|ha|kwh|kw|w|mah|v|gb|mb|tb|h|ph|p|s|x|t|d|°c|°';
const NUMBER = '(?:[1-9]\\d{0,2}(?:\\.\\d{3}){1,3}(?:,\\d{1,2})?|[1-9]\\d{0,2}(?:,\\d{3}){1,3}(?:\\.\\d{1,2})?|(?:0|[1-9]\\d{0,2})[.,]\\d{1,2}|0|[1-9]\\d{0,3})';
const AMOUNT = `${NUMBER}(?:${UNITS}|%)?`;
const YEAR = '(?:19|20)\\d{2}';
const NUMBER_SHAPES: readonly RegExp[] = [
  new RegExp(`^[+~±≥≤≈-]?${AMOUNT}\\+?$`, 'iu'), // 2025, 12.345.678, 5,2%, 250.000đ, 5000mAh, ~30%, 1.000+
  new RegExp(`^~?${AMOUNT}[–-]${AMOUNT}$`, 'iu'), // a range of two: 10–20%, 10-20ml, 2024–2025
  new RegExp(`^(?:0?[1-9]|[12]\\d|3[01])/(?:0?[1-9]|1[0-2]|${YEAR})$`, 'u'), // 15/6, 6/2025, 3/4, 24/7 (a full date fails the shared reader check)
  new RegExp(`^${AMOUNT}/(?:${PER_WORD})$`, 'iu'), // 250.000đ/tháng, 50.000đ/kg
  new RegExp(`^Q[1-4]/${YEAR}$`, 'u'), // Q3/2025
  /^(?:[01]?\d|2[0-3]):[0-5]\d$|^[1-9]:[1-9]$/u, // 10:30, 1:2
  /^\p{Lu}\d{1,2}$|^\p{Lu}\d\p{Lu}$|^COVID-19$/u, // Q3, A4, S24, B2B, COVID-19 (AB12, ABCD-12 read as codes)
];
function numberWord(word: string): boolean {
  if (!NUMBER_SHAPES.some(shape => shape.test(word))) return false;
  // Four dotted groups that each fit an address part read as a machine address (192.168.100.200), not as thousands.
  if ((word.match(/\d+(?:\.\d+)+/gu) ?? []).some(run => { const groups = run.split('.'); return groups.length >= 4 && groups.every(group => Number(group) <= 255); })) return false;
  // Two four-digit numbers joined are a split code (1234–5678) unless they are years (2024–2025).
  return !/[–-]/u.test(word) || (word.match(/(?<![\d.,])\d{4}(?![\d.,])/gu) ?? []).every(digits => new RegExp(`^${YEAR}$`, 'u').test(digits));
}

function plainWord(token: string, last: boolean): boolean {
  if (/^\p{L}:$/u.test(token)) return false; // drive letter, also spaced ("C: / a")
  const word = token.replace(OPENING, '').replace(CLOSING, '');
  // A spaced "/" never stands alone ("/ tmp / a", "https : / / x"); a spaced "." or ":" only ends the text ("tăng mạnh .").
  if (!word) return !token.includes('/') && (last || token === '...' || !/[.:]/u.test(token));
  if (/^[\-–—&*#+]+$/u.test(word)) return true;
  if (word.length > 40) return false;
  if (/\p{N}/u.test(word)) return numberWord(word);
  if (/[:%~]/u.test(word)) return false; // scheme, drive, label:value, encoded byte; a time, ratio or percentage holds a digit
  if (word.includes('/')) return letterSlash(word); // /secret, //server/share, ~/a, ./a, a/b/c, tmp/a
  if (word.includes('.')) return DOTTED_ABBREVIATION.test(word); // domain, host, file name
  // A leading hyphen is a command flag (rm -rf); three or more hyphenated parts are a slug or code (thu-muc-bao-cao); each part is
  // a Vietnamese word (sê-ri).
  return !word.startsWith('-') && (word.match(/[-–—]/gu) ?? []).length <= 1 && word.split(/[-–—]/u).every(part => vietnameseWord(part));
}

/** Two numbers side by side are a spaced address or a grouped code ("203. 0. 113. 7", "1234 5678 9012"); only one spaced range ("10 – 20") joins two. */
function numbersApart(tokens: readonly string[]): boolean {
  let previous = -1, joined = false;
  for (const [i, token] of tokens.entries()) {
    if (!/\p{N}/u.test(token)) continue;
    const between = tokens.slice(previous + 1, i);
    if (previous >= 0 && !between.some(word => /\p{L}/u.test(word))) {
      if (joined || between.length !== 1 || !/^[–—-]$/u.test(between[0]!) || CLOSING.test(tokens[previous]!)) return false;
      joined = true;
    } else joined = false;
    previous = i;
  }
  return true;
}
const TOP_LEVEL = /^(?:com|net|org|gov|edu|info|biz|io|vn|asia|int|co|ai|me|tv|app|dev|xyz|online|shop|store|site|top|cc|us|uk)$/iu;
/** A spaced domain: a word that ends in a dot, then a top-level domain ("example. com"). */
const spacedDomain = (tokens: readonly string[]): boolean =>
  tokens.some((token, i) => /[\p{L}\p{N}]\.$/u.test(token) && i + 1 < tokens.length && TOP_LEVEL.test(tokens[i + 1]!.replace(OPENING, '').replace(CLOSING, '')));

function plainProse(text: string): boolean {
  const folded = text.normalize('NFKC');
  const tokens = folded.trim().split(/\s+/u);
  const spaced = folded.replace(/[-–—_]/gu, ' ');
  return plainLetters(text) && !FULLWIDTH.test(text) && plainLetters(folded) && !namesHidden(folded) && !SECRET_LABEL.test(spaced) && !PIN_CODE.test(spaced)
    && !SPELLED_ADDRESS.test(spaced) && tokens.every((token, i) => plainWord(token, i === tokens.length - 1)) && numbersApart(tokens) && !spacedDomain(tokens);
}
const leaks = (text: string): boolean => !plainProse(text) || LEAK_PATTERNS.some(pattern => pattern.test(text));

const words = (text: string): number => text.trim().split(/\s+/u).filter(Boolean).length;
/** The same closed plain-prose, leak and provider checks, for other verbatim operator text (seller video speech). */
export const pdfPlainTextSafe = (text: string): boolean => !providerNamed(text) && !leaks(text) && readerTextSafe(text);

/**
 * A title in capitals is read word by word in lower case, keeping the listed acronyms, so "BÁO CÁO NGÀNH" or "VIỆT NAM" reads as
 * Vietnamese words. Only the reading changes: the shown title keeps its capitals, and the secret-label, provider and leak checks
 * ignore case anyway.
 */
const capitalsRead = (text: string): string => text.split(' ').map(token => {
  const word = token.replace(OPENING, '').replace(CLOSING, '');
  return /^\p{Lu}{2,}$/u.test(word) && !ACRONYMS.has(word) ? token.toLowerCase() : token;
}).join(' ');
const titleShown = (title: string): boolean => {
  const count = title.split(/\s+/u).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
  // Vietnamese words are syllables: a name of one or two ("Báo cáo") says nothing about the document.
  return title.length <= PDF_DOCUMENT_TITLE_MAX && count >= 3 && count <= PDF_EXCERPT_MAX_WORDS && /\p{L}/u.test(title) && !providerNamed(title)
    && !/%|\b(?!Q[1-4]\b)[A-Z]\d{1,2}[A-Z]?\b/u.test(title)
    && !LEAK_PATTERNS.some(pattern => pattern.test(title)) && readerTextSafe(title) && !leaks(capitalsRead(title));
};

/**
 * The document name shown for a run PDF: the title its search result showed, or the title stored in the PDF itself. Never a file
 * name: a title is shown only when it passes the same closed plain-prose, provider and leak checks as the excerpts, so a file name,
 * link, path, code, provider or English heading is not shown. A "[PDF]" mark, a trailing "..." and anything after " | " are
 * dropped; a site name after the last " - " is dropped when the title passes only without it. Null means the order wording is used.
 * Stored titles are vetted again when shown.
 */
export function pdfDocumentTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimEnd = (text: string): string => text.replace(/(?:\s*(?:\.{3,}|…))+$/u, '').trim();
  const title = trimEnd(raw.normalize('NFC').replace(/\s+/gu, ' ').trim().replace(/^\[PDF\]\s*/iu, '').split(' | ')[0]!);
  // Any word that ends like a file extension (".pdf", ".dotx", ".mobi", ".pages"…), wherever it stands and whatever punctuation
  // follows it, marks a file name, so no list of known extensions can fall behind and no site tail can hide it. A real title with a
  // dotted abbreviation ("TP.HCM") is then read by its order number, which never shows a file name.
  if (title.split(' ').some(token => /\.(?=\p{N}*\p{L})[\p{L}\p{N}]{2,8}$/u.test(token.replace(CLOSING, '')))) return null;
  for (const candidate of [title, trimEnd(title.replace(/\s[-–—]\s[^-–—]*$/u, '').trim())]) if (candidate && titleShown(candidate)) return candidate;
  return null;
}

/** Rebuilding a reader from a saved semantic packet must not reuse historical file-name labels. */
export function readerPdfExcerpts(excerpts: readonly PdfExcerpt[]): readonly PdfExcerpt[] {
  const names = new Map<string, string>();
  let untitled = 0;
  return excerpts.map(excerpt => {
    let name = names.get(excerpt.sourceSha256);
    if (name === undefined) {
      name = pdfDocumentTitle(excerpt.label.replace(/,\s*trang\s+\d+$/u, '')) ?? pdfUntitledName(++untitled);
      names.set(excerpt.sourceSha256, name);
    }
    return { ...excerpt, label: `${name}, trang ${excerpt.page}` };
  });
}

/** The citation entry of one excerpt, built the way every PDF citation is built (`toCitationInput`). */
export function pdfExcerptCitation(excerpt: PdfExcerpt): CitationInput {
  const name = excerpt.label.replace(/,\s*trang\s+\d+$/u, '').trim();
  const safeName = pdfDocumentTitle(name) ?? (/^Tài liệu PDF số [1-9]\d*$/u.test(name) ? name : pdfUntitledName(1));
  return { sourceKind: 'PDF_PAGE', identity: excerpt.sourceSha256, locator: { kind: 'pdf', page: excerpt.page, fragment: null },
    label: `${safeName}, trang ${excerpt.page}`, retrievedAt: null, url: null, quote: excerpt.text, quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED' };
}

/**
 * The market14 reader's entry for one excerpt: the same source and page as `pdfExcerptCitation`, labelled with the document name
 * alone, because the register prints the page locator after it ("<name>, trang N").
 */
export function pdfExcerptReaderCitation(excerpt: PdfExcerpt): CitationInput {
  const citation = pdfExcerptCitation(excerpt);
  return { ...citation, label: citation.label.replace(/,\s*trang\s+\d+$/u, '') };
}

function readerSafe(text: string, citation: CitationInput): boolean {
  if (providerNamed(text) || leaks(text) || !readerTextSafe(text)) return false;
  try { new CitationRegistry().cite(citation); return true; } catch { return false; }
}

/**
 * Pure selection over the run's stored verified quotes: Market sections only, attested only, verbatim only, at most 3 per document
 * in stored order, at most 30 words each. A quote that does not qualify is left out with a reason code; none is cut or reworded.
 * `documents` maps each run PDF to its stored document title (null when none): the label is "<title>, trang N", or "Tài liệu PDF
 * số k, trang N" counting, in block order, only the shown documents without a usable title.
 */
export function selectPdfExcerpts(artifact: PageIndexQuotesArtifact | null | undefined, runId: string, documents: ReadonlyMap<string, string | null>): PdfExcerptSelection {
  const excerpts: PdfExcerpt[] = [], leftOut: PdfExcerptLeftOut[] = [];
  if (!artifact || artifact.contractVersion !== 'pageindex-verified-quotes-v1' || !Array.isArray(artifact.quotes)) return { excerpts, leftOut };
  const perDocument = new Map<string, number>(), untitled = new Map<string, number>();
  const out = (sourceSha256: string, page: number, reason: PdfExcerptLeftOutReason): void => { leftOut.push({ sourceSha256, page, reason }); };
  for (const quote of artifact.quotes) {
    if (artifact.runId !== runId || !documents.has(quote.sourceSha256)) { out(quote.sourceSha256, quote.page, 'NOT_FOR_THIS_RUN'); continue; }
    if (quote.quoteVerification !== 'EXTERNAL_VERIFIER_ATTESTED') { out(quote.sourceSha256, quote.page, 'NOT_ATTESTED'); continue; }
    if (!quote.sectionId.startsWith('M') || !PAGEINDEX_ELIGIBLE_SECTIONS.includes(quote.sectionId)) { out(quote.sourceSha256, quote.page, 'NOT_MARKET_SECTION'); continue; }
    if (typeof quote.quote !== 'string' || !quote.quote.trim()) { out(quote.sourceSha256, quote.page, 'EMPTY_QUOTE'); continue; }
    if (words(quote.quote) > PDF_EXCERPT_MAX_WORDS) { out(quote.sourceSha256, quote.page, 'OVER_30_WORDS'); continue; }
    if ((perDocument.get(quote.sourceSha256) ?? 0) >= PDF_EXCERPT_MAX_PER_DOCUMENT) { out(quote.sourceSha256, quote.page, 'OVER_3_PER_DOCUMENT'); continue; }
    const title = pdfDocumentTitle(documents.get(quote.sourceSha256));
    // The order number is taken only once an excerpt of the document is shown, so the shown numbers have no gaps.
    const ordinal = untitled.get(quote.sourceSha256) ?? untitled.size + 1;
    let citation: CitationInput;
    try { citation = toCitationInput(quote, title ?? pdfUntitledName(ordinal), ordinal); } catch { out(quote.sourceSha256, quote.page, 'NOT_READER_SAFE'); continue; }
    if (!readerSafe(quote.quote, citation)) { out(quote.sourceSha256, quote.page, 'NOT_READER_SAFE'); continue; }
    if (title === null) untitled.set(quote.sourceSha256, ordinal);
    perDocument.set(quote.sourceSha256, (perDocument.get(quote.sourceSha256) ?? 0) + 1);
    excerpts.push({ sourceSha256: quote.sourceSha256, page: quote.page, text: quote.quote, label: citation.label });
  }
  return { excerpts, leftOut };
}

/** Distinct documents in stored order: the S25 registry bindings. */
export const pdfExcerptDocuments = (excerpts: readonly PdfExcerpt[]): string[] => [...new Set(excerpts.map(excerpt => excerpt.sourceSha256))];

/**
 * The block, shared by both Market renderers. `mark` adds a citation number after an excerpt. The excerpt, its label and its fixed
 * metadata sit inside one `data-quote` blockquote, so they are copied source text and never read as the report's own statements.
 */
export function pdfExcerptBlockHtml(excerpts: readonly PdfExcerpt[], esc: (value: string) => string, mark: (excerpt: PdfExcerpt) => string = () => ''): string {
  // Saved packets may predate the current name table; withhold each copied item before its citation can throw.
  const shown = excerpts.filter(excerpt => !providerNamed(excerpt.text) && !hasHiddenName(excerpt.text, 'CITATION'));
  if (shown.length === 0) return '';
  return `<h3>${esc(PDF_EXCERPT_TITLE)}</h3><ul class="pdf-excerpts">${readerPdfExcerpts(shown).map(excerpt =>
    `<li><blockquote data-quote><p>${esc(excerpt.text)}</p><footer>${esc(excerpt.label)}; nhà xuất bản: ${PDF_EXCERPT_UNRECORDED}; năm: ${PDF_EXCERPT_UNRECORDED}; độ tin cậy: ${PDF_EXCERPT_UNRATED}.</footer></blockquote>${mark(excerpt)}</li>`).join('')}</ul>`;
}

/** The excerpts stored with a verified Market draft; only a draft whose packet carries the marker has any. */
export function storedPdfExcerpts(semantic: Readonly<Record<string, unknown>>): readonly PdfExcerpt[] {
  const marked = (semantic.sourceEvidence as { pdfExcerpts?: unknown } | undefined)?.pdfExcerpts === true;
  return marked && Array.isArray(semantic.pdfExcerpts) ? semantic.pdfExcerpts as PdfExcerpt[] : [];
}
