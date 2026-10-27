// Number evidence of one v3 window capture (owner F286/F287): screenshots of our own tab only.
// Never clicks, exports, downloads or changes settings; it only reads layout and takes screenshots.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
require('ajv-formats')(ajv);
const validateEvidence = ajv.compile(
  JSON.parse(readFileSync(new URL('../../../../contracts/analysis/metric-v3-evidence.schema.json', import.meta.url), 'utf8')),
);

export const V3_EVIDENCE_VERSION = 'metric-v3-evidence-v1';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
/** The adapter that captured the window: its window contract and the exact capture source bytes. */
export const V3_ADAPTER_VERSION = Object.freeze({
  contract: 'metric-v3-window-capture-v2',
  sourceSha256: digest(readFileSync(new URL('./v3-capture.js', import.meta.url))),
});

/**
 * Stable section keys of the source page, named as the report reader sees them. A section is found
 * by its `.statistic-item` title, else by a selector (the same regions metric.js already reads).
 */
export const V3_EVIDENCE_SECTIONS = Object.freeze({
  'search-settings': { name: 'Cài đặt tìm kiếm và kỳ đo', title: null, selector: '#QuerySearchBuilder' },
  kpi: { name: 'Chỉ số chính', title: 'Market Overview|Tổng quan thị trường', selector: '.market-overview-section, .market-overview' },
  'platform-share': { name: 'Doanh số theo sàn', title: null, selector: '.platforms-chart, .platforms-table, .main-statistic' },
  'trend-chart': { name: 'Doanh số theo tuần, theo tháng', title: null, selector: '#growth-detail-chart' },
  'shop-types': { name: 'Shop Mall và shop thường', title: '^(Shop type|Loại shop|Loại gian hàng)$', selector: null },
  'price-bands': { name: 'Doanh số theo dải giá', title: '^(Price range|Khoảng giá|Phân khúc giá)$', selector: null },
  'top-brands': { name: 'Top thương hiệu', title: '^(Top Brands|Top thương hiệu)$', selector: '.brand-list-container, .BrandTable' },
  'top-shops': { name: 'Top shop', title: '^(Top Shops|Top shop|Top gian hàng)$', selector: '.shop-list-container, .ShopTable' },
  'top-products': { name: 'Sản phẩm bán chạy nhất', title: '^(Top Products|Top sản phẩm)$', selector: '.products-list-container, .ProductTable' },
});

