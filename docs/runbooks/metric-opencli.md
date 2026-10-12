# Metric through OpenCLI

This runbook records the P6-01 setup used by the Metric adapter. The pinned
OpenCLI package is `@jackwener/opencli@1.8.8` with npm integrity
`sha512-T0rp89sVWMKdnQHoYwkRDuACy7k/lCvVScOZmpqnBhd1AnXG6XLYSYO6U0D/Zdj8qq9kQqgop3qmElNcbMr+sw==`.

The OpenCLI Chrome extension is version 1.0.24. Its granted permissions are:
`debugger`, `tabs`, `cookies`, `activeTab`, `alarms`, `storage`, `tabGroups`,
and `downloads`; its host permission is `<all_urls>`.

`opencli doctor` completed successfully: daemon 1.8.8 running, extension
1.0.24 connected, and connectivity OK. `ss -ltnp` verified that the daemon has
a loopback-only listener; there is no non-loopback listener.

To restart the daemon after a service or bridge interruption, run:

```text
opencli daemon restart
opencli doctor
```

The Metric adapter is kept in `tools/opencli-metric/`. OpenCLI 1.8.8 loads user
adapters from its user `clis/metric/` directory; the reviewed adapter and its
parser were installed there for discovery. The installed copy must remain the
same bytes as the repository copy. The executor checks the pinned adapter
manifest digest before every run.

The adapter opens an ephemeral tab on the Metric domain and closes that tab in
all success and failure paths. It does not inspect cookies, passwords, history,
or tabs it did not create. Search and capture are disabled by the executor
unless `TDN_METRIC_OPENCLI_ENABLED` is exactly `1`.

