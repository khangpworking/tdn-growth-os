"""Read exact PDF stdin locally, never Cloud OCR. Requires pypdf on the operator host.

With --title, print only the title stored in the PDF's own metadata ({"title": text or null}); the caller vets it before use.
"""
import io
import json
import sys

try:
    from pypdf import PdfReader
    raw = sys.stdin.buffer.read(32 * 1024 * 1024 + 1)
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError()
    reader = PdfReader(io.BytesIO(raw))
    if reader.is_encrypted or not 1 <= len(reader.pages) <= 1000:
        raise ValueError()
    if sys.argv[1:] == ['--title']:
        metadata = reader.metadata
        title = metadata.title if metadata is not None else None
        title = ' '.join(str(title).split())[:300] if isinstance(title, str) else ''
        output = json.dumps({'title': title or None}, ensure_ascii=False)
    else:
        pages = [{'page': i + 1, 'text': page.extract_text() or ''} for i, page in enumerate(reader.pages)]
        output = json.dumps(pages, ensure_ascii=False)
    if len(output.encode('utf-8')) > 2 * 1024 * 1024:
        raise ValueError()
    sys.stdout.buffer.write(output.encode('utf-8'))
except Exception:
    sys.stderr.write('LOCAL_PDF_EXTRACTION_FAILED\n')
    sys.exit(1)