/** Runs in the owned tab. Page coordinates of each section and the page size; read only. */
export function locateV3EvidenceSections({ sections }) {
  if (location.protocol !== 'https:' || !['metric.vn', 'www.metric.vn'].includes(location.hostname))
    return { stop: 'CAPTURE_ORIGIN_CHANGED' };
  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = (e) => {
    const r = e?.getBoundingClientRect();
    return Boolean(r && r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
  };
  const items = [...document.querySelectorAll('.statistic-item')];
  const found = {};
  for (const { key, title, selector } of sections) {
    const titled = title ? items.find((e) => visible(e) && new RegExp(title, 'i').test(txt(e.querySelector('.statistic-item__title')))) : null;
    const element = titled || (selector ? [...document.querySelectorAll(selector)].find(visible) : null);
    if (!element) { found[key] = { reason: 'SECTION_NOT_FOUND' }; continue; }
    const r = element.getBoundingClientRect();
    found[key] = { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
  }
  const root = document.documentElement;
  return { page: { width: Math.max(root.scrollWidth, document.body.scrollWidth), height: Math.max(root.scrollHeight, document.body.scrollHeight) }, sections: found };
}

/** Runs in the owned tab. Hides account details only; the page and its logo stay as the source shows them. */
export function maskV3EvidenceAccount() {
  let maskedCount = 0;
  for (const element of document.querySelectorAll('body *')) {
    const marker = `${element.id || ''} ${typeof element.className === 'string' ? element.className : ''}`;
    if (!/(?:account|avatar|profile|nickname|user[-_ ]?(?:info|widget|menu|name)|logout|sign[-_ ]?out)/i.test(marker)) continue;
    element.setAttribute('data-tdn-evidence-hidden', '1');
    element.setAttribute('data-tdn-evidence-prev-visibility', element.style.visibility || '');
    element.style.visibility = 'hidden';
    maskedCount += 1;
  }
  return { maskedCount };
}

export function restoreV3EvidenceAccount() {
  for (const element of document.querySelectorAll('[data-tdn-evidence-hidden="1"]')) {
    element.style.visibility = element.getAttribute('data-tdn-evidence-prev-visibility') || '';
    element.removeAttribute('data-tdn-evidence-hidden');
    element.removeAttribute('data-tdn-evidence-prev-visibility');
  }
  return { ok: true };
}

// --- PNG crop: 8-bit RGB/RGBA, non-interlaced (what the browser screenshot writes); no image dependency ---

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PIXELS = 80_000_000;
const pngError = (code) => Object.assign(new Error(code), { code });

export function decodeV3Png(png) {
  if (!Buffer.isBuffer(png) || png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw pngError('EVIDENCE_PNG_INVALID');
  let header = null;
  const data = [];
  for (let at = 8; at + 12 <= png.length;) {
    const length = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8);
    if (at + 12 + length > png.length) throw pngError('EVIDENCE_PNG_INVALID');
    const chunk = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = { width: chunk.readUInt32BE(0), height: chunk.readUInt32BE(4), depth: chunk[8], colour: chunk[9], interlace: chunk[12] };
    else if (type === 'IDAT') data.push(chunk);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  if (!header || !data.length) throw pngError('EVIDENCE_PNG_INVALID');
  const { width, height, depth, colour, interlace } = header;
  if (depth !== 8 || ![2, 6].includes(colour) || interlace !== 0) throw pngError('EVIDENCE_PNG_UNSUPPORTED');
  if (!width || !height || width * height > MAX_PIXELS) throw pngError('EVIDENCE_PNG_UNSUPPORTED');
  const channels = colour === 6 ? 4 : 3, stride = width * channels;
  const raw = inflateSync(Buffer.concat(data), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw pngError('EVIDENCE_PNG_INVALID');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride), prev = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0, b = prev ? prev[i] : 0, c = prev && i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw pngError('EVIDENCE_PNG_INVALID');
      out[i] = value & 255;
    }
  }
  return { width, height, colour, channels, pixels };
}

export function encodeV3Png({ width, height, colour, channels, pixels }) {
  const stride = width * channels, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, body) => {
    const head = Buffer.alloc(4), tail = Buffer.alloc(4), typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    head.writeUInt32BE(body.length);
    tail.writeUInt32BE(crc32(typed));
    return Buffer.concat([head, typed, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colour;
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Cuts a page rectangle (CSS pixels) out of a decoded full-page image; `scale` is image pixels per CSS pixel. */
export function cropV3Png(image, rect, scale) {
  const x0 = Math.max(0, Math.floor(rect.x * scale)), y0 = Math.max(0, Math.floor(rect.y * scale));
  const x1 = Math.min(image.width, Math.ceil((rect.x + rect.width) * scale)), y1 = Math.min(image.height, Math.ceil((rect.y + rect.height) * scale));
  if (!(x1 > x0 && y1 > y0)) throw pngError('EVIDENCE_SECTION_OUT_OF_BOUNDS');
  const width = x1 - x0, height = y1 - y0, stride = width * image.channels, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * image.width + x0) * image.channels;
    image.pixels.copy(pixels, y * stride, from, from + stride);
  }
  return encodeV3Png({ width, height, colour: image.colour, channels: image.channels, pixels });
}

/**
 * Writes `<windowDir>/evidence/`: manifest.json, raw-responses.json (copy of the captured bytes),
 * full-page.png and sections/<key>.png. Evidence never fails the capture: any failure is recorded
 * in the manifest as an explicit code. Only an abort or the capture deadline is rethrown.
 * `images: false` (request capture) records the settings and the raw copy without screenshots.
 */
export async function writeV3EvidencePackage(page, { windowDir, manifest, rawBytes, images = true }) {
  const dir = join(windowDir, 'evidence');
  await mkdir(join(dir, 'sections'), { recursive: true, mode: 0o700 });
  const write = async (path, body) => {
    await writeFile(join(dir, path), body, { flag: 'wx', mode: 0o600 });
    return { path, sha256: digest(body), byteSize: body.length };
  };
  const state = manifest.appliedState;
  const evidence = {
    contractVersion: V3_EVIDENCE_VERSION,
    captureId: manifest.captureId,
    capturedAt: manifest.capturedAt,
    windowId: manifest.window.id,
    period: manifest.window.period,
    keywords: state.keywords,
    category: state.category,
    platforms: state.platforms,
    smartQuery: state.smartQuery,
    captureMethod: manifest.captureMethod ?? 'ui',
    adapterVersion: V3_ADAPTER_VERSION,
    rawResponses: await write('raw-responses.json', Buffer.from(rawBytes)),
    fullPage: null,
    sections: [],
    missingSections: [],
    maskedCount: 0,
    status: 'NO_IMAGES',
  };
  const keys = Object.keys(V3_EVIDENCE_SECTIONS);
  if (!images || typeof page.screenshot !== 'function') {
    evidence.code = images ? 'EVIDENCE_SCREENSHOT_UNAVAILABLE' : 'EVIDENCE_REQUEST_CAPTURE';
    evidence.missingSections = keys.map((sectionKey) => ({ sectionKey, reason: evidence.code }));
  } else {
    try {
      let located, masked = false;
      try {
        masked = true;
        evidence.maskedCount = Number((await page.evaluate(maskV3EvidenceAccount))?.maskedCount) || 0;
        located = await page.evaluate(locateV3EvidenceSections, {
          sections: keys.map((key) => ({ key, title: V3_EVIDENCE_SECTIONS[key].title, selector: V3_EVIDENCE_SECTIONS[key].selector })),
        });
        if (located?.stop) throw pngError(located.stop);
        await page.screenshot({ path: join(dir, 'full-page.png'), fullPage: true });
      } finally {
        if (masked) await page.evaluate(restoreV3EvidenceAccount).catch(() => {});
      }
      const full = await readFile(join(dir, 'full-page.png'));
      const image = decodeV3Png(full);
      evidence.fullPage = { path: 'full-page.png', sha256: digest(full), byteSize: full.length, width: image.width, height: image.height };
      const scale = image.width / (Number(located?.page?.width) || image.width);
      for (const sectionKey of keys) {
        const rect = located?.sections?.[sectionKey];
        if (!rect || rect.reason || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
          evidence.missingSections.push({ sectionKey, reason: rect?.reason ?? 'SECTION_NOT_FOUND' });
          continue;
        }
        try {
          const file = await write(`sections/${sectionKey}.png`, cropV3Png(image, rect, scale));
          evidence.sections.push({ sectionKey, sectionName: V3_EVIDENCE_SECTIONS[sectionKey].name, ...file });
        } catch (error) {
          evidence.missingSections.push({ sectionKey, reason: /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'EVIDENCE_CROP_FAILED' });
        }
      }
      evidence.status = evidence.missingSections.length ? 'PARTIAL' : 'COMPLETE';
    } catch (error) {
      if (error?.name === 'AbortError' || error?.message === 'TIMEOUT') throw error;
      evidence.code = /^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'EVIDENCE_SCREENSHOT_FAILED';
      const taken = new Set(evidence.sections.map((s) => s.sectionKey));
      evidence.missingSections = keys.filter((key) => !taken.has(key)).map((sectionKey) => ({ sectionKey, reason: evidence.code }));
      evidence.status = evidence.fullPage ? 'PARTIAL' : 'NO_IMAGES';
    }
  }
  if (!validateEvidence(evidence)) {
    // A manifest that does not validate is replaced by an explicit failure record, never dropped.
    const failed = { contractVersion: V3_EVIDENCE_VERSION, captureId: manifest.captureId, capturedAt: manifest.capturedAt,
      windowId: manifest.window.id, status: 'FAILED', code: 'EVIDENCE_MANIFEST_INVALID' };
    await writeFile(join(dir, 'manifest.json'), bytes(failed), { flag: 'wx', mode: 0o600 });
    return failed;
  }
  await writeFile(join(dir, 'manifest.json'), bytes(evidence), { flag: 'wx', mode: 0o600 });
  return evidence;
}
