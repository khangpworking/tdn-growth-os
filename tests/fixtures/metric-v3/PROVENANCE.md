# Metric v3 form fixture provenance

The overview markup in `form.html`, `form.en.html`, and `form.vi.html` is a
synthetic-value fixture shaped from publicly served Metric frontend assets.
Values in the fixtures are synthetic; only the selector structure and exact
EN/VI labels come from the public source.

Retrieved 2026-11-10 with anonymous HTTP GET only: no cookies, auth headers,
browser/OpenCLI, API calls, downloaded-JS execution, hydration, login, or
challenge bypass. Assets were stored privately outside this repository; they
are not vendored here.

## Public sources

| Asset | URL | SHA-256 |
| --- | --- | --- |
| Analytics page | https://metric.vn/analytics | `e5965ef2c5204a13691d8ba59bf8e9495683e9765f2aa6341ba0f828c5c34e7a` |
| Analytics route | https://metric.vn/metric_nuxt/PaC8bklQ.js | `ab753c7f2f83aeddb6d2322619de45afbceb280bf58b23dd747fcfef7a74e2fb` |
| Overview components | https://metric.vn/metric_nuxt/BxvszEY6.js | `c2fd71c82863615ba478c4686f2edbce8640465b200dfb70a97cd5259042d11d` |
| Explanation tooltip | https://metric.vn/metric_nuxt/Js0CxgB1.js | `131e60b2886ff7957e2b1d5d92b58ec02b0e7f6d44190218b099d3ff4506a6e1` |
| English locale | https://metric.vn/metric_nuxt/DLYv3AAW.js | `c534add54f99d624bfbd94591553dcbc01a61eba36adc724b48cf085d1edb292` |
| Vietnamese locale | https://metric.vn/metric_nuxt/DbXjzP8d.js | `98de259df0632ef73a05ed2753385ddf93a09525c9de458ac9892d4405d7eaef` |
| SummaryStatistic CSS | https://metric.vn/metric_nuxt/SummaryStatistic.C6Q0bOLy.css | `081bc24b7c0569302ad065c855af809dcfbb8f50045d4e73904900d33ce8ccfd` |

## Observed contract

- Overview root: `.market-overview-section`
- Heading: direct child `.section-header > h3.section-title`
- Cards: `.SummaryStatistic > .statistic-cards > .statistic-card--revenue`,
  `--order`, `--product`, `--shop`
- Card title: `.statistic-card__header-content > .statistic-card__title`
- Tooltip trigger: `.statistic-card__title > .explanation-icon > svg`; the
  `ExplanationTooltip` component renders it through `a-popover` with
  `overlayClassName="explanation-tooltip"`.
- Card value: `.statistic-card__value`
- `.statistic-item__title` belongs to `DeepViewPopup`, not the overview.

Exact overview labels:

- EN `Market Overview`; VI `Tổng quan thị trường`
- EN `Revenue (VNĐ)`, `Sold products`, `Products`, `Shops`
- VI `Doanh số (VNĐ)`, `Lượt bán`, `Sản phẩm có lượt bán`, `Gian hàng có lượt bán`

The fixtures include the tooltip trigger icon but not the popover content, so
KPI evidence stays limited to the displayed card labels and values.
