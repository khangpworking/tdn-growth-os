/**
 * JPEG structure and entropy-level validation for Content Studio reference images.
 *
 * With `decode`, every scan's Huffman-coded data is walked block by block (baseline and
 * progressive, including restart intervals and successive-approximation refinement), so a
 * JPEG is accepted only when all of its image data is present and well-formed. Pixels are
 * not reconstructed (no IDCT or colour conversion). Without `decode`, only the marker
 * structure is checked; that is used when re-reading bytes already validated at upload.
 */

export type JpegErrorCode = 'invalid' | 'unsupported_format' | 'trailing_data' | 'dimensions';

export class JpegError extends Error {
  constructor(readonly code: JpegErrorCode) { super(`JPEG rejected: ${code}`); }
}

const fail = (code: JpegErrorCode = 'invalid'): never => { throw new JpegError(code); };

interface Huffman { readonly maxcode: Int32Array; readonly valptr: Int32Array; readonly mincode: Int32Array; readonly values: Uint8Array }
interface Component {
  readonly id: number; readonly h: number; readonly v: number; readonly tq: number;
  readonly blocksPerLine: number; readonly blocksPerColumn: number; readonly stride: number; readonly rows: number;
  nonzero: Uint8Array | undefined;
  scanned: boolean;
  dcSeen: boolean;
}
interface Frame { readonly progressive: boolean; readonly width: number; readonly height: number; readonly components: Component[]; readonly mcusX: number; readonly mcusY: number }
interface Scan { readonly components: { readonly component: Component; readonly td: number; readonly ta: number }[]; readonly ss: number; readonly se: number; readonly ah: number; readonly al: number }

export function inspectJpeg(bytes: Buffer, options: { readonly decode: boolean; readonly checkDimensions: (width: number, height: number) => void }): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail();
  let offset = 2;
  let frame: Frame | undefined;
  let sawScan = false;
  let restartInterval = 0;
  const quant = new Set<number>();
  const dc: (Huffman | undefined)[] = [];
  const ac: (Huffman | undefined)[] = [];
  for (;;) {
    if (offset >= bytes.length || bytes[offset] !== 0xff) fail();
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) fail();
    const marker = bytes[offset]!; offset += 1;
    if (marker === 0xd9) {
      if (!frame || !sawScan) return fail();
      if (options.decode && frame.components.some((component) => (frame!.progressive ? !component.dcSeen : !component.scanned))) fail();
      if (bytes.subarray(offset).some((byte) => byte !== 0)) fail('trailing_data');
      return { width: frame.width, height: frame.height };
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8 || marker === 0x00) fail();
    if (offset + 2 > bytes.length) fail();
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) fail();
    const segment = bytes.subarray(offset + 2, end);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (marker !== 0xc0 && marker !== 0xc1 && marker !== 0xc2) fail('unsupported_format');
      if (frame) fail();
      frame = parseFrame(segment, marker === 0xc2, options.checkDimensions);
      offset = end;
    } else if (marker === 0xc4) {
      parseHuffman(segment, dc, ac);
      offset = end;
    } else if (marker === 0xdb) {
      parseQuantization(segment, quant);
      offset = end;
    } else if (marker === 0xdd) {
      if (segment.length !== 2) fail();
      restartInterval = segment.readUInt16BE(0);
      offset = end;
    } else if (marker === 0xda) {
      if (!frame) return fail();
      const scan = parseScan(segment, frame);
      sawScan = true;
      offset = options.decode ? decodeScan(bytes, end, frame, scan, dc, ac, quant, restartInterval) : skipEntropy(bytes, end);
    } else {
      offset = end;
    }
  }
}

function parseFrame(segment: Buffer, progressive: boolean, checkDimensions: (width: number, height: number) => void): Frame {
  if (segment.length < 6) fail();
  if (segment[0] !== 8) fail('unsupported_format');
  const height = segment.readUInt16BE(1); const width = segment.readUInt16BE(3); const count = segment[5]!;
  if (segment.length !== 6 + 3 * count) fail();
  if (count === 4) fail('unsupported_format');
  if (count !== 1 && count !== 3) fail();
  if (width === 0 || height === 0) fail();
  checkDimensions(width, height);
  const raw = Array.from({ length: count }, (_, index) => ({ id: segment[6 + index * 3]!, h: segment[7 + index * 3]! >> 4, v: segment[7 + index * 3]! & 15, tq: segment[8 + index * 3]! }));
  if (new Set(raw.map((component) => component.id)).size !== count || raw.some((component) => component.h < 1 || component.h > 4 || component.v < 1 || component.v > 4 || component.tq > 3)) fail();
  const hmax = Math.max(...raw.map((component) => component.h)); const vmax = Math.max(...raw.map((component) => component.v));
  const mcusX = Math.ceil(width / (8 * hmax)); const mcusY = Math.ceil(height / (8 * vmax));
  const components = raw.map((component) => ({
    ...component,
    blocksPerLine: Math.ceil(Math.ceil(width * component.h / hmax) / 8),
    blocksPerColumn: Math.ceil(Math.ceil(height * component.v / vmax) / 8),
    stride: mcusX * component.h, rows: mcusY * component.v,
    nonzero: undefined, scanned: false, dcSeen: false,
  }));
  return { progressive, width, height, components, mcusX, mcusY };
}

