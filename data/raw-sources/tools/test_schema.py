#!/usr/bin/env python3
"""Run the db-v1 SQL from KHUON-CSDL.md in an in-memory SQLite DB and load the kẽm customer-voice files into it.

Usage (from the repo root): test_schema.py data/raw-sources/KHUON-CSDL.md data/raw-sources/kem-2910
Proves: the DDL runs; S05/S06/S07 rows fit the shared review table; run_review, video and codebook accept the kẽm rows;
four rule-breaking inserts are refused; review_coverage and writer_count give per-product counts. Exit 1 on any failure.
"""
import json, os, re, sqlite3, sys
from datetime import datetime, timezone, timedelta

md, D = sys.argv[1], sys.argv[2]
sql = re.search(r"```sql\n(.*?)```", open(md, encoding="utf-8").read(), re.S).group(1)
db = sqlite3.connect(":memory:")
db.executescript(sql)
print("sqlite", sqlite3.sqlite_version, "tables", db.execute("select count(*) from sqlite_master where type='table'").fetchone()[0])
J = lambda n: json.load(open(os.path.join(D, n), encoding="utf-8"))
VN = timezone(timedelta(hours=7))

def cap(cid, src, provider, op, at, outcome="OK"):
    db.execute("insert into raw_capture(capture_id,source_code,provider,operation,requested_at,outcome) values(?,?,?,?,?,?)",
               (cid, src, provider, op, at, outcome))

# Products: Shopee from S05 selection + S01 rating_count; TikTok Shop from S02 rank.
s05 = J("03-S05-shopee-danh-gia.json")
coll = next(r["content"] for r in s05["records"] if r["kind"] == "collection")
cap("S05-collection", "S05", "shopee-public-review", "shopee.reviews", coll["attemptedAt"])
m = J("01-S01-metric-so-ban-shopee-tiktok.json")
cap("S01-capture", "S01", "metric", "metric.results_page", "2026-10-26T01:56:38Z")
rows01 = {}
def walk(o):
    if isinstance(o, dict):
        pb = o.get("product_base_id")
        if isinstance(pb, str) and pb.startswith("1__") and "rating_count" in o:
            rows01.setdefault(pb.split("__")[1], o)
        for v in o.values(): walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
    elif isinstance(o, str) and o[:1] in "{[" and len(o) > 50:
        try: walk(json.loads(o))
        except Exception: pass
for r in m["records"]: walk(r.get("content"))
for s in coll["selected"]:
    row = rows01.get(s["itemId"], {})
    db.execute("insert into product(product_key,platform,item_id,shop_id,product_name,brand,product_url,first_capture_id) values(?,?,?,?,?,?,?,?)",
               ("shopee:" + s["itemId"], "shopee", s["itemId"], s["shopId"], (row.get("product_name") or "?").strip(), row.get("final_brand"), s["productUrl"], "S05-collection"))
    if row:
        db.execute("insert into product_snapshot(product_key,source_code,window_start,window_end,rating_avg,rating_count,lifetime_units,capture_id) values(?,?,?,?,?,?,?,?)",
                   ("shopee:" + s["itemId"], "S01", "2026-09-21", "2026-10-20", row.get("rating_avg"), row.get("rating_count"), row.get("order_count"), "S01-capture"))
s02 = J("02-S02-kalodata-san-pham-tiktok-shop.json")
cap("S02-rank", "S02", "kalodata", "kalodata.product.rank", "2026-10-26T01:55:11Z")
for p in [r for r in s02["records"] if r["operation"] == "kalodata.product.rank"][0]["response"]["data"]:
    db.execute("insert into product(product_key,platform,item_id,product_name,launch_date,first_capture_id) values(?,?,?,?,?,?)",
               ("tiktok_shop:" + p["product_id"], "tiktok_shop", p["product_id"], p["product_name"], p.get("launch_date"), "S02-rank"))

# S05 Shopee reviews.
for r in s05["records"]:
    if r["kind"] != "page": continue
    for x in r["content"]:
        db.execute("""insert into review(review_key,source_code,platform,kind,external_id,product_key,reviewer_key,reviewer_name,reviewer_name_state,
                      rating_star,text,variation,attributes_json,posted_at,state,collected_at,capture_id,source_position)
                      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                   ("S05:" + x["reviewId"], "S05", "shopee", "product_review", x["reviewId"], "shopee:" + x["itemId"], None, None, "not_provided",
                    x["ratingStar"], x.get("comment"), x.get("variation"), json.dumps(x.get("attributes"), ensure_ascii=False), x.get("createdAt"),
                    x.get("ratingState", "VALID"), coll["attemptedAt"], "S05-collection", f"page={x['sourcePage']},row={x['sourceRow']}"))

# S06 TikTok Shop reviews.
s06 = J("11-S06-tiktok-shop-danh-gia.json")
for i, r in enumerate(s06["records"]):
    if r.get("operation") != "kalodata.product.comment.insight" or r["httpStatus"] != 200: continue
    d = r["response"]["data"]; pid = d["product_id"]; cid = f"S06-{pid}"
    cap(cid, "S06", "kalodata", "kalodata.product.comment.insight", r["requestedAt"])
    for n, c in enumerate(d["original_comments"]):
        rv = c.get("review") or {}
        ts = rv.get("review_timestamp")
        posted = datetime.fromtimestamp(int(ts) / 1000, VN).isoformat() if ts else None
        db.execute("""insert into review(review_key,source_code,platform,kind,external_id,product_key,reviewer_key,reviewer_name,reviewer_name_state,
                      rating_star,text,variation,posted_at,like_count,collected_at,capture_id,source_position)
                      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                   ("S06:" + rv["review_id"], "S06", "tiktok_shop", "product_review", rv["review_id"], "tiktok_shop:" + pid,
                    c.get("review_user"), None, "masked_by_source", int(rv["rating"]) if rv.get("rating") else None,
                    rv.get("comment") or rv.get("display_text"), c.get("sku_specification"), posted, c.get("digg_count"),
                    r["requestedAt"], cid, f"product={pid},index={n}"))
    for kind, key in (("pain", "pain_points"), ("positive", "positive_points"), ("usage_scenario", "usage_scenarios")):
        for p in d.get(key) or []:
            db.execute("insert into review_point(point_id,product_key,kind,text_vi,text_zh,review_count,key_review_key,capture_id) values(?,?,?,?,?,?,?,?)",
                       (p["id"], "tiktok_shop:" + pid, kind, p["view_point"], p.get("point_zh"), len(p.get("id_list") or []), "S06:" + str(p.get("key_review_id")), cid))

