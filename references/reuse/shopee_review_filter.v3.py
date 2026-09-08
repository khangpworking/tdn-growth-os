#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Shopee VN review noise filter — v3 (final)

Key handling:
  * Guided-review fields are split into 3 classes:
      - DROP_FIELDS   : generic prompts, no insight  ("Công dụng", "Màu sắc"…)
      - META_FIELDS   : segment metadata, kept as a column ("Đối tượng sử dụng")
      - SIGNAL_FIELDS : product-experience prompts whose VALUES are real content
                        ("Độ dễ uống", "Xương chắc khỏe", "Hấp thụ", "Sự cải thiện"…)
  * Noise spans are masked BEFORE signal matching so "gói" inside "đóng gói"
    is not counted as product form.
  * Unaccented Vietnamese variants are matched (users type "chua thay hieu qua").
  * Ambiguous single words (hơn / hết / khác / tuổi) are excluded from SIGNAL.
"""
import re, unicodedata, json
from collections import Counter, defaultdict

import sys
SRC = sys.argv[1] if len(sys.argv) > 1 else 'reviews.md'
OUT = '/mnt/user-data/outputs/shopee_reviews_FILTERED.md'

# ─────────────────── parse ───────────────────
rows = []
with open(SRC, encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line.startswith('|') or line.startswith('|---') or '| # |' in line:
            continue
        parts = [p.strip() for p in line.strip().strip('|').split('|')]
        if len(parts) < 5 or not parts[0].isdigit():
            continue
        rows.append({'id': int(parts[0]), 'product': parts[1], 'star': parts[2],
                     'author': parts[3], 'text': '|'.join(parts[4:]).strip()})

VN = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ'

def norm(s):
    s = unicodedata.normalize('NFC', s.lower())
    s = re.sub(f'[^\\w\\s{VN}]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def deaccent(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.replace('đ', 'd').replace('Đ', 'D')

def strip_emoji(s):
    return re.sub(r'[\U00010000-\U0010ffff\u2600-\u27bf\ufe0f\u2190-\u21ff\u2b00-\u2bff]', '', s)

# ─────────────────── guided fields ───────────────────
DROP_FIELDS = ['công dụng','màu sắc','chất liệu','đúng với mô tả','thương hiệu',
               'xuất xứ','hạn sử dụng','dung tích','khối lượng','tính năng']
META_FIELDS = ['đối tượng sử dụng']
SIGNAL_FIELDS = ['độ dễ uống','xương chắc khỏe','tăng chiều cao','hấp thụ','hấp thu',
                 'sự cải thiện','hàm lượng canxi','chất lượng','chiều cao','xương','cơ xương',
                 'mùi vị','mùi hương','kết cấu','ưu điểm']

ALL_FIELDS = DROP_FIELDS + META_FIELDS + SIGNAL_FIELDS
FIELD_ALT = '|'.join(sorted((re.escape(f) for f in ALL_FIELDS), key=len, reverse=True))
FIELD_RE = re.compile(f'({FIELD_ALT})\\s*:\\s*(.*?)(?=(?:{FIELD_ALT})\\s*:|$)',
                      re.IGNORECASE | re.DOTALL)

def split_fields(text):
    """→ (meta_dict, signal_field_text, remaining_free_text)"""
    meta, sig_parts = {}, []
    for m in FIELD_RE.finditer(text):
        name = m.group(1).lower().strip()
        val = m.group(2)
        # The LAST guided field runs into the free text; Shopee separates them
        # with a double space. Cut there so the field value stays a field value.
        val = re.split(r'\s{2,}', val)[0]
        val = re.sub(r'\s+', ' ', val).strip()
        if not val:
            continue
        if name in META_FIELDS:
            meta[name] = val
        elif name in SIGNAL_FIELDS:
            sig_parts.append(f'{name}: {val}')
    def _tail(m):
        parts = re.split(r'\s{2,}', m.group(2), maxsplit=1)
        return ' ' + parts[1] if len(parts) > 1 else ' '
    free = FIELD_RE.sub(_tail, text)
    return meta, ' '.join(sig_parts), re.sub(r'\s+', ' ', free).strip()

# ─────────────────── keyword sets ───────────────────
NOISE = [
 # shipping / delivery
 'giao hàng nhanh','giao nhanh','ship nhanh','ship hoả tốc','ship hỏa tốc','giao hoả tốc',
 'giao hàng','shipper','ship','giao đúng hẹn','nhận hàng nhanh','vận chuyển','đã nhận được hàng',
 'nhận được hàng','giao hàng chậm','đặt hôm trước hôm sau','chuẩn bị hàng','đvvc','giao kịp',
 # packaging
 'đóng gói','gói hàng','bọc chống sốc','chống sốc','bao bì','hộp giấy','băng keo','nilon',
 'móp méo','không bị móp','đóng hàng','gói cẩn thận','chống vỡ',
 # seller service
 'tư vấn','phục vụ tốt','trả lời tin nhắn','nhiệt tình','đáng tin cậy','uy tín','cảm ơn shop',
 'thanks shop','thank shop','sẽ ủng hộ','ủng hộ shop','quay lại ủng hộ','ủng hộ dài dài',
 'shop có tâm','chu đáo','tận tâm','thân thiện','dễ mến','chuyên nghiệp','cảm ơn','cám ơn',
 # authenticity / marketplace trust
 'chính hãng','tem phụ','tem nhãn','tem chống hàng giả','tem niêm phong','tem','shopee mall',
 'shoppe mall','shop mall','hàng mall','yên tâm','an tâm','đảm bảo','date xa','đúng mô tả',
 'đúng với mô tả','như mô tả','hàng chuẩn','hàng đẹp','check được mã','gian hàng','hàng của shop',
 'xuất xứ rõ ràng','nguồn gốc',
 # price / promo
 'săn sale','giá rẻ','giá tốt','giá cả hợp lý','giá ok','được tặng','tặng quà','quà tặng',
 'hời ghê','giá hời','miễn ship','freeship','voucher','mã giảm giá','sale','rẻ hơn','giá thành',
 'đáng tiền','đáng để mua','giá hợp lý',
 # generic praise
 'sản phẩm tốt','hàng tốt','rất tốt','tuyệt vời','hài lòng','ưng ý','nên mua','chất lượng tốt',
 'sản phẩm chất lượng','sản phẩm uy tín','không có gì để chê','ok lắm','5 sao','năm sao',
 '10 điểm','mười điểm','vote','đánh giá','sản phẩm ổn','chất lượng ổn','ổn định','quá ổn',
 # not-yet-used
 'chưa dùng','chưa sử dụng','chưa thử','mới nhận','mới mua','sẽ review','review sau',
 'đợi uống','xem kết quả','mới sd','lần đầu mua','dùng thử xem','chưa biết như nào',
 'chưa biết chất lượng','mới uống nên',
]

SIGNAL = [
 # consumption + measurable effect
 'uống','đã uống','uống được','uống vào','uống hàng ngày','sau khi uống','mỗi ngày','ngày uống',
 'hiệu quả','tác dụng','công hiệu','cải thiện','sự cải thiện','kết quả tốt',
 'thấy đỡ','đỡ hẳn','đỡ đau','bớt đau','giảm hẳn','giảm đau','hấp thu','hấp thụ','dễ hấp thu',
 # symptoms / body
 'chuột rút','đau xương','đau lưng','đau khớp','khớp gối','mỏi gối','nhức mỏi','nhức',
 'loãng xương','xương khớp','xương chắc khoẻ','xương chắc khỏe','xương',
 'móng tay','móng','răng','tóc','chiều cao','tăng chiều cao','còi xương','tê tay','tê chân',
 'co giật','mất ngủ','ngủ ngon','mệt mỏi','thiếu canxi','đề kháng','cứng cáp','chắc khoẻ',
 # side effects / complaints  (highest value)
 'nóng trong','táo bón','đau bụng','khó tiêu','đầy bụng','buồn nôn','đi ngoài','tiêu chảy',
 'nổi mụn','lên mụn','dị ứng','tác dụng phụ','không hợp','bị nóng','cặn canxi','sỏi thận',
 'không hiệu quả','chưa thấy hiệu quả','chưa thấy','không thấy tác dụng','không tác dụng',
 'chưa hiệu quả','thất vọng','không đáng','phí tiền','không như mong đợi','nguy hiểm',
 # form / taste / usability
 'khó nuốt','viên to','viên nhỏ','dễ uống','khó uống','dễ nuốt','mùi tanh','vị tanh','tanh',
 'vị ngọt','ngọt','đắng','chua ngọt','thơm','mùi sữa','khó chịu','viên nén','viên sủi',
 'dạng bột','dạng nước','dạng ống','viên nang','sủi','pha nước','ống thủy tinh','tách riêng',
 # target user / life stage
 'bà bầu','bầu','mang thai','thai kỳ','sau sinh','cho con bú','mãn kinh','người già',
 'người lớn tuổi','cho mẹ','cho bà','cho bố','cho ba','cho vợ','cho chồng','cho con','cho bé',
 'trẻ em','bé nhà','trên 30','trên 40','trên 50','người lớn','trưởng thành','ông bà','lứa tuổi',
 # authority
 'bác sĩ','bs kê','đơn thuốc','theo đơn','được giới thiệu','giới thiệu','bệnh viện','dược sĩ',
 'khuyên dùng','hiệu thuốc','quầy thuốc',
 # comparison / switching
 'so với','chuyển từ','trước dùng','trước mình','thay thế','đổi sang','từng dùng','đã từng',
 'loại khác','hãng khác','so sánh','tốt hơn','kém hơn','đỡ hơn','giảm hơn',
 # repeat purchase w/ experience
 'uống mấy năm','dùng mấy năm','dùng gần','uống từ','đã uống được','uống hết hộp',
 'mua nhiều lần','uống lâu','dùng lâu năm','uống miết','uống nhiều','dùng được gần',
]

# deaccented forms that collide with unrelated common words
BLOCK_DEACCENT = {'mong','dang','chua','ong','hon','het','ban','coi','ma','vi','moi','tre','ca'}

def variants(kws):
    """accented + unaccented forms"""
    out = set()
    for k in kws:
        n = norm(k)
        out.add(n)
        # Unaccented variants only for phrases (>=2 words or >=7 chars).
        # Short single words collide badly: móng->mong(hope), đắng->dang(is/form).
        if (' ' in n or len(n) >= 7) and deaccent(n) not in BLOCK_DEACCENT:
            out.add(deaccent(n))
    return {v for v in out if len(v) >= 3}

def build_re(kws):
    pats = sorted(variants(kws), key=len, reverse=True)
    return re.compile(f"(?<![\\w{VN}])(" + '|'.join(re.escape(p) for p in pats) + f")(?![\\w{VN}])")

NOISE_RE  = build_re(NOISE)
SIGNAL_RE = build_re(SIGNAL)

# ─────────────────── classify ───────────────────
kept, removed, seen = [], [], {}

for r in rows:
    raw = r['text']
    meta, sigfields, free = split_fields(raw)
    content = (sigfields + ' ' + free).strip()
    content = strip_emoji(content).strip()
    nc = norm(content)

    noi = sorted(set(NOISE_RE.findall(nc)))
    masked = NOISE_RE.sub(lambda m: ' ' * len(m.group(0)), nc)
    sig = sorted(set(SIGNAL_RE.findall(masked)))

    target = meta.get('đối tượng sử dụng', '')
    has_target = len(norm(target)) > 3

    r.update({'_sig': sig, '_noi': noi, '_content': content,
              '_target': target, '_meta': meta})

    reason = None
    if len(nc) < 12 and not sig:
        reason = 'Không có nội dung (chỉ template/emoji/quá ngắn)'
    elif nc in seen:
        reason = f"Trùng lặp nội dung (đã có ở #{seen[nc]})"
    elif len(sig) == 0:
        reason = 'Chỉ có logistics/khen chung — không có tín hiệu sản phẩm'
    elif len(sig) == 1 and len(noi) >= 5 and len(nc) < 100:
        reason = 'Tín hiệu quá yếu so với nội dung vận chuyển/dịch vụ'
    else:
        seen[nc] = r['id']

    if reason:
        r['reason'] = reason
        removed.append(r)
    else:
        neg = {'không hiệu quả','chưa thấy hiệu quả','chưa thấy','không tác dụng','chưa hiệu quả',
               'nóng trong','táo bón','đau bụng','nổi mụn','lên mụn','dị ứng','tác dụng phụ',
               'không hợp','khó nuốt','viên to','khó uống','tanh','đắng','thất vọng',
               'không đáng','phí tiền','nguy hiểm','cặn canxi','sỏi thận','không thấy tác dụng',
               'không như mong đợi','khó chịu','buồn nôn','tiêu chảy','đi ngoài'}
        negs = [s for s in sig if s in neg or deaccent(s) in {deaccent(x) for x in neg}]
        r['_neg'] = negs
        r['_score'] = len(sig)*2 + (3 if has_target else 0) + (6 if int(r['star']) <= 3 else 0) + len(negs)*4
        kept.append(r)

kept.sort(key=lambda x: -x['_score'])

# ─────────────────── report ───────────────────
print(f"TOTAL   : {len(rows)}")
print(f"KEPT    : {len(kept)} ({len(kept)/len(rows)*100:.1f}%)")
print(f"REMOVED : {len(removed)} ({len(removed)/len(rows)*100:.1f}%)\n")

print("--- Lý do loại ---")
for k, v in Counter(r['reason'].split('(đã có')[0].strip() for r in removed).most_common():
    print(f"{v:5d}  {k}")

print("\n--- Theo sản phẩm ---")
byp = defaultdict(lambda: [0, 0])
for r in rows: byp[r['product']][0] += 1
for r in kept: byp[r['product']][1] += 1
for p, (t, k) in sorted(byp.items(), key=lambda x: -x[1][1]):
    print(f"{k:4d}/{t:4d} ({k/t*100:5.1f}%)  {p[:50]}")

print("\n--- Theo sao ---")
bys = defaultdict(lambda: [0, 0])
for r in rows: bys[r['star']][0] += 1
for r in kept: bys[r['star']][1] += 1
for s in sorted(bys, reverse=True):
    t, k = bys[s]; print(f"{s}★  {k:4d}/{t:4d} ({k/t*100:5.1f}%)")

neg_reviews = [r for r in kept if r.get('_neg')]
print(f"\n--- Review chứa tín hiệu tiêu cực: {len(neg_reviews)} ---")
negc = Counter()
for r in neg_reviews: negc.update(r['_neg'])
for k, v in negc.most_common(20): print(f"{v:4d}  {k}")

allsig = Counter()
for r in kept: allsig.update(r['_sig'])
print("\n--- Top 30 tín hiệu ---")
for k, v in allsig.most_common(30): print(f"{v:4d}  {k}")

tgt = Counter(norm(r['_target'])[:40] for r in kept if r['_target'])
print(f"\n--- Đối tượng sử dụng (top 15 / {sum(tgt.values())} có khai báo) ---")
for k, v in tgt.most_common(15): print(f"{v:4d}  {k}")

OUTJSON = sys.argv[2] if len(sys.argv) > 2 else 'filtered.json'
json.dump({'kept': kept, 'removed': removed}, open(OUTJSON, 'w'), ensure_ascii=False, indent=1)
print(f"\n[saved {OUTJSON}]")

