"""Read the top of every sheet of an official-statistics workbook; stdin XLSX -> JSON cells.

Stdlib only. No spreadsheet evaluation, no filesystem extraction, no network.
Text cells keep their exact string; number cells keep their stored OOXML lexeme
(the cached value), never a binary float. A formula without a cached value is
left out (missing), never computed. The caller locates tables by title and
header text; this reader never decides what a sheet means.

Output: {"sheets":[{"name":str,"state":str,"cells":[[ref,type,text,decimals]]}]}
  type: "t" text, "n" number, "o" anything else (boolean, error, date, overlong text)
  decimals: the number of decimals of a plain cell format ("0", "0.0", "#,##0.00"), else null
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
LIMIT = 20 * 1024 * 1024
MAX_MEMBERS = 2000
MAX_UNPACKED = 160 * 1024 * 1024
MAX_PART = 48 * 1024 * 1024
MAX_SHEETS = 80
MAX_ROW = 200
MAX_TEXT = 2000
REF = re.compile(r'([A-Z]{1,3})([1-9][0-9]{0,6})')
BUILTIN_DECIMALS = {'1': 0, '2': 2, '3': 0, '4': 2}
PLAIN_FORMAT = re.compile(r'(?:#,##)?0(?:\.(0{1,10}))?')


class Rejected(Exception):
    def __init__(self, locator, code):
        super().__init__(code)
        self.locator, self.code = locator, code


def text_of(container):
    """Plain text or rich runs; phonetic hints (rPh) are not part of the text."""
    parts = [t.text or '' for t in container.findall(S + 't')]
    for run in container.findall(S + 'r'):
        parts.extend(t.text or '' for t in run.findall(S + 't'))
    return ''.join(parts)


def column_number(letters):
    value = 0
    for ch in letters:
        value = value * 26 + (ord(ch) - 64)
    return value


def read_workbook(data):
    if len(data) == 0 or len(data) > LIMIT:
        raise Rejected('workbook', 'WORKBOOK_SIZE_LIMIT')
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        members = z.infolist()
        names = [m.filename for m in members]
        if (len(names) > MAX_MEMBERS or len(set(names)) != len(names)
                or sum(m.file_size for m in members) > MAX_UNPACKED
                or any(m.file_size > MAX_PART for m in members)
                or any(m.flag_bits & 1 for m in members)):
            raise Rejected('workbook', 'ZIP_STRUCTURE_OR_SIZE')

        def xml(name):
            if name not in names:
                raise Rejected(name, 'MISSING_XML_PART')
            raw = z.read(name)
            upper = raw.upper()
            if b'\x00' in raw or b'<!DOCTYPE' in upper or b'<!ENTITY' in upper:
                raise Rejected(name, 'UNSUPPORTED_XML')
            return ET.fromstring(raw.decode('utf-8-sig', errors='strict'))

        workbook = xml('xl/workbook.xml')
        sheets = workbook.findall(S + 'sheets/' + S + 'sheet')
        if not sheets or len(sheets) > MAX_SHEETS:
            raise Rejected('workbook', 'SHEET_COUNT')
        relations = {}
        for rel in xml('xl/_rels/workbook.xml.rels').findall(P + 'Relationship'):
            relations[rel.get('Id')] = rel
        shared = []
        if 'xl/sharedStrings.xml' in names:
            shared = [text_of(si) for si in xml('xl/sharedStrings.xml').findall(S + 'si')]
        decimals_by_style = [None]
        if 'xl/styles.xml' in names:
            styles = xml('xl/styles.xml')
            custom = {}
            for fmt in styles.findall(S + 'numFmts/' + S + 'numFmt'):
                match = PLAIN_FORMAT.fullmatch(fmt.get('formatCode', ''))
                custom[fmt.get('numFmtId')] = (len(match.group(1) or '') if match else None)
            decimals_by_style = []
            for xf in styles.findall(S + 'cellXfs/' + S + 'xf'):
                fid = xf.get('numFmtId', '0')
                decimals_by_style.append(custom[fid] if fid in custom else BUILTIN_DECIMALS.get(fid))
            if not decimals_by_style:
                decimals_by_style = [None]
        out = []
        for sheet in sheets:
            name = sheet.get('name', '')
            rel = relations.get(sheet.get(R + 'id'))
            if rel is None or rel.get('TargetMode', 'Internal') != 'Internal' or not rel.get('Type', '').endswith('/worksheet'):
                continue  # chart sheets and macro sheets carry no table
            target = rel.get('Target', '')
            target = posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/' + target)
            if not target.startswith('xl/worksheets/') or '\\' in target:
                raise Rejected(name, 'SHEET_TARGET')
            root = xml(target)
            cells = []
            for row in root.findall(S + 'sheetData/' + S + 'row'):
                r = row.get('r', '')
                if not re.fullmatch('[1-9][0-9]{0,6}', r) or int(r) > MAX_ROW:
                    continue
                for cell in row.findall(S + 'c'):
                    match = REF.fullmatch(cell.get('r', ''))
                    if not match or match.group(2) != r or column_number(match.group(1)) > 26:
                        continue
                    ref, typ = cell.get('r'), cell.get('t', 'n')
                    value_node = cell.find(S + 'v')
                    value = value_node.text if value_node is not None else None
                    style = cell.get('s', '0')
                    decimals = decimals_by_style[int(style)] if re.fullmatch('[0-9]{1,6}', style) and int(style) < len(decimals_by_style) else None
                    if typ == 's':
                        if value is None or not re.fullmatch('[0-9]{1,8}', value) or int(value) >= len(shared):
                            raise Rejected(name + '!' + ref, 'SHARED_STRING_INDEX')
                        kind, text = 't', shared[int(value)]
                    elif typ == 'inlineStr':
                        node = cell.find(S + 'is')
                        if node is None:
                            continue
                        kind, text = 't', text_of(node)
                    elif typ == 'str':
                        if value is None:
                            continue
                        kind, text = 't', value
                    elif typ == 'n':
                        if value is None:
                            continue  # blank cell, or a formula without a cached value
                        kind, text = 'n', value.strip()
                        if not re.fullmatch(r'-?[0-9]{1,30}(?:\.[0-9]{1,30})?(?:[Ee][+-]?[0-9]{1,3})?', text):
                            kind = 'o'
                    else:
                        kind, text = 'o', ''
                    if len(text) > MAX_TEXT:
                        kind, text = 'o', ''
                    cells.append([ref, kind, text, decimals if kind == 'n' else None])
            out.append({'name': name, 'state': sheet.get('state', 'visible'), 'cells': cells})
        return {'sheets': out}


try:
    result = read_workbook(sys.stdin.buffer.read(LIMIT + 1))
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
except Rejected as error:
    print(json.dumps({'locator': error.locator[:200], 'code': error.code}), file=sys.stderr)
    sys.exit(1)
except zipfile.BadZipFile:
    print(json.dumps({'locator': 'workbook', 'code': 'WORKBOOK_ARCHIVE_INVALID'}), file=sys.stderr)
    sys.exit(1)
except Exception:
    print(json.dumps({'locator': 'workbook', 'code': 'INVALID_XLSX'}), file=sys.stderr)
    sys.exit(1)
