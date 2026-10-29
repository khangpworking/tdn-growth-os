#!/usr/bin/env python3
"""Validate every kem-raw-v1 file and write 00-index.json.

Checks per file: JSON parses; declare has the required fields; recordCount and recordsSha256 match records;
every sideFile exists with the declared sha256. Exit code 1 when any check fails.
"""
import hashlib, json, os, sys, glob

D = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/kem-raw-2910")
REQUIRED = ["formatVersion", "sourceCode", "sourceName", "provider", "reportName", "grade", "usedBy", "evidenceFamily",
            "keyword", "productTopic", "country", "timezone", "origin", "period", "recordShape", "limits", "recordCount", "recordsSha256"]
PERIOD = ["startDate", "endDate", "timezone", "basis"]


def side_files(o):
    if isinstance(o, dict):
        if "sideFile" in o:
            yield o
        for v in o.values():
            yield from side_files(v)
    elif isinstance(o, list):
        for v in o:
            yield from side_files(v)


index, bad = [], 0
for p in sorted(glob.glob(os.path.join(D, "[0-9][0-9]-*.json"))):
    name = os.path.basename(p)
    if name.startswith("00-"):
        continue
    errs = []
    try:
        doc = json.load(open(p, encoding="utf-8"))
    except Exception as e:
        print("FAIL", name, "json", e); bad += 1; continue
    dec, recs = doc.get("declare", {}), doc.get("records")
    errs += [f"missing declare.{k}" for k in REQUIRED if k not in dec]
    errs += [f"missing period.{k}" for k in PERIOD if k not in dec.get("period", {})]
    if dec.get("formatVersion") != "kem-raw-v1": errs.append("formatVersion")
    if not isinstance(recs, list): errs.append("records not a list")
    else:
        if dec.get("recordCount") != len(recs): errs.append("recordCount mismatch")
        sha = hashlib.sha256(json.dumps(recs, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
        if dec.get("recordsSha256") != sha: errs.append("recordsSha256 mismatch")
        for sf in side_files(recs):
            fp = os.path.join(D, sf["sideFile"])
            if not os.path.exists(fp): errs.append(f"sideFile missing {sf['sideFile']}")
            elif hashlib.sha256(open(fp, "rb").read()).hexdigest() != sf["sha256"]: errs.append(f"sideFile sha mismatch {sf['sideFile']}")
    status = "OK" if not errs else "FAIL"
    bad += bool(errs)
    print(status, name, dec.get("recordCount"), "; ".join(errs))
    index.append({"file": name, "sourceCode": dec.get("sourceCode"), "sourceName": dec.get("sourceName"), "provider": dec.get("provider"),
                  "usedBy": dec.get("usedBy"), "method": (dec.get("origin") or {}).get("method"), "period": dec.get("period"),
                  "recordCount": dec.get("recordCount"), "resultNote": dec.get("resultNote"), "cost": dec.get("cost"),
                  "byteSize": os.path.getsize(p), "fileSha256": hashlib.sha256(open(p, "rb").read()).hexdigest(), "check": status})
not_collected = [
    {"sourceCode": "S03", "sourceName": "Số nhập khẩu theo lô hàng (TradeInt)", "reason": "Cần tài khoản hợp lệ"},
    {"sourceCode": "S08", "sourceName": "Bài đăng Facebook", "reason": "Chủ tạm dừng"},
    {"sourceCode": "S09", "sourceName": "Instagram", "reason": "Không có công cụ"},
    {"sourceCode": "S10", "sourceName": "Bài đăng X", "reason": "Làm sau cùng, giá trị thấp"},
    {"sourceCode": "S11", "sourceName": "Bình luận YouTube", "reason": "Chủ bỏ 17/10"},
    {"sourceCode": "S12", "sourceName": "Dữ liệu shop của chủ", "reason": "Chủ quyết không gửi tay"},
    {"sourceCode": "S18", "sourceName": "Trang Facebook thương hiệu", "reason": "Chờ chủ quyết; 0/6 trang đọc được khi thử"},
    {"sourceCode": "S27", "sourceName": "Đánh giá qua dịch vụ thứ ba (Dami)", "reason": "Không thu"},
]
json.dump({"formatVersion": "kem-raw-v1", "keyword": "viên uống kẽm", "productTopic": "thực phẩm chức năng viên kẽm",
           "builtOn": "2026-10-29", "baseRun": "f0f4799a-f9b3-4204-91b2-682ab79d0fce (26/10/2026, Market)",
           "files": index, "notCollected": not_collected},
          open(os.path.join(D, "00-index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("files", len(index), "failed", bad)
sys.exit(1 if bad else 0)
