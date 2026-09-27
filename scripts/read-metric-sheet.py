"""Read only the bounded flat Metric Sheet1 profile; stdin XLSX -> typed JSON.

No spreadsheet evaluation, filesystem extraction, network, or third-party modules.
Numbers retain their OOXML lexical representation, never binary floating point.
This is not a general workbook reader: unsupported structures fail closed.
"""
import io
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
P = '{http://schemas.openxmlformats.org/package/2006/relationships}'
LIMIT = 32 * 1024 * 1024


class Rejected(Exception):
    def __init__(self, locator, code):
        self.locator, self.code = locator, code


def reject(locator, code):
    raise Rejected(locator, code)


def read_workbook(data):
    if len(data) > LIMIT:
        reject('workbook', 'WORKBOOK_SIZE_LIMIT')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        members = z.infolist()
        names = [m.filename for m in members]
        if (len(names) > 1000 or len(set(names)) != len(names)
                or sum(m.file_size for m in members) > 64 * 1024 * 1024
                or any(m.flag_bits & 1 for m in members)):
            reject('workbook', 'ZIP_STRUCTURE_OR_SIZE')
        if any(n.startswith(('xl/externalLinks/', 'xl/embeddings/')) or n.endswith('vbaProject.bin') for n in names):
            reject('workbook', 'ACTIVE_OR_EXTERNAL_CONTENT')

        def xml(name):
            if name not in names:
                reject(name, 'MISSING_XML_PART')
            raw = z.read(name)
            # This profile admits UTF-8 OOXML only; no DTD/entity declarations.
            if b'\x00' in raw or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
                reject(name, 'UNSUPPORTED_XML')
            return ET.fromstring(raw.decode('utf-8-sig', errors='strict'))

        workbook = xml('xl/workbook.xml')
        sheets = workbook.findall(S + 'sheets/' + S + 'sheet')
        if len(sheets) != 1 or sheets[0].get('name') != 'Sheet1' or sheets[0].get('state', 'visible') != 'visible':
            reject('workbook', 'SHEET_PROFILE_MISMATCH')
        relations = xml('xl/_rels/workbook.xml.rels').findall(P + 'Relationship')
        matched = [r for r in relations if r.get('Id') == sheets[0].get(R + 'id')]
        if len(matched) != 1 or matched[0].get('TargetMode', 'Internal') != 'Internal' or not matched[0].get('Type', '').endswith('/worksheet'):
            reject('workbook', 'SHEET_RELATIONSHIP')
        target = matched[0].get('Target', '')
        target = posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/' + target)
        if not target.startswith('xl/worksheets/') or '\\' in target:
            reject('workbook', 'SHEET_TARGET')
        shared = []
        if 'xl/sharedStrings.xml' in names:
            for si in xml('xl/sharedStrings.xml').findall(S + 'si'):
                if si.find(S + 'rPh') is not None:
                    reject('sharedStrings', 'UNSUPPORTED_PHONETIC_STRING')
                text = ''.join(t.text or '' for t in si.iter(S + 't'))
                if len(text) > 10000:
                    reject('sharedStrings', 'CELL_TEXT_LIMIT')
                shared.append(text)
        formats = ['0']
        if 'xl/styles.xml' in names:
            styles = xml('xl/styles.xml')
            formats = [xf.get('numFmtId', '0') for xf in styles.findall(S + 'cellXfs/' + S + 'xf')]
            if not formats:
                reject('styles', 'MISSING_CELL_FORMATS')
        sheet = xml(target)
        if len(sheet.findall(S + 'sheetData')) != 1:
            reject('Sheet1', 'SHEET_DATA_COUNT')
        if any(sheet.find(S + tag) is not None for tag in ('mergeCells', 'autoFilter', 'tableParts')):
            reject('Sheet1', 'NON_FLAT_SHEET')
        if any(c.get('hidden', '0') not in ('0', 'false') for c in sheet.findall(S + 'cols/' + S + 'col')):
            reject('Sheet1', 'HIDDEN_COLUMN')
        rows = []
        last = 0
        for row in sheet.findall(S + 'sheetData/' + S + 'row'):
            r = row.get('r', '')
            if not re.fullmatch('[1-9][0-9]{0,4}', r) or int(r) > 10001 or int(r) <= last:
                reject('Sheet1', 'ROW_ORDER_OR_LIMIT')
            last = int(r)
            if row.get('hidden', '0') not in ('0', 'false'):
                reject('Sheet1!' + r, 'HIDDEN_ROW')
            cells = [{'type': 'blank', 'value': None, 'style': None, 'rawType': None, 'rawValue': None, 'numberFormatId': '0'} for _ in range(20)]
            seen = set()
            for cell in row.findall(S + 'c'):
                ref = cell.get('r', '')
                match = re.fullmatch('([A-T])' + r, ref)
                if not match or ref in seen:
                    reject('Sheet1!' + ref, 'CELL_OUTSIDE_PROFILE_OR_DUPLICATE')
                seen.add(ref)
                if cell.find(S + 'f') is not None:
                    reject('Sheet1!' + ref, 'FORMULA_NOT_ALLOWED')
                typ = cell.get('t', 'n')
                vals = cell.findall(S + 'v')
                if len(vals) > 1:
                    reject('Sheet1!' + ref, 'DUPLICATE_VALUE')
                value = vals[0].text if vals else None
                raw_value, raw_type = value, cell.get('t')
                style = cell.get('s', '0')
                if not re.fullmatch('[0-9]{1,6}', style) or int(style) >= len(formats):
                    reject('Sheet1!' + ref, 'INVALID_CELL_STYLE')
                if typ == 's':
                    if value is None or not re.fullmatch('[0-9]{1,8}', value) or int(value) >= len(shared):
                        reject('Sheet1!' + ref, 'SHARED_STRING_INDEX')
                    value, typ = shared[int(value)], 'text'
                elif typ == 'inlineStr':
                    if vals or cell.find(S + 'is/' + S + 'rPh') is not None:
                        reject('Sheet1!' + ref, 'AMBIGUOUS_INLINE_STRING')
                    value, typ = ''.join(t.text or '' for t in cell.findall(S + 'is/' + S + 't')), 'text'
                    rich = cell.findall(S + 'is/' + S + 'r/' + S + 't')
                    if rich:
                        value = ''.join(t.text or '' for t in rich)
                elif typ == 'n':
                    typ = 'number' if value is not None else 'blank'
                elif typ in ('b', 'e', 'str', 'd'):
                    # Never mistake bool/error/date/cached-formula-string for numeric.
                    typ = {'b': 'boolean', 'e': 'error', 'str': 'cached', 'd': 'date'}[typ]
                else:
                    reject('Sheet1!' + ref, 'UNSUPPORTED_CELL_TYPE')
                if value is not None and len(value) > 10000:
                    reject('Sheet1!' + ref, 'CELL_TEXT_LIMIT')
                if value is not None and re.search('_x[0-9A-Fa-f]{4}_', value):
                    reject('Sheet1!' + ref, 'UNSUPPORTED_ESCAPED_STRING')
                cells[ord(match[1]) - ord('A')] = {'type': typ, 'value': value, 'style': cell.get('s'),
                                                 'rawType': raw_type, 'rawValue': raw_value, 'numberFormatId': formats[int(style)]}
            rows.append({'row': int(r), 'cells': cells})
        return {'rows': rows}


try:
    result = read_workbook(sys.stdin.buffer.read(LIMIT + 1))
    print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
except Rejected as error:
    print(json.dumps({'locator': error.locator, 'code': error.code}), file=sys.stderr)
    sys.exit(1)
except Exception:
    print(json.dumps({'locator': 'workbook', 'code': 'INVALID_XLSX'}), file=sys.stderr)
    sys.exit(1)