# S07 TikTok comments.
s07 = J("17-S07-tiktok-binh-luan.json")
items = s07["records"][1]["items"]
cap("S07-apify", "S07", "apify", "apify.tiktok-comments", s07["records"][1]["requestedAt"])
for n, c in enumerate(items):
    db.execute("""insert into review(review_key,source_code,platform,kind,external_id,video_url,reviewer_key,reviewer_name,reviewer_name_state,
                  text,posted_at,like_count,reply_count,replies_to_external_id,media_count,collected_at,capture_id,source_position)
                  values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
               ("S07:" + c["cid"], "S07", "tiktok", "video_comment", c["cid"], c["videoWebUrl"], c.get("uid"), None, "real",
                c.get("text"), c.get("createTimeISO"), c.get("diggCount"), c.get("replyCommentTotal"), c.get("repliesToId"),
                0 if not c.get("images") or isinstance(c.get("images"), str) else len(c["images"]),
                s07["records"][1]["requestedAt"], "S07-apify", f"video={c['videoWebUrl'].rsplit('/', 1)[-1]},index={n}"))

# db-v1 tables: which run saw which review; S07 videos with no product link yet; a DRAFT codebook.
run05 = s05["declare"]["origin"]["runId"]
for key, cid, pos, src in db.execute("select review_key, capture_id, source_position, source_code from review").fetchall():
    db.execute("insert into run_review(run_id,review_key,capture_id,source_position) values(?,?,?,?)",
               (run05 if src == "S05" else "kem-2910", key, cid, pos))
for (url,) in db.execute("select distinct video_url from review where source_code='S07'").fetchall():
    db.execute("insert into video(video_url,video_id,link_basis,capture_id) values(?,?,?,?)", (url, url.rsplit("/", 1)[-1], "UNKNOWN", "S07-apify"))
db.execute("insert into codebook(codebook_version,status,definition_sha256) values('test-draft','DRAFT',?)", ("0" * 64,))

# Negative controls: each insert breaks one db-v1 rule and must be refused.
bad = {
    "APPROVED codebook without approver": "insert into codebook(codebook_version,status,definition_sha256) values('x','APPROVED','0')",
    "video linked without product": "insert into video(video_url,link_basis,capture_id) values('u','PROVIDER_LINK','S07-apify')",
    "review_code on unknown codebook": "insert into review_code(review_key,codebook_version,theme_code,polarity,status,coder,text_sha256,coded_at) "
                                       "select review_key,'missing','T','positive','kept','m','0','2026-10-31' from review limit 1",
    "review_code with bad polarity": "insert into review_code(review_key,codebook_version,theme_code,polarity,status,coder,text_sha256,coded_at) "
                                     "select review_key,'test-draft','T','great','kept','m','0','2026-10-31' from review limit 1",
}
refused = 0
for name, stmt in bad.items():
    try:
        db.execute(stmt)
        print("NOT REFUSED:", name)
    except sqlite3.IntegrityError:
        refused += 1
print("negative controls refused:", refused, "of", len(bad))

print("reviews by source:", db.execute("select source_code, count(*), count(distinct reviewer_key), sum(rating_star is null) from review group by 1").fetchall())
print("run_review by run:", db.execute("select run_id, count(*) from run_review group by 1").fetchall())
print("videos (link_basis):", db.execute("select link_basis, count(*) from video group by 1").fetchall())
print("writer_count shopee (writers, counted_by_review):", db.execute("select writers, counted_by_review from writer_count where platform='shopee' order by writers desc").fetchall())
print("review_point:", db.execute("select kind, count(*) from review_point group by 1").fetchall())
print("coverage (shopee):")
for row in db.execute("select product_name, product_url, reviews_on_platform, reviews_collected, distinct_reviewers from review_coverage where product_key like 'shopee:%' order by reviews_collected desc"):
    print("  ", row[0][:40], row[1], row[2], row[3], row[4])
print("coverage (tiktok_shop, collected>0):", db.execute("select product_key, reviews_collected, distinct_reviewers from review_coverage where product_key like 'tiktok_shop:%' and reviews_collected>0").fetchall())
fk = db.execute("pragma foreign_key_check").fetchall()
print("FK check:", fk)
sys.exit(0 if not fk and refused == len(bad) else 1)
