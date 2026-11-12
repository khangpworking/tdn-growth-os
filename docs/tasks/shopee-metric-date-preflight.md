# Metric calendar check before desktop run creation

Owner-authorized correction after the exact selected period ended on an unavailable Metric date. A completed calendar day is not necessarily selectable in Metric.

On the explicit Create action, the desktop bridge validates the current draft, calls the existing calendar-only availability resolver once, and creates the run only if its exact requested end date is available. It returns requestedEndDate and lastSelectableDate when unavailable; no run is created, dates stay editable and are never shifted automatically. Login, guard, timeout or calendar failures also prevent creation. No background checks/retries or cross-run cache.

CLI `metric-date-availability --end-date YYYY-MM-DD` supplies the observation to the bridge's private `_metric_date_availability` helper. UI Create uses only `newRun(input)`, which owns the preflight; there is no standalone public calendar method. Only explicit-date desktop runs use the new check. Direct CLI new-run and legacy creation retain their prior semantics. M1 still revalidates the saved exact spec/date window and source controls when launched. M2/M3 and history are unchanged.

The resolver uses its existing browser lock and closes only its own calendar tab. It never presses Analyze, captures products/reviews, writes a run/capture/DB, or grants permission to launch M1. READONLY blocks this browser interaction before spawn. Scoped transport deadlines are resolver90s + existing cleanup10s, CLI120s, bridge150s; other configured action deadlines remain unchanged.

Implementation: scripts/metric-date-availability.ts, skills/tdn-shopee-flow/scripts/shopee_flow.py and tools/shopee-desktop/tdn_shopee_app.py. Validation uses offline synthetic fixtures owned by the independent test writer. This code task does not authorize any live calendar/source call or production change. Failed run logs remain intact.
