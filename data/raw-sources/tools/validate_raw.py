#!/usr/bin/env python3
"""Check raw source files against the raw-v1 file shape (input standard 1.48, Part 6.1).

Usage (from the repo root): validate_raw.py <dataset dir> [more dirs...]
Reads every <NN>-<source>.json file in each dir. Prints one line per file: OK, WARN or FAIL, then the problems.
raw-v1 files: every rule below is an error. kem-raw-v1 files (the first version, kẽm set of 29/10/2026): the base checks
are errors; the rules that raw-v1 added are warnings only, so the shared kẽm links keep working.
Exit code 1 when any file fails. The script only reads; it never writes the dataset.
"""
import hashlib, json, os, re, sys, glob

FORMATS = ("raw-v1", "kem-raw-v1")
BASE_REQUIRED = ["formatVersion", "sourceCode", "sourceName", "provider", "reportName", "grade", "usedBy", "evidenceFamily",
                 "keyword", "productTopic", "country", "timezone", "origin", "period", "recordShape", "limits", "recordCount",
                 "recordsSha256"]
PERIOD_KEYS = ["startDate", "endDate", "timezone", "basis"]
GRADES = {"A", "B", "C", "D", "NONE"}
REPORTS = {"MARKET", "INSIGHT"}
METHODS = {"EXPORTED_FROM_APP_RUN", "FRESH_PULL_FOR_TEST_SET", "LOCAL_DATASET_QUERY", "NOT_COLLECTED"}
FAMILIES = {"sales_estimate", "customer_review", "social_comment", "seller_statement", "advertising", "web_search",
            "search_intent", "search_interest", "ai_summary_hypothesis", "macro_statistic", "trade_statistic",
            "published_document", "synthetic_population_baseline"}
