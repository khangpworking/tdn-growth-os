#!/usr/bin/env python3
"""Callable adapter of the owner's v3 calcium review filter.
Product-use experience policy; JSON stdin/stdout; no files or network.
Numeric scoring weights and product-scoped dedup are preserved; raw stays in Box 1.
"""
import re
import unicodedata
import json
import sys

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
    """→ metadata, labeled field content, field values, free text, boundary.

    A double-space boundary is explicit. With no explicit boundary after the
    final guided field, its value and possible free text cannot be separated
    confidently, so preserve the whole span as review content and mark it.
    Field labels stay in ``content`` for stable deduplication, but only values
    and free text are eligible to establish a product-use experience.
    """
    matches = list(FIELD_RE.finditer(text))
    meta, sig_parts, sig_values, ambiguous_parts = {}, [], [], []
    boundary_status = 'none'
    for index, m in enumerate(matches):
        name = m.group(1).lower().strip()
        raw_val = m.group(2)
        parts = re.split(r'\s{2,}', raw_val, maxsplit=1)
        val = re.sub(r'\s+', ' ', parts[0]).strip()
        ambiguous_final = index == len(matches) - 1 and len(parts) == 1 and bool(raw_val.strip())
        if index == len(matches) - 1:
            if len(parts) > 1:
                boundary_status = 'explicit'
            elif ambiguous_final:
                boundary_status = 'ambiguous-preserved'
                if name not in SIGNAL_FIELDS:
                    ambiguous_parts.append(raw_val.strip())
        if not val:
            continue
        if name in META_FIELDS:
            meta[name] = val
        elif name in SIGNAL_FIELDS:
            # The labeled representation preserves the existing content/dedup
            # key; the value-only representation prevents labels from voting.
            sig_parts.append(f'{name}: {val}')
            sig_values.append(val)
    def _tail(m):
        parts = re.split(r'\s{2,}', m.group(2), maxsplit=1)
        return ' ' + parts[1] if len(parts) > 1 else ' '
    free = FIELD_RE.sub(_tail, text)
    free_parts = [free, *ambiguous_parts]
    free = re.sub(r'\s+', ' ', ' '.join(free_parts)).strip()
    return meta, ' '.join(sig_parts), ' '.join(sig_values), free, boundary_status

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

