# Shopee desktop: saved Metric configuration and compact M3 collection status

Owner scope, 2026-11-11. This follows the Vietnamese desktop feedback task in
PR460. B7 here is the feedback item about collection counts, not the Growth OS
business workflow stage with the same name.

## User-visible contract

New desktop runs save one inclusive start/end interval. The form offers
30 days, 365 days and Custom; editing either date switches to Custom. Presets
resolve to concrete dates on the desktop before creation. Execution uses those
saved dates, not a new relative date calculation. The default ends on the last
completed desktop-local calendar day. The existing legacy two-period requests
retain their original interpretation and remain readable.

M1 uses Shopee, Lazada, Tiki and TikTok. M2 selects only Shopee links in the
new run's selected interval; M3 collects only Shopee comments. This task does
not add marketplace selection.

The confirmed Metric input includes effective keywords, selected health
groups, shop types and filter values. Defaults enable smart search, abnormal,
gift and deleted-product filters, Mall and regular shops, and the four named
health groups. AI normalization, category customization and smart exclusion
default off. Unrelated advanced comparison settings are preserved. Empty shop
or group selections are invalid rather than being silently replaced by defaults.

Creating a run and starting collection remain separate actions. A successful
creation locks the form; "Tạo lượt khác" starts another draft without deleting
history. The run's existing first-start naming rule remains unchanged.

## M1 admission and saved configuration review

The input confirmation reads:

> Thông tin bạn nhập đã được nạp chính xác vào capture specs.

This means all required saved-spec checks passed. Missing or malformed specs
or disagreement with the confirmed keywords, platforms, groups, filters, shops
or exact dates must prevent a fresh M1 dispatch. Launch validates current saved
inputs again; a prior entry result cannot authorize drifted inputs. Existing
historical/manual entry records remain historical and cannot supply a successful
current spec confirmation when their specs are absent.

M3 collection policy checks remain enforced separately. The operational
read-only guard remains enforced and is displayed as "Hệ thống đang tạm dừng
lấy dữ liệu." It is distinct from a busy/conflicting process.

"Xem thông tin đã ghi trong capture specs" reads the selected run's actual
stored capture spec, with run identity and request/spec digests. It does not
rebuild configuration from the current product profile or form. Product display
name is separate from the keywords actually sent to Metric. The readable table
includes platforms, dates, categories, filters, shops and other execution
settings; nested "Xem JSON gốc" exposes the saved JSON. Missing/invalid data,
loading and errors remain explicit. Switching A→B→A invalidates earlier reads;
raw values are escaped as text. Viewing performs no capture or mutation.

## Version and execution boundaries

The new optional confirmed `metricInput` in request-v2 marks the selected-window
path and is checked against capture-spec-v3. Legacy request-v1/v2 and
capture-spec-v1/v2 retain their existing semantics. A partial new input is not
silently treated as legacy. The new manifest version carries the selected
window through M1 to M2; selection cannot fall back to 30d or another raw source.

Acquisition dates and chart aggregation are separate: the selected-window
path retains seven-day trend aggregation. Unselectable dates must fail instead
of being shifted to a nearby supported interval. Category customization has a
verified-DOM path; the existing page-request fallback cannot represent it and
must refuse before submission when that option is enabled. The separate web
Market report pipeline retains its two-period contract and rejects the new
single-window configuration at admission. This change targets the Shopee
desktop/module path, not that report pipeline.

Spec review hashes the exact saved JSON member text and labels that digest
basis. Executor material may be serialized separately and has its own digest;
the two digest meanings must not be conflated.

## Compact B7 status

The collection summary reports observed counts and how many links reached
their requested quantity, for example:

> Đã thu 308 bình luận · 1/5 link đạt số lượng đặt

This example is synthetic acceptance data. Per-link counts and recorded stop
reasons distinguish a small available result from timeout or page limits.
Unknown counts are not zero, and exhausted supply is never inferred merely
from a shortfall. Running observations use running language. Terminal partial
or failed attempts can expose validated observed counts without granting
permission to use/export their data. All summaries remain bound to their exact
run/attempt or explicitly selected stored source, never pooled across history.

The M3 PASS label is "Đạt kiểm tra dữ liệu". It does not assert statistical
sufficiency or representativeness. M3 gates, collector behavior, ordering,
quotas, minimum counts and save/export eligibility are unchanged.

## Verification and release boundary

Focused verification covers exact date/options round trips, malformed or
mismatched capture specs blocking dispatch, same-window M1/M2 routing, legacy
compatibility, saved-spec selection races, form locking and B7 partial/unknown
counts. Each regression is owned at a meaningful behavior boundary; UI/API
mocks are not evidence that live Metric accepted a configuration.

Synthetic headless rendering checks the changed desktop surfaces. Native
Windows and real Metric verification require separately recorded evidence.
No live Metric/Shopee run or deployment is authorized by this implementation
task. Merge requires CI success and Astra medium approval of the exact commit.
Other business success gates and skill separation remain pending.


## Boundary corrections from exact-head review

- M2 replays the real capture producer's semantic validation for applied membership. Equivalent platform/category/shop/keyword/exclusion sets may be observed in a different DOM order; missing, duplicate, foreign or mislabeled members remain invalid. Exact artifact hashes, window dates and order-sensitive source/reference data are still checked.
- The supported deployment is the owner's current Windows machine in Asia/Bangkok (UTC+07). New single-window CLI creation uses that explicit completed-day boundary rather than Fedora's process-local date. The desktop bridge retains its local completed-day check. There is no caller-provided clock, no timezone configuration change, and no shifting/recomputing of saved dates. Moving the app to another timezone requires revisiting this policy; general multi-timezone support is not claimed.
- Legacy direct CLI creation without the new startDate/metricOptions wire keeps its existing two-window semantics. Read-only history is not rewritten by this correction.
