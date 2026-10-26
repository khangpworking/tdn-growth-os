# Frozen v1 report fixture

`report-v1.json` contains exact HTML, number trace, trace gate and synthetic
opening emitted by the unmodified `metric-v3-report.ts` and stylesheet at
`origin/main` revision `43a5c183fb5597e4e1de0fd05247e2c00469e3d5`.
It was generated offline with `renderV3Report`, using the `capture()` helper
and synthetic `model` in `tests/unit/metric-v3-report.test.ts`.
The helper fixes each window capture ID so manifest identities remain stable.
No provider or external model was called; the original renderer was loaded
from a temporary adjacent module with its stylesheet import pointed at the
unchanged v1 stylesheet. The temporary generator was removed after capture.

The regression installs these historical bytes into an otherwise real service
run with the same synthetic capture, preserving its run/source identity. Only
the disposable test database's immutable-update triggers are removed for this
fixture installation and deliberate corruption cases. It checks fresh service
reads, HTTP delivery and (when configured) Reader PDF downloads. Do not regenerate
this fixture with the current renderer: its purpose is compatibility with
already retained v1 bytes.