# Only concrete reported product-use experiences establish eligibility. Buying,
# target-user, authority, bare consumption and repurchase terms do not. Hearsay
# attribution neither establishes nor disqualifies a concrete attribute/effect.
SIGNAL = [
 # perceived effects or lack of effects
 'hiệu quả rõ','thấy hiệu quả','có hiệu quả','hiệu quả từ',
 'không hiệu quả','chưa thấy hiệu quả','chưa thấy rõ hiệu quả','không thấy tác dụng','chưa thấy tác dụng',
 'không tác dụng','chưa hiệu quả','chưa thấy cải thiện','chưa thấy sự thay đổi','chưa thấy thay đổi',
 'chưa thay đổi','không thay đổi','chưa thấy bất thường','không thấy bất thường',
 'không thấy đỡ','không đỡ','chẳng đỡ','thấy đỡ','đỡ hẳn','đỡ đau','bớt đau','giảm hẳn',
 'giảm đau','cải thiện rõ','được cải thiện',
 'đã cao lên','thấy cao lên','cao hơn được','cao hơn đc','tăng chiều cao khoảng','phát triển chiều cao',
 'chắc khoẻ hơn','chắc khỏe hơn','hết nhức','hết đau','người hơi ê ẩm','ăn khỏe hơn',
 'ăn khoẻ hơn','dễ chịu hơn','đỡ mệt','không ảnh hưởng gì tới đường tiêu hoá',
 'ko ảnh hưởng gì tới đường tiêu hoá',
 # concrete symptoms and tolerability reported in use
 'bị chuột rút','bị đau xương','bị đau lưng','bị đau khớp','bị mỏi gối','bị nhức mỏi',
 'bị tê tay','bị tê chân','đỡ chuột rút','đỡ đau xương','đỡ đau lưng','đỡ đau khớp',
 'đỡ mỏi gối','đỡ nhức mỏi','đỡ tê tay','đỡ tê chân','không còn chuột rút',
 'nóng trong','táo bón','bị táo','bị đau bụng','bị đau bao tử','bị khó tiêu','bị đầy bụng',
 'bị buồn nôn','bị đi ngoài','bị tiêu chảy','nổi mụn','lên mụn','dị ứng','tác dụng phụ',
 'không hợp','bị nóng','cặn canxi','sỏi thận','bị chóng mặt','thấy chóng mặt','bị ói','bị khó ngủ',
 # taste, smell, swallowing, opening and preparation
 'không dễ uống','chẳng dễ uống','khó nuốt','viên to','viên hơi to','viên nhỏ','dễ uống',
 'khó uống','dễ nuốt','nuốt được',
 'mùi tanh','vị tanh','tanh','vị ngọt','vị chua','vị hơi chua','chua chua','ngọt','đắng',
 'chua ngọt','thơm','mùi sữa','vị bình thường','gắt cổ','khó chịu','dễ nhai','khó nhai',
 'dễ bẻ','khó bẻ','bẻ ống','rớt miểng','mảnh vụn','mở nắp','khó mở','dễ mở',
 'pha nước','dễ pha','khó pha',
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
NOT_USED_RE = re.compile(
    r'(?:chưa dùng|chưa sử dụng|chưa thử|chưa xài)[^.!?]*?(?=\b(?:nhưng|mà)\b|[.!?]|$)',
    re.IGNORECASE,
)
MOTIVATION_RE = re.compile(
    r'(?:mua|đặt|chọn|tìm)(?![^,.!?]{0,80}\b(?:rồi|sau đó)\s+(?:uống|dùng|sử dụng)\b)'
    r'(?:\s+(?:về|để|cho))?[^,.!?]{0,80}(?:đau xương|đau lưng|đau khớp|'
    r'khớp gối|mỏi gối|nhức mỏi|tê tay|tê chân|táo bón|đau bụng|đau bao tử|khó tiêu|'
    r'đầy bụng|buồn nôn|dị ứng|sỏi thận|khó ngủ)[^,.!?]*|'
    r'[^,.!?]{0,80}(?:bị\s+)?(?:đau xương|đau lưng|đau khớp|khớp gối|mỏi gối|nhức mỏi|'
    r'tê tay|tê chân|táo bón|đau bụng|đau bao tử|khó tiêu|đầy bụng|buồn nôn|dị ứng|'
    r'sỏi thận|khó ngủ)\s+(?:nên|nên mới|nên phải|thì)\s+'
    r'(?:(?:tôi|mình|em|nhà tôi|gia đình)\s+)?(?:mua|đặt|chọn|tìm)[^,.!?]*',
    re.IGNORECASE,
)
SENTENCE_BOUNDARY_RE = re.compile(r'[.!?;\n]+')
NEGATOR_RE = re.compile(r'(?:không|khong|ko|k|chẳng|chả)(?:\s+(?:bị|gây|hề|quá|còn|thấy))?\s+$')


def negative_signals(text, signals, negative_terms):
    """Return intrinsically negative signals, respecting local negation."""
    negatives = []
    normalized_negatives = {norm(item) for item in negative_terms}
    deaccented_negatives = {deaccent(item) for item in normalized_negatives}
    for signal in signals:
        normalized = norm(signal)
        if normalized not in normalized_negatives and deaccent(normalized) not in deaccented_negatives:
            continue
        matches = list(build_re([signal]).finditer(text))
        for match in matches:
            prefix = text[max(0, match.start() - 32):match.start()]
            denied_assertion = re.search(r'(?:không|khong|ko|k|chẳng|chả)\s+phải(?:\s+là)?\s*$', prefix)
            intrinsically_negated = normalized.startswith(('không ', 'khong ', 'chưa '))
            if not denied_assertion and (intrinsically_negated or not NEGATOR_RE.search(prefix)):
                negatives.append(signal)
                break
    return negatives


def filter_reviews(supplied_rows):
    rows = [dict(row) for row in supplied_rows]
    kept, removed, seen = [], [], {}

    for r in rows:
        raw = r['text']
        meta, sigfields, sigvalues, free, boundary_status = split_fields(raw)
        content = strip_emoji((sigfields + ' ' + free).strip()).strip()
        nc = norm(content)

        # Keep the established content/dedup key above. Eligibility is narrower:
        # values + free text only, with buying noise masked first.
        experience_raw = strip_emoji((sigvalues + ' ' + free).strip())
        # Keep sentence boundaries while masking exclusions; norm() drops
        # punctuation and would otherwise consume later first-hand experience.
        experience_text = ' . '.join(norm(part) for part in SENTENCE_BOUNDARY_RE.split(experience_raw))
        noi = sorted(set(NOISE_RE.findall(nc)))
        experience_text = NOT_USED_RE.sub(lambda m: ' ' * len(m.group(0)), experience_text)
        experience_text = MOTIVATION_RE.sub(lambda m: ' ' * len(m.group(0)), experience_text)
        experience_text = NOISE_RE.sub(lambda m: ' ' * len(m.group(0)), experience_text)
        sig = sorted(set(SIGNAL_RE.findall(experience_text)))

        target = meta.get('đối tượng sử dụng', '')
        has_target = len(norm(target)) > 3

        r.update({'_sig': sig, '_noi': noi, '_content': content,
                  '_target': target, '_meta': meta, '_boundary_status': boundary_status})

        reason = None
        if len(nc) < 12 and not sig:
            reason = 'Không có nội dung (chỉ template/emoji/quá ngắn)'
        elif (r['product'], nc) in seen:
            reason = f"Trùng lặp nội dung (đã có ở #{seen[(r['product'], nc)]})"
        elif len(sig) == 0:
            reason = 'Không có trải nghiệm sử dụng sản phẩm cụ thể'
        else:
            seen[(r['product'], nc)] = r['id']

        if reason:
            r['reason'] = reason
            removed.append(r)
        else:
            neg = {'không hiệu quả','chưa thấy hiệu quả','chưa thấy rõ hiệu quả','không tác dụng',
                   'không thấy đỡ','không đỡ','chẳng đỡ','không dễ uống','chẳng dễ uống',
                   'chưa thấy tác dụng','chưa hiệu quả','chưa thấy cải thiện','chưa thấy sự thay đổi',
                   'chưa thấy thay đổi','chưa thay đổi','không thay đổi','nóng trong','táo bón',
                   'bị táo','bị đau bụng','bị đau bao tử','bị đau xương','bị đau lưng',
                   'bị đau khớp','bị mỏi gối','bị nhức mỏi','bị tê tay','bị tê chân',
                   'nổi mụn','lên mụn',
                   'dị ứng','tác dụng phụ','không hợp','khó nuốt','viên to','khó uống','tanh',
                   'đắng','cặn canxi','sỏi thận','khó chịu','buồn nôn','tiêu chảy','đi ngoài',
                   'bị chóng mặt','thấy chóng mặt','bị ói','bị khó ngủ','người hơi ê ẩm'}
            negs = negative_signals(experience_text, sig, neg)
            r['_neg'] = negs
            r['_score'] = len(sig)*2 + (3 if has_target else 0) + (6 if int(r['star']) <= 3 else 0) + len(negs)*4
            kept.append(r)

    kept.sort(key=lambda x: -x['_score'])
    result = []
    for row in kept + removed:
        result.append({
            'reviewId': row['id'], 'productKey': row['product'],
            'listingKey': row['listingKey'], 'text': row['text'],
            'content': row['_content'], 'target': row['_target'],
            'guidedFieldBoundary': row['_boundary_status'],
            'signals': row['_sig'], 'noise': row['_noi'],
            'negative': row.get('_neg', []), 'score': row.get('_score', 0),
            'decision': 'removed' if 'reason' in row else 'kept',
            'reason': row.get('reason', ''),
            'rawPageSha256': row['rawPageSha256'], 'rawRowIndex': row['rawRowIndex'],
        })
    return result


if __name__ == '__main__':
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    payload = json.load(sys.stdin)
    print(json.dumps(filter_reviews(payload), ensure_ascii=False))