function parseHuffman(segment: Buffer, dc: (Huffman | undefined)[], ac: (Huffman | undefined)[]): void {
  let position = 0;
  if (segment.length === 0) fail();
  while (position < segment.length) {
    if (position + 17 > segment.length) fail();
    const tableClass = segment[position]! >> 4; const id = segment[position]! & 15;
    if (tableClass > 1 || id > 3) fail();
    const counts = segment.subarray(position + 1, position + 17);
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total === 0 || total > 256 || position + 17 + total > segment.length) fail();
    const maxcode = new Int32Array(18).fill(-1); const valptr = new Int32Array(17); const mincode = new Int32Array(17);
    let code = 0; let index = 0;
    for (let length = 1; length <= 16; length += 1) {
      const count = counts[length - 1]!;
      valptr[length] = index; mincode[length] = code;
      code += count; index += count;
      if (code > 2 ** length) fail();
      maxcode[length] = count > 0 ? code - 1 : -1;
      code <<= 1;
    }
    (tableClass === 0 ? dc : ac)[id] = { maxcode, valptr, mincode, values: segment.subarray(position + 17, position + 17 + total) };
    position += 17 + total;
  }
}

function parseQuantization(segment: Buffer, quant: Set<number>): void {
  let position = 0;
  if (segment.length === 0) fail();
  while (position < segment.length) {
    const precision = segment[position]! >> 4; const id = segment[position]! & 15;
    if (precision > 1 || id > 3) fail();
    position += 1 + (precision === 0 ? 64 : 128);
    if (position > segment.length) fail();
    quant.add(id);
  }
}

function parseScan(segment: Buffer, frame: Frame): Scan {
  const count = segment[0] ?? 0;
  if (count < 1 || count > 4 || segment.length !== 4 + 2 * count) fail();
  const components: Scan['components'][number][] = [];
  let lastIndex = -1;
  for (let index = 0; index < count; index += 1) {
    const frameIndex = frame.components.findIndex((component) => component.id === segment[1 + index * 2]);
    if (frameIndex <= lastIndex) fail();
    lastIndex = frameIndex;
    const tables = segment[2 + index * 2]!;
    if (tables >> 4 > 3 || (tables & 15) > 3) fail();
    components.push({ component: frame.components[frameIndex]!, td: tables >> 4, ta: tables & 15 });
  }
  const ss = segment[1 + 2 * count]!; const se = segment[2 + 2 * count]!; const ah = segment[3 + 2 * count]! >> 4; const al = segment[3 + 2 * count]! & 15;
  if (!frame.progressive) {
    if (ss !== 0 || se !== 63 || ah !== 0 || al !== 0) fail();
  } else if (ss === 0 ? se !== 0 : ss > se || se > 63 || count !== 1) {
    fail();
  }
  if (ah > 13 || al > 13) fail();
  if (count > 1 && components.reduce((sum, entry) => sum + entry.component.h * entry.component.v, 0) > 10) fail();
  return { components, ss, se, ah, al };
}

/** Moves past entropy-coded data to the next non-restart marker. */
function skipEntropy(bytes: Buffer, start: number): number {
  let offset = start;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const next = bytes[offset + 1];
    if (next === undefined) return fail();
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
    if (next === 0xff) { offset += 1; continue; }
    return offset;
  }
  return fail();
}

class BitReader {
  #current = 0;
  #count = 0;
  constructor(private readonly bytes: Buffer, public position: number) {}