# Names a report must never show (input standard, Part 3 rule 7). Shopee, TikTok, Google are platform names, not tools.
TOOL_NAMES = re.compile(r"\b(metric|kalodata|serpapi|apify|tradeint|dami|nemotron|nvidia|gemini|pageindex|opencli|jev)\b", re.I)
SOURCE_CODE = re.compile(r"^S\d\d[a-z]?$")
LIMIT_CODE = re.compile(r"^[a-z0-9_]+$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def is_number(v):
    return v is None or (isinstance(v, (int, float)) and not isinstance(v, bool))


def file_refs(o):
    if isinstance(o, dict):
        if "sideFile" in o or "excludedFile" in o:
            yield o
        for v in o.values():
            yield from file_refs(v)
    elif isinstance(o, list):
        for v in o:
            yield from file_refs(v)


def base_errors(d, dec, recs):
    """Checks shared by raw-v1 and kem-raw-v1."""
    errs = [f"missing declare.{k}" for k in BASE_REQUIRED if k not in dec]
    if dec.get("formatVersion") not in FORMATS:
        errs.append(f"formatVersion {dec.get('formatVersion')!r}")
    if not re.match(r"^S\d\d", str(dec.get("sourceCode", ""))):
        errs.append(f"sourceCode {dec.get('sourceCode')!r}")
    period = dec.get("period")
    if period is not None:
        errs += [f"missing period.{k}" for k in PERIOD_KEYS if k not in period]
    method = (dec.get("origin") or {}).get("method")
    if method not in METHODS:
        errs.append(f"origin.method {method!r}")
    if TOOL_NAMES.search(str(dec.get("reportName", ""))):
        errs.append(f"reportName names a tool: {dec.get('reportName')!r}")
    if not isinstance(recs, list):
        return errs + ["records not a list"]
    if dec.get("recordCount") != len(recs):
        errs.append("recordCount mismatch")
    sha = hashlib.sha256(json.dumps(recs, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    if dec.get("recordsSha256") != sha:
        errs.append("recordsSha256 mismatch")
    if (len(recs) == 0 or method == "NOT_COLLECTED") and not (dec.get("resultNote") or (dec.get("origin") or {}).get("reason")):
        errs.append("no resultNote (or origin.reason) for an empty or not-collected file")
    for ref in file_refs(recs):
        if not SHA256.match(str(ref.get("sha256", ""))):
            errs.append(f"file reference without sha256: {ref.get('sideFile') or ref.get('excludedFile')}")
        elif "sideFile" in ref:
            fp = os.path.join(d, ref["sideFile"])
            if not os.path.exists(fp):
                errs.append(f"sideFile missing {ref['sideFile']}")
            elif hashlib.sha256(open(fp, "rb").read()).hexdigest() != ref["sha256"]:
                errs.append(f"sideFile sha mismatch {ref['sideFile']}")
    return errs


def v1_rules(dec):
    """Rules added by raw-v1. Errors for raw-v1, warnings for kem-raw-v1."""
    out = []
    if not SOURCE_CODE.match(str(dec.get("sourceCode", ""))):
        out.append(f"sourceCode {dec.get('sourceCode')!r} must be one code (list other codes in alsoCovers)")
    also = dec.get("alsoCovers", [])
    if not isinstance(also, list) or any(not SOURCE_CODE.match(str(c)) for c in also):
        out.append(f"alsoCovers {also!r} must be a list of source codes")
    if (dec.get("recordCount") == 0 or (dec.get("origin") or {}).get("method") == "NOT_COLLECTED") and not dec.get("resultNote"):
        out.append("resultNote missing for an empty or not-collected file")
    if dec.get("grade") not in GRADES:
        out.append(f"grade {dec.get('grade')!r} not in A/B/C/D/NONE (explain in gradeNote)")
    used = dec.get("usedBy")
    if not isinstance(used, list) or not used or any(u not in REPORTS for u in used):
        out.append(f"usedBy {used!r} must list only MARKET, INSIGHT (explain in usedFor)")
    if not isinstance(dec.get("usedFor"), str) or not dec.get("usedFor").strip():
        out.append("usedFor missing")
    if dec.get("evidenceFamily") not in FAMILIES:
        out.append(f"evidenceFamily {dec.get('evidenceFamily')!r} not in the Part 6.1 list")
    limits = dec.get("limits")
    if not isinstance(limits, list) or any(not isinstance(x, dict) or set(x) != {"code", "text"} or not str(x.get("text") or "").strip()
                                           or not (x["code"] is None or LIMIT_CODE.match(str(x["code"]))) for x in limits):
        out.append("limits must be a list of {code, text}")
    period = dec.get("period")
    if period is not None and period.get("startDate") is None and "observedPeriod" not in dec:
        out.append("observedPeriod missing (period.startDate is null)")
    for u in dec.get("usage") or []:
        if not is_number(u.get("costAmount")):
            out.append(f"usage.costAmount {u.get('costAmount')!r} is not a number")
    cost = dec.get("cost")
    if isinstance(cost, dict):
        for k in ("amount", "balanceBefore", "balanceAfter"):
            if k in cost and not is_number(cost[k]):
                out.append(f"cost.{k} {cost[k]!r} is not a number")
        unknown = set(cost) - {"unit", "amount", "balanceBefore", "balanceAfter", "note"}
        if unknown:
            out.append(f"cost has fields outside unit/amount/balanceBefore/balanceAfter/note: {sorted(unknown)}")
    return out


def check_dir(d):
    bad = 0
    files = sorted(p for p in glob.glob(os.path.join(d, "[0-9][0-9]-*.json")) if not os.path.basename(p).startswith("00-"))
    for p in files:
        name = os.path.basename(p)
        try:
            doc = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            print("FAIL", name, "json", e)
            bad += 1
            continue
        dec, recs = doc.get("declare") or {}, doc.get("records")
        errs = base_errors(d, dec, recs)
        extra = v1_rules(dec)
        warns = []
        if dec.get("formatVersion") == "raw-v1":
            errs += extra
        else:
            warns = extra
        status = "FAIL" if errs else ("WARN" if warns else "OK")
        bad += bool(errs)
        print(status, name, "; ".join(errs + [f"warn: {w}" for w in warns]))
    print("dir", d, "files", len(files), "failed", bad)
    return bad, len(files)


if __name__ == "__main__":
    dirs = sys.argv[1:] or ["."]
    total_bad = total = 0
    for d in dirs:
        b, n = check_dir(d)
        total_bad += b
        total += n
    sys.exit(1 if total_bad or not total else 0)
