#!/usr/bin/env python3
"""Contract rows for validate_raw.py (input standard 1.48, Part 6.1).

Usage (from the repo root): test_validate_raw.py
Builds one valid raw-v1 file in a temp dir, then one broken copy per rule. Each broken copy must FAIL; the valid file
and the kẽm set (kem-raw-v1, warnings only) must not. Exit 1 on any wrong verdict.
"""
import copy, hashlib, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATE = os.path.join(HERE, "validate_raw.py")
KEM = os.path.join(HERE, "..", "kem-2910")


def records_sha(recs):
    return hashlib.sha256(json.dumps(recs, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


RECORDS = [{"operation": "test.op", "response": {"value": 1}}]
VALID = {"declare": {
    "formatVersion": "raw-v1", "sourceCode": "S20", "alsoCovers": ["S20b"], "sourceName": "Mức quan tâm tìm kiếm",
    "provider": "SerpApi (Google Trends)", "reportName": "Google Trends", "grade": "B", "usedBy": ["MARKET"],
    "usedFor": "Biểu đồ mức quan tâm 12 tháng", "evidenceFamily": "search_interest", "keyword": "x", "productTopic": "x",
    "country": "VN", "timezone": "Asia/Ho_Chi_Minh", "origin": {"method": "FRESH_PULL_FOR_TEST_SET"},
    "period": {"startDate": None, "endDate": "2026-10-31", "timezone": "Asia/Ho_Chi_Minh", "basis": "đến lúc thu"},
    "observedPeriod": {"startDate": "2025-11-01", "endDate": "2026-10-31"}, "recordShape": "một lần gọi",
    "limits": [{"code": "index_not_people", "text": "Chỉ số 0–100, không phải số người"}],
    "usage": [{"operation": "test.op", "requestCount": 1, "costState": "KNOWN", "costUnit": "USD", "costAmount": 0}],
    "cost": {"unit": "USD", "amount": 0}, "recordCount": 1, "recordsSha256": records_sha(RECORDS)},
    "records": RECORDS}


def broken(change):
    doc = copy.deepcopy(VALID)
    change(doc["declare"], doc)
    return doc


CASES = {
    "grade outside A/B/C/D/NONE": lambda d, _: d.update(grade="B/C"),
    "usedBy with a note": lambda d, _: d.update(usedBy=["MARKET (bảng 7.2)"]),
    "usedFor missing": lambda d, _: d.pop("usedFor"),
    "unknown evidenceFamily": lambda d, _: d.update(evidenceFamily="reviews"),
    "unknown origin.method": lambda d, _: d.update(origin={"method": "SCRAPED"}),
    "limits as plain strings": lambda d, _: d.update(limits=["Chỉ số 0–100"]),
    "observedPeriod missing": lambda d, _: d.pop("observedPeriod"),
    "costAmount as text": lambda d, _: d["usage"][0].update(costAmount="0"),
    "requestCount as text": lambda d, _: d["usage"][0].update(requestCount="1"),
    "requestCount as boolean": lambda d, _: d["usage"][0].update(requestCount=True),
    "cost as text": lambda d, _: d.update(cost="0"),
    "cost amount as text": lambda d, _: d["cost"].update(amount="0"),
    "limits text as number": lambda d, _: d.update(limits=[{"code": "limit", "text": 123}]),
    "period as null": lambda d, _: d.update(period=None),
    "unknown sourceCode": lambda d, _: d.update(sourceCode="S99"),
    "unknown alsoCovers": lambda d, _: d.update(alsoCovers=["S01z"]),
    "two codes in sourceCode": lambda d, _: d.update(sourceCode="S20 + S20b"),
    "tool name in reportName": lambda d, _: d.update(reportName="dữ liệu Kalodata"),
    "recordsSha256 mismatch": lambda d, _: d.update(recordsSha256="0" * 64),
    "not collected without resultNote": lambda d, doc: (d.update(origin={"method": "NOT_COLLECTED"}, recordCount=0,
                                                                 recordsSha256=records_sha([])), doc.update(records=[])),
}


def verdict(doc):
    with tempfile.TemporaryDirectory() as d:
        json.dump(doc, open(os.path.join(d, "01-S20-test.json"), "w", encoding="utf-8"), ensure_ascii=False)
        out = subprocess.run([sys.executable, VALIDATE, d], capture_output=True, text=True, encoding="utf-8")
        return out.returncode, out.stdout


wrong = 0
code, out = verdict(VALID)
print("valid raw-v1:", "OK" if code == 0 else "WRONG", out.splitlines()[0])
wrong += code != 0
for name, change in CASES.items():
    code, out = verdict(broken(change))
    ok = code == 1 and out.startswith("FAIL")
    print(f"refuse {name}:", "OK" if ok else "WRONG " + out.splitlines()[0])
    wrong += not ok
legacy = copy.deepcopy(VALID)
legacy["declare"]["formatVersion"] = "kem-raw-v1"
legacy["declare"]["usage"][0]["requestCount"] = "1"
code, out = verdict(legacy)
ok = code == 0 and out.startswith("WARN") and "requestCount" in out
print("legacy numeric addition is a warning:", "OK" if ok else "WRONG")
wrong += not ok
legacy["declare"]["recordsSha256"] = "0" * 64
code, out = verdict(legacy)
ok = code == 1 and out.startswith("FAIL") and "recordsSha256 mismatch" in out
print("legacy base checksum rule is an error:", "OK" if ok else "WRONG")
wrong += not ok
code, out = subprocess.run([sys.executable, VALIDATE, KEM], capture_output=True, text=True, encoding="utf-8").returncode, None
print("kẽm set (kem-raw-v1, warnings only):", "OK" if code == 0 else "WRONG")
wrong += code != 0
print("wrong verdicts:", wrong)
sys.exit(1 if wrong else 0)