  bit(): number {
    if (this.#count === 0) {
      const byte = this.bytes[this.position];
      if (byte === undefined) return fail();
      if (byte === 0xff) {
        if (this.bytes[this.position + 1] !== 0x00) return fail();
        this.position += 2;
      } else {
        this.position += 1;
      }
      this.#current = byte; this.#count = 8;
    }
    this.#count -= 1;
    return (this.#current >> this.#count) & 1;
  }

  bits(count: number): number {
    let value = 0;
    for (let index = 0; index < count; index += 1) value = (value << 1) | this.bit();
    return value;
  }

  decode(table: Huffman): number {
    let code = 0;
    for (let length = 1; length <= 16; length += 1) {
      code = (code << 1) | this.bit();
      if (code <= table.maxcode[length]!) return table.values[table.valptr[length]! + code - table.mincode[length]!]!;
    }
    return fail();
  }

  restart(expected: number): void {
    this.#count = 0;
    while (this.bytes[this.position] === 0xff && this.bytes[this.position + 1] === 0xff) this.position += 1;
    if (this.bytes[this.position] !== 0xff || this.bytes[this.position + 1] !== 0xd0 + expected) fail();
    this.position += 2;
  }
}

function decodeScan(bytes: Buffer, start: number, frame: Frame, scan: Scan, dc: (Huffman | undefined)[], ac: (Huffman | undefined)[], quant: Set<number>, restartInterval: number): number {
  const dcFirst = scan.ss === 0 && scan.ah === 0;
  const needsDc = !frame.progressive || dcFirst;
  const needsAc = !frame.progressive || scan.ss > 0;
  for (const { component, td, ta } of scan.components) {
    if (!quant.has(component.tq) || (needsDc && !dc[td]) || (needsAc && !ac[ta])) fail();
    if (frame.progressive && scan.ss > 0 && !component.dcSeen) fail();
    if (frame.progressive && scan.ss > 0 && !component.nonzero) component.nonzero = new Uint8Array(component.stride * component.rows * 8);
  }
  const reader = new BitReader(bytes, start);
  let eobrun = 0;

  const decodeBlock = (entry: Scan['components'][number], blockIndex: number): void => {
    if (!frame.progressive) {
      const size = reader.decode(dc[entry.td]!);
      if (size > 11) fail();
      reader.bits(size);
      for (let k = 1; k < 64;) {
        const symbol = reader.decode(ac[entry.ta]!);
        const run = symbol >> 4; const size2 = symbol & 15;
        if (size2 === 0) { if (run !== 15) break; k += 16; if (k > 64) fail(); continue; }
        k += run;
        if (size2 > 10 || k > 63) fail();
        reader.bits(size2); k += 1;
      }
      return;
    }
    if (scan.ss === 0) {
      if (scan.ah === 0) { const size = reader.decode(dc[entry.td]!); if (size > 11) fail(); reader.bits(size); }
      else reader.bit();
      return;
    }
    const nonzero = entry.component.nonzero!;
    const base = blockIndex * 64;
    const isNonzero = (k: number) => (nonzero[(base + k) >> 3]! >> ((base + k) & 7)) & 1;
    const setNonzero = (k: number) => { nonzero[(base + k) >> 3]! |= 1 << ((base + k) & 7); };
    const table = ac[entry.ta]!;
    if (scan.ah === 0) {
      if (eobrun > 0) { eobrun -= 1; return; }
      for (let k = scan.ss; k <= scan.se;) {
        const symbol = reader.decode(table);
        const run = symbol >> 4; const size = symbol & 15;
        if (size === 0) {
          if (run < 15) { eobrun = (1 << run) - 1; if (run > 0) eobrun += reader.bits(run); break; }
          k += 16; continue;
        }
        k += run;
        if (size > 10 || k > scan.se) fail();
        reader.bits(size); setNonzero(k); k += 1;
      }
      return;
    }
    let k = scan.ss;
    if (eobrun === 0) {
      for (; k <= scan.se; k += 1) {
        const symbol = reader.decode(table);
        let run = symbol >> 4; const size = symbol & 15;
        if (size !== 0) {
          if (size !== 1) fail();
          reader.bit();
        } else if (run !== 15) {
          eobrun = 1 << run;
          if (run > 0) eobrun += reader.bits(run);
          break;
        }
        do {
          if (isNonzero(k)) reader.bit();
          else { run -= 1; if (run < 0) break; }
          k += 1;
        } while (k <= scan.se);
        if (size !== 0) { if (k > scan.se) fail(); setNonzero(k); }
      }
    }
    if (eobrun > 0) {
      for (; k <= scan.se; k += 1) if (isNonzero(k)) reader.bit();
      eobrun -= 1;
    }
  };

  const single = scan.components.length === 1 ? scan.components[0]! : undefined;
  const units = single ? single.component.blocksPerLine * single.component.blocksPerColumn : frame.mcusX * frame.mcusY;
  for (let unit = 0; unit < units; unit += 1) {
    if (restartInterval > 0 && unit > 0 && unit % restartInterval === 0) {
      reader.restart((unit / restartInterval - 1) % 8);
      eobrun = 0;
    }
    if (single) {
      const row = Math.floor(unit / single.component.blocksPerLine); const column = unit % single.component.blocksPerLine;
      decodeBlock(single, row * single.component.stride + column);
    } else {
      const mcuRow = Math.floor(unit / frame.mcusX); const mcuColumn = unit % frame.mcusX;
      for (const entry of scan.components) {
        for (let v = 0; v < entry.component.v; v += 1) {
          for (let h = 0; h < entry.component.h; h += 1) {
            decodeBlock(entry, (mcuRow * entry.component.v + v) * entry.component.stride + mcuColumn * entry.component.h + h);
          }
        }
      }
    }
  }
  for (const { component } of scan.components) {
    component.scanned = true;
    if (scan.ss === 0 && scan.ah === 0) component.dcSeen = true;
  }
  return skipEntropy(bytes, reader.position);
}
