import { deflateSync } from 'node:zlib';

/** Lossless, image-only PDF of the already captured page. No browser, provider or model call. */
export function screenPdf(image) {
  const { width, height, channels, pixels } = image;
  const pageWidth = 595.28, pageHeight = 841.89;
  const rowsPerPage = Math.max(1, Math.floor(width * pageHeight / pageWidth));
  const count = Math.ceil(height / rowsPerPage);
  const objects = [null, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), null];
  const pageIds = [];
  const stream = (dictionary, data) => Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream'),
  ]);
  for (let i = 0; i < count; i++) {
    const start = i * rowsPerPage, rows = Math.min(rowsPerPage, height - start);
    const rgb = Buffer.alloc(width * rows * 3);
    for (let p = 0; p < width * rows; p++) {
      const from = (start * width + p) * channels, alpha = channels === 4 ? pixels[from + 3] / 255 : 1;
      for (let c = 0; c < 3; c++) rgb[p * 3 + c] = Math.round(pixels[from + c] * alpha + 255 * (1 - alpha));
    }
    const pageId = objects.length, contentId = pageId + 1, imageId = pageId + 2;
    pageIds.push(pageId);
    const drawnHeight = rows * pageWidth / width;
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    objects.push(stream('', Buffer.from(`q ${pageWidth} 0 0 ${drawnHeight} 0 ${pageHeight - drawnHeight} cm /Im Do Q`)));
    objects.push(stream(`/Type /XObject /Subtype /Image /Width ${width} /Height ${rows} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, deflateSync(rgb)));
  }
  objects[2] = Buffer.from(`<< /Type /Pages /Count ${count} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`);
  const parts = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')], offsets = [0];
  let length = parts[0].length;
  for (let id = 1; id < objects.length; id++) {
    offsets.push(length);
    const object = Buffer.concat([Buffer.from(`${id} 0 obj\n`), objects[id], Buffer.from('\nendobj\n')]);
    parts.push(object); length += object.length;
  }
  parts.push(Buffer.from(`xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return { bytes: Buffer.concat(parts), pageCount: count };
}
