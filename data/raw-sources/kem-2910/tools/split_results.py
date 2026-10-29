#!/usr/bin/env python3
"""Split the kem-raw-v1 source files into one file per raw result (format kem-raw-result-v1) + results/README.md.

Usage: split_results.py <kem-2910 dir> [--check]
  default  writes <dir>/results/<NN-source>/<seq>-<slug>.json and <dir>/results/README.md
  --check  rebuilds in memory and fails if any file on disk differs or is missing/extra
One file = one provider answer (one search, one AI Overview, one API call, one product's reviews, one video's comments).
The payload is copied unchanged from the source file; declare says where it came from.
"""
import hashlib, json, os, re, sys, unicodedata

D = sys.argv[1]
CHECK = "--check" in sys.argv
OUT = os.path.join(D, "results")
files = {}       # relative path -> bytes
index = []       # (folder title, rel path, description)


def slug(s, n=50):
    s = unicodedata.normalize("NFKD", str(s).replace("đ", "d").replace("Đ", "D"))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return (re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "x")[:n].rstrip("-")


def put(folder, title, seq, name, describe, src_file, src_where, payload, extra=None):
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    doc = {"declare": {"formatVersion": "kem-raw-result-v1", "folderTitle": title, "describe": describe,
                       "parentFile": src_file, "parentLocation": src_where, **(extra or {}),
                       "resultSha256": hashlib.sha256(body).hexdigest()},
           "result": payload}
    rel = f"{folder}/{seq:03d}-{slug(name)}.json"
    files[rel] = (json.dumps(doc, ensure_ascii=False, indent=1) + "\n").encode("utf-8")
    index.append((folder, title, rel, describe))


def load(n):
    return json.load(open(os.path.join(D, n), encoding="utf-8"))


def common(dec):
    return {k: dec.get(k) for k in ("sourceCode", "sourceName", "provider", "keyword", "period", "limits") if k in dec}


for name in sorted(os.listdir(D)):
    if not re.match(r"\d\d-S", name):
        continue
    doc = load(name)
    dec, recs = doc["declare"], doc["records"]
    folder = name[:-5]
    title = f"{name[:2]} · {dec['sourceCode']} · {dec['sourceName']}"
    base = common(dec)
    seq = 0
    code = dec["sourceCode"]
    if code == "S01":
        for i, r in enumerate(recs):
            if r["logicalPath"] != "capture/raw-responses.json":
                seq += 1
                put(folder, title, seq, r["logicalPath"], f"Metric: {r['logicalPath']}", name, f"records[{i}].content", r["content"], base)
            else:
                for j, resp in enumerate(r["content"]):
                    path = (resp.get("urlPath") or "").split("?")[0]
                    if "/market/" not in path or resp.get("body") in (None, ""):
                        continue
                    seq += 1
                    put(folder, title, seq, f"api-{path}-{resp.get('responseOrder')}", f"Metric API {resp.get('method')} {path} (thứ tự {resp.get('responseOrder')})",
                        name, f"records[{i}].content[{j}]", resp, base)
    elif code == "S05":
        coll = next(r["content"] for r in recs if r["kind"] == "collection")
        seq += 1
        put(folder, title, seq, "collection", "Danh sách 5 sản phẩm Shopee đã thu + trạng thái từng sản phẩm", name, "records[kind=collection]", coll, base)
        rows = [x for r in recs if r["kind"] == "page" for x in r["content"]]
        for s in coll["selected"]:
            mine = [x for x in rows if x["itemId"] == s["itemId"]]
            seq += 1
            put(folder, title, seq, f"shopee-{s['itemId']}", f"Đánh giá Shopee của sản phẩm {s['itemId']} ({len(mine)} đánh giá) — {s['productUrl']}",
                name, "records[kind=page].content[itemId=" + s["itemId"] + "]", mine, {**base, "productUrl": s["productUrl"], "reviewCount": len(mine)})
    elif code == "S07":
        for i, r in enumerate(recs):
            if r["operation"] == "video.selection":
                seq += 1
                put(folder, title, seq, "video-selection", "5 video TikTok được chọn để thu bình luận", name, f"records[{i}]", r, base)
            else:
                items = r.get("items") or []
                for v in dict.fromkeys(x["videoWebUrl"] for x in items):
                    mine = [x for x in items if x["videoWebUrl"] == v]
                    seq += 1
                    put(folder, title, seq, f"video-{v.rsplit('/', 1)[-1]}", f"Bình luận TikTok của video {v} ({len(mine)} bình luận)",
                        name, f"records[{i}].items[videoWebUrl={v}]", mine, {**base, "videoUrl": v, "commentCount": len(mine)})
    elif not recs:
        seq += 1
        put(folder, title, seq, "not-collected", f"Không thu: {dec['origin'].get('reason', '')}", name, "declare", dec["origin"], base)
    else:
        for i, r in enumerate(recs):
            seq += 1
            rp = r.get("requestParameters") or {}
            label = (rp.get("q") or rp.get("keyword") or r.get("query") or r.get("prefix") or r.get("productId") or rp.get("product_id")
                     or r.get("packageKey", "").split(":")[0] or r.get("kind") or r.get("operation") or r.get("logicalPath") or f"record-{i}")
            op = r.get("operation") or r.get("kind") or r.get("sourceLabel") or ""
            if code == "S29":
                desc = f"Google AI Overview cho câu «{r.get('query')}» ({r.get('aiOverviewState')})"
            elif code in ("S19 (gồm S13, S26)",):
                desc = f"Kết quả Google cho câu «{rp.get('q')}»"
            elif code == "S19b":
                desc = f"Gợi ý Google cho tiền tố «{r.get('prefix')}» ({len(r.get('suggestions') or [])} gợi ý)"
            elif code == "S20 + S20b":
                desc = f"Google Trends {rp.get('data_type')} cho «{rp.get('q')}»"
            else:
                desc = f"{op} {label}".strip()
            put(folder, title, seq, f"{op}-{label}" if op and op != label else str(label), desc, name, f"records[{i}]", r, base)

lines = ["# Từng kết quả gốc — viên kẽm (kem-raw-result-v1)", "",
         "Mỗi tệp dưới đây là **một kết quả gốc**: một lần tìm Google, một bản AI Overview, một lần gọi API, đánh giá của một sản phẩm, bình luận của một video.",
         "Mỗi tệp có `declare` (nguồn, tệp mẹ, vị trí trong tệp mẹ, kỳ, giới hạn, `resultSha256`) và `result` (nội dung gốc, giữ nguyên).",
         "Đã ẩn danh như tệp mẹ (xem README của thư mục cha, mục 4). Tạo lại bằng `python3 tools/split_results.py .`; kiểm bằng `--check`.", ""]
cur = None
for folder, title, rel, desc in index:
    if folder != cur:
        cur = folder
        lines += ["", f"## {title}", "", "| Tệp | Nội dung |", "|---|---|"]
    lines.append(f"| [{rel.split('/', 1)[1]}]({rel}) | {desc.replace('|', '/')} |")
files["README.md"] = ("\n".join(lines) + "\n").encode("utf-8")

if CHECK:
    disk = {os.path.relpath(os.path.join(dp, f), OUT).replace(os.sep, "/") for dp, _, fs in os.walk(OUT) for f in fs}
    bad = [p for p in files if p not in disk or open(os.path.join(OUT, p), "rb").read() != files[p]] + sorted(disk - set(files))
    print("results", len(files) - 1, "mismatch", len(bad), bad[:5])
    sys.exit(1 if bad else 0)
for rel, b in files.items():
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(b)
print("results", len(files) - 1, "folders", len({f for f, *_ in index}))
