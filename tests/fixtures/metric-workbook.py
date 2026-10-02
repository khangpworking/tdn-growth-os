"""Synthetic OOXML fixture builder for the actual A2 boundary tests (stdout only)."""
import io
import json
import sys
import zipfile
from xml.sax.saxutils import escape

config = json.load(sys.stdin)
headers = ['Tên sản phẩm', 'Link sản phẩm', 'Giá', 'Số đã bán', 'Doanh thu', 'Ngành hàng', 'Thương hiệu',
           'Giá phân loại cao nhất', 'Giá phân loại nhỏ nhất', 'Link shop', 'Mã sản phẩm', 'Ngành hàng cấp 1',
           'Ngành hàng cấp 2', 'Ngành hàng cấp 3', 'Ngày bắt đầu bán', 'Thumbnail', 'Tên shop', 'Tổng doanh số',
           'Tổng số đánh giá', 'Tổng số đã bán']
rows = [headers, ['Synthetic A', 'https://shopee.vn/product/10/101', '900', '2', '100', 'Health', 'Brand', '', '',
                  'https://shopee.vn/shop/10', '1__101__10', 'Health', 'Supplements', '', '2020-01-01', '', 'Shop', '99999', '3', '555'],
        ['Synthetic B', 'https://shopee.vn/product/20/102', '800', '0', '50', 'Health', 'Brand', '', '',
         'https://shopee.vn/shop/20', '1__102__20', 'Health', 'Supplements', '', '2020-01-01', '', 'Shop', '88888', '4', '444']]
shared = []
if config.get('profile') == 'v2':
    rows = [r[:5] + r[6:11] + [r[5]] + r[11:] for r in rows]
shared_xml = []
row_xml = []
for r, values in enumerate(rows, 1):
    cells = []
    for col, val in enumerate(values):
        ref = chr(65 + col) + str(r)
        spec = config.get('cells', {}).get(ref, {'type': 's', 'value': val})
        if spec is None:
            continue
        typ, value = spec.get('type', 's'), str(spec.get('value', ''))
        formula = '<f>1+1</f>' if spec.get('formula') else ''
        style = ' s="1"' if spec.get('dateStyle') else ''
        if typ == 's':
            shared.append(value)
            shared_xml.append(spec.get('richXml', '<t>' + escape(value) + '</t>'))
            contents = '<v>' + str(len(shared) - 1) + '</v>'
        elif typ == 'inlineStr':
            contents = '' if spec.get('emptyInline') else '<is>' + spec.get('richXml', '<t>' + escape(value) + '</t>') + '</is>'
            if spec.get('duplicateInline'):
                contents += '<is><t>900</t></is>'
        else:
            contents = '<v>' + escape(value) + '</v>'
        cells.append('<c r="' + ref + '" t="' + typ + '"' + style + '>' + formula + contents + '</c>')
    row_xml.append('<row r="' + str(r) + '"' + (' hidden="1"' if config.get('hidden') and r == 2 else '') + '>' + ''.join(cells) + '</row>')
ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
sheet = '<worksheet xmlns="' + ns + '"><sheetData>' + ''.join(row_xml) + '</sheetData>'
sheet += '<mergeCells><mergeCell ref="A2:B2"/></mergeCells>' if config.get('merged') else ''
sheet += '<autoFilter ref="A1:T3"/>' if config.get('filter') else ''
sheet += '</worksheet>'
parts = {
    'xl/workbook.xml': '<workbook xmlns="' + ns + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + config.get('sheet', 'Sheet1') + '" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/styles.xml': '<styleSheet xmlns="' + ns + '"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    'xl/sharedStrings.xml': '<sst xmlns="' + ns + '">' + ''.join('<si>' + s + '</si>' for s in shared_xml) + '</sst>',
}
if config.get('badXml'):
    parts['xl/worksheets/sheet1.xml'] = '<!DOCTYPE x [<!ENTITY foo "bar">]>' + sheet
output = io.BytesIO()
with zipfile.ZipFile(output, 'w') as z:
    for name, content in parts.items():
        z.writestr(zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)), content.encode('utf-8'))
sys.stdout.buffer.write(output.getvalue())
