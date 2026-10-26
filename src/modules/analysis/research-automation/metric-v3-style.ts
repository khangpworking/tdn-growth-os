// Layout ported from owner reference build_v3.py; no captured data.
export const V3_STYLE = `
/* Layout: one column decision document. Section label, evidence card, then two boxes (meaning / proposal). */
:root{--bg:#f1f3f0;--surface:#fcfcfb;--surface2:#f4f6f3;--ink:#121a16;--ink2:#444d47;--muted:#667069;--line:#dde2db;--axis:#c2c9c1;--track:#e7eae5;--accent:#1f5a46;--accent-soft:#e2eee8;--accent-line:#bfd9cc;--info-soft:#e9eef5;--info-line:#cfd9e6;--warn-bg:#fdf1d0;--warn-ink:#5b4100;--warn-line:#ecd08a;--shadow:rgba(18,26,22,.08);--c-shopee:#2a78d6;--on-shopee:#ffffff;--c-tiktok:#eb6834;--on-tiktok:#0b0b0b;--c-lazada:#1baf7a;--on-lazada:#0b0b0b;--c-unk:#8f9690;--on-unk:#0b0b0b;--c-g1:#eda100;--on-g1:#0b0b0b;--c-g2:#e87ba4;--on-g2:#0b0b0b;--c-g3:#008300;--on-g3:#ffffff;--c-g4:#4a3aa7;--on-g4:#ffffff;--c-g5:#e34948;--on-g5:#0b0b0b;--c-v:#4a3aa7;--on-v:#ffffff;--font:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Roboto,Arial,sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d100e;--surface:#1a1a19;--surface2:#222421;--ink:#eef2ef;--ink2:#c1c8c2;--muted:#97a099;--line:#2c2f2b;--axis:#3b3f3a;--track:#2b2e2a;--accent:#7fcaa8;--accent-soft:#16261f;--accent-line:#27463a;--info-soft:#1b2230;--info-line:#2d3a50;--warn-bg:#33290f;--warn-ink:#f0d38a;--warn-line:#5a4a1c;--shadow:rgba(0,0,0,.4);--c-shopee:#3987e5;--on-shopee:#0b0b0b;--c-tiktok:#d95926;--on-tiktok:#0b0b0b;--c-lazada:#199e70;--on-lazada:#0b0b0b;--c-unk:#6e756f;--on-unk:#ffffff;--c-g1:#c98500;--on-g1:#0b0b0b;--c-g2:#d55181;--on-g2:#0b0b0b;--c-g3:#008300;--on-g3:#ffffff;--c-g4:#9085e9;--on-g4:#0b0b0b;--c-g5:#e66767;--on-g5:#0b0b0b;--c-v:#9085e9;--on-v:#0b0b0b;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0d100e;--surface:#1a1a19;--surface2:#222421;--ink:#eef2ef;--ink2:#c1c8c2;--muted:#97a099;--line:#2c2f2b;--axis:#3b3f3a;--track:#2b2e2a;--accent:#7fcaa8;--accent-soft:#16261f;--accent-line:#27463a;--info-soft:#1b2230;--info-line:#2d3a50;--warn-bg:#33290f;--warn-ink:#f0d38a;--warn-line:#5a4a1c;--shadow:rgba(0,0,0,.4);--c-shopee:#3987e5;--on-shopee:#0b0b0b;--c-tiktok:#d95926;--on-tiktok:#0b0b0b;--c-lazada:#199e70;--on-lazada:#0b0b0b;--c-unk:#6e756f;--on-unk:#ffffff;--c-g1:#c98500;--on-g1:#0b0b0b;--c-g2:#d55181;--on-g2:#0b0b0b;--c-g3:#008300;--on-g3:#ffffff;--c-g4:#9085e9;--on-g4:#0b0b0b;--c-g5:#e66767;--on-g5:#0b0b0b;--c-v:#9085e9;--on-v:#0b0b0b;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 var(--font)}
.wrap{max-width:1000px;margin-inline:auto;padding-inline:16px;padding-block:20px 56px}
@media(min-width:720px){.wrap{padding-inline:24px}}
a{color:var(--accent);text-underline-offset:2px}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
h1,h2,h3,h4{text-wrap:balance;margin:0}
b{font-weight:650}
/* header */
.top{display:flex;flex-direction:column;gap:14px;padding-block:8px 6px}
.eyebrow{font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);font-weight:650;margin:0}
h1{font-size:clamp(1.55rem,4.6vw,2.3rem);line-height:1.18;font-weight:750;letter-spacing:-.01em;max-width:30ch}
.subt{margin:0;color:var(--ink2);font-size:15.5px;max-width:70ch}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.filters li{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:13px;color:var(--ink2)}
.filters b{color:var(--ink)}
.srcline{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;margin:0;font-size:13.5px;color:var(--muted)}
.btn{font:inherit;font-size:13px;border:1px solid var(--axis);background:var(--surface);color:var(--ink);padding:6px 12px;border-radius:8px;cursor:pointer}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.toc{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.toc a{font-size:13px;text-decoration:none;color:var(--ink2);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:4px 10px}
.toc a b{color:var(--accent);font-weight:650;margin-right:4px}
.toc a:hover{border-color:var(--accent)}
/* sections */
.sec{margin-top:44px;display:flex;flex-direction:column;gap:18px;scroll-margin-top:12px}
.sec-h{display:flex;flex-direction:column;gap:2px}
.sec-no{font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700}
h2{font-size:clamp(1.3rem,3.4vw,1.7rem);line-height:1.22;font-weight:720;letter-spacing:-.005em}
h3.sub{font-size:15px;font-weight:650;margin-top:6px}
/* findings */
.finds{margin:0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:f}
.finds li{counter-increment:f;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px 12px 46px;position:relative;max-width:78ch}
.finds li::before{content:counter(f);position:absolute;left:14px;top:12px;width:22px;height:22px;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:12.5px;display:grid;place-items:center}
.finds a{white-space:nowrap;font-size:13px;margin-left:4px}
.cards3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.pcard{background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.pc-k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);font-weight:700}
.pcard h4{font-size:16px;line-height:1.3;font-weight:700}
.pcard p{margin:0;font-size:14.5px}
.pcard .m,.acts .m{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:4px}
.who,.when{font-size:12.5px;border-radius:999px;padding:2px 10px;border:1px solid var(--accent-line);background:var(--surface);color:var(--ink2);white-space:nowrap}
.who{font-weight:650;color:var(--accent)}
@media(max-width:820px){.cards3{grid-template-columns:1fr}}
/* kpi */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.k-l{font-size:13px;color:var(--ink2)}
.k-v{font-size:clamp(1.7rem,4.5vw,2.3rem);font-weight:750;line-height:1.1;letter-spacing:-.01em}
.warnchip{display:inline-flex;align-items:center;gap:5px;background:var(--warn-bg);color:var(--warn-ink);border:1px solid var(--warn-line);border-radius:6px;padding:2px 8px;font-size:12.5px;line-height:1.4}
.warnchip .ic{flex:none}
.kpi-note{display:flex;align-items:flex-start;gap:6px;margin:-6px 0 0;font-size:13.5px;color:var(--ink2)}
.kpi-note .ic{flex:none;margin-top:4px;color:var(--warn-ink)}
@media(max-width:820px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
/* figure card */
.fig{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0;box-shadow:0 1px 2px var(--shadow)}
.fig figcaption{margin-bottom:12px}
.fig h3{font-size:15.5px;font-weight:680}
.fig figcaption p{margin:2px 0 0;font-size:13.5px;color:var(--muted);max-width:78ch}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:8px;font-size:13px;color:var(--ink2)}
.pl{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none}
.sw-none{background:transparent;border:1.5px solid var(--axis)}
.pl.line .sw{width:16px;height:3px;border-radius:2px}
.cap{margin:8px 0 0;font-size:12.5px;color:var(--muted)}
.notes{margin:12px 0 0;padding-left:18px;font-size:13.5px;color:var(--ink2);display:grid;gap:4px;max-width:80ch}
/* charts */
.chart{display:block;width:100%;height:auto;overflow:visible}
.chart text{font-family:var(--font);fill:var(--ink2)}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .axis{stroke:var(--axis);stroke-width:1}
.chart .tick{fill:var(--muted)}
.chart .axt{fill:var(--muted)}
.chart .rl{fill:var(--ink2)}
.chart .val{fill:var(--ink);font-weight:650;font-variant-numeric:tabular-nums}
.chart .seglab{font-weight:650}
.chart.donut .seglab{font-size:12px}
.chart .trk{stroke:var(--track)}
.chart .dc-top{fill:var(--ink);font-size:25px;font-weight:750}
.chart .dc-bot{fill:var(--muted);font-size:12px}
.chart .ln{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.chart .s-shopee{stroke:var(--c-shopee)}.chart .s-tiktok{stroke:var(--c-tiktok)}.chart .s-lazada{stroke:var(--c-lazada)}
.chart .dot{stroke:var(--surface);stroke-width:2}
.chart .ann{fill:var(--ink);font-weight:650}
.chart .ann2{fill:var(--muted)}
.chart .endl{fill:var(--ink2);font-weight:600}
.chart .lead{stroke:var(--muted);stroke-width:1}
.chart .cross{stroke:var(--muted);stroke-width:1}
.chart .hit{touch-action:pan-y}
.f-shopee{fill:var(--c-shopee)}.sw-shopee{background:var(--c-shopee)}.chart text.t-on-shopee{fill:var(--on-shopee)}.bg-shopee{background:var(--c-shopee)}.f-tiktok{fill:var(--c-tiktok)}.sw-tiktok{background:var(--c-tiktok)}.chart text.t-on-tiktok{fill:var(--on-tiktok)}.bg-tiktok{background:var(--c-tiktok)}.f-lazada{fill:var(--c-lazada)}.sw-lazada{background:var(--c-lazada)}.chart text.t-on-lazada{fill:var(--on-lazada)}.bg-lazada{background:var(--c-lazada)}.f-unk{fill:var(--c-unk)}.sw-unk{background:var(--c-unk)}.chart text.t-on-unk{fill:var(--on-unk)}.bg-unk{background:var(--c-unk)}.f-g1{fill:var(--c-g1)}.sw-g1{background:var(--c-g1)}.chart text.t-on-g1{fill:var(--on-g1)}.bg-g1{background:var(--c-g1)}.f-g2{fill:var(--c-g2)}.sw-g2{background:var(--c-g2)}.chart text.t-on-g2{fill:var(--on-g2)}.bg-g2{background:var(--c-g2)}.f-g3{fill:var(--c-g3)}.sw-g3{background:var(--c-g3)}.chart text.t-on-g3{fill:var(--on-g3)}.bg-g3{background:var(--c-g3)}.f-g4{fill:var(--c-g4)}.sw-g4{background:var(--c-g4)}.chart text.t-on-g4{fill:var(--on-g4)}.bg-g4{background:var(--c-g4)}.f-g5{fill:var(--c-g5)}.sw-g5{background:var(--c-g5)}.chart text.t-on-g5{fill:var(--on-g5)}.bg-g5{background:var(--c-g5)}.f-v{fill:var(--c-v)}.sw-v{background:var(--c-v)}.chart text.t-on-v{fill:var(--on-v)}.bg-v{background:var(--c-v)}
.pl.line .sw-shopee,.pl.line .sw-tiktok,.pl.line .sw-lazada{}
.v-wide{display:block}.v-wide .chart{max-width:780px}
.v-narrow{display:none}.v-narrow .chart{max-width:460px;margin-inline:auto}
@media(max-width:700px){.v-wide{display:none}.v-narrow{display:block}}
.split{display:grid;grid-template-columns:minmax(0,250px) minmax(0,1fr);gap:20px;align-items:center}
.donutbox{max-width:250px;margin-inline:auto;width:100%}
@media(max-width:700px){.split{grid-template-columns:1fr}}
.lc-wrap{position:relative}
.tip{position:absolute;top:6px;z-index:2;pointer-events:none;background:var(--surface);color:var(--ink);border:1px solid var(--axis);border-radius:8px;padding:6px 10px;font-size:12.5px;line-height:1.45;box-shadow:0 4px 14px var(--shadow);white-space:nowrap;transform:translateX(-50%)}
.tip b{display:block;font-size:12px;color:var(--muted);font-weight:600}
.tip i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}
/* tables */
.tablewrap{overflow-x:auto;max-width:100%}
.tablewrap.scroll{max-height:320px;overflow:auto}
.t{width:100%;border-collapse:collapse;font-size:14px}
.t th{text-align:left;font-weight:650;font-size:12.5px;color:var(--ink2);padding:8px 10px;border-bottom:1px solid var(--axis);white-space:nowrap;background:var(--surface);position:sticky;top:0}
.t td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.t tr:last-child td{border-bottom:0}
.t .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.t .dim{color:var(--muted)}
.t.compact td,.t.compact th{padding:5px 10px}
.cellbar{display:flex;flex-direction:column;gap:4px;min-width:150px}
.cb-n{font-variant-numeric:tabular-nums}
.cb-b{display:block;height:6px;border-radius:0 3px 3px 0;min-width:2px}
details.twin{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
details.twin summary{cursor:pointer;font-size:13.5px;color:var(--accent);font-weight:600}
details.twin[open] summary{margin-bottom:8px}
/* meters + mini tiles */
.mrow{margin-top:14px;display:flex;flex-direction:column;gap:6px}
.ml{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 16px;font-size:13.5px;color:var(--ink2)}
.ml b{color:var(--ink)}
.meter{display:flex;gap:2px;height:14px}
.meter span{display:block;min-width:3px}
.meter span:first-child{border-radius:4px 0 0 4px}.meter span:last-child{border-radius:0 4px 4px 0}
.m-a{background:var(--c-v)}.m-b{background:var(--track)}
.mini2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mini{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column}
.mn{font-size:clamp(1.5rem,4vw,2rem);font-weight:750;line-height:1.15}
.ml2{font-size:13.5px;color:var(--ink2)}
.mini2+.mrow{margin-bottom:14px}
/* boxes */
.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}
.box{border-radius:12px;padding:16px;min-width:0;border:1px solid}
.box h3{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;margin-bottom:8px}
.box .ic{flex:none}
.box ul{margin:0;padding-left:18px;display:grid;gap:7px}
.box.mean{background:var(--info-soft);border-color:var(--info-line)}
.box.mean h3{color:var(--ink)}
.box.prop{background:var(--accent-soft);border-color:var(--accent-line)}
.box.prop h3{color:var(--accent)}
.acts{list-style:none;padding-left:0!important;gap:12px!important}
.acts li{display:flex;flex-direction:column;gap:6px;padding-bottom:12px;border-bottom:1px solid var(--accent-line)}
.acts li:last-child{border-bottom:0;padding-bottom:0}
.acts .a{margin:0}
.acts .m{margin-top:0;padding-top:0;display:flex;flex-wrap:wrap;gap:6px}
.box .note{margin:12px 0 0;font-size:12.5px;color:var(--muted)}
@media(max-width:820px){.pair{grid-template-columns:1fr}}
.foot-notes{margin:0;padding-left:20px;display:grid;gap:8px;max-width:84ch;color:var(--ink2)}
.foot{margin-top:48px;padding-top:16px;border-top:1px solid var(--axis);font-size:13px;color:var(--muted)}
.dim{color:var(--muted)}
@media print{
  :root:root{--bg:#f1f3f0;--surface:#fcfcfb;--surface2:#f4f6f3;--ink:#121a16;--ink2:#444d47;--muted:#667069;--line:#dde2db;--axis:#c2c9c1;--track:#e7eae5;--accent:#1f5a46;--accent-soft:#e2eee8;--accent-line:#bfd9cc;--info-soft:#e9eef5;--info-line:#cfd9e6;--warn-bg:#fdf1d0;--warn-ink:#5b4100;--warn-line:#ecd08a;--shadow:rgba(18,26,22,.08);--c-shopee:#2a78d6;--on-shopee:#ffffff;--c-tiktok:#eb6834;--on-tiktok:#0b0b0b;--c-lazada:#1baf7a;--on-lazada:#0b0b0b;--c-unk:#8f9690;--on-unk:#0b0b0b;--c-g1:#eda100;--on-g1:#0b0b0b;--c-g2:#e87ba4;--on-g2:#0b0b0b;--c-g3:#008300;--on-g3:#ffffff;--c-g4:#4a3aa7;--on-g4:#ffffff;--c-g5:#e34948;--on-g5:#0b0b0b;--c-v:#4a3aa7;--on-v:#ffffff;color-scheme:light}
  body{background:#fff;font-size:12.5px}
  .no-print{display:none!important}
  .wrap{max-width:none;padding-inline:0}
  .fig,.box,.kpi,.pcard,.finds li{box-shadow:none;break-inside:avoid}
  .sec{break-before:auto}
  .v-wide{display:block!important}.v-narrow{display:none!important}
  .tablewrap{overflow:visible}.tablewrap.scroll{max-height:none}
  .t th{position:static}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
.pv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pv .kpi h3{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700}
.pv dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:14px}
.pv dt{color:var(--ink2)}.pv dd{margin:0;text-align:right;font-weight:650;font-variant-numeric:tabular-nums}
.pv .big{font-size:clamp(1.6rem,4.2vw,2.1rem);font-weight:750;line-height:1.1}
.lab{font-size:12px;color:var(--muted)}
.pv.tot{grid-template-columns:1fr;margin-bottom:12px}.pv.tot dl{max-width:560px}.tag.all{background:var(--ink);color:var(--bg)}
.lc-wrap{overflow-x:auto}.lc{display:block;width:100%;min-width:620px;height:auto}
.lc-grid{stroke:var(--line);stroke-width:1}.lc-ax{font-size:12px;fill:var(--ink2)}.lc-v{font-size:11.5px;fill:var(--ink);font-weight:650}
.lc-line{fill:none;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.lc-line.dash{stroke-dasharray:5 5}
.lc-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;margin:4px 0 6px}.lc-k{display:inline-flex;align-items:center;gap:6px}
.lc-k i{display:inline-block;width:18px;height:3px;border-radius:2px}.lc-k i.dash{background:repeating-linear-gradient(90deg,var(--ink2) 0 5px,transparent 5px 9px)}
.stk{display:flex;height:12px;border-radius:4px;overflow:hidden;min-width:140px;background:var(--surface2)}.stk-r{background:var(--line)}
.code{font-size:11.5px;font-family:ui-monospace,Consolas,monospace;border:1px solid var(--line);border-radius:5px;padding:1px 6px;color:var(--ink2);background:var(--surface2);white-space:nowrap}
.tag{display:inline-block;font-size:11.5px;border-radius:5px;padding:1px 7px;white-space:nowrap;font-weight:650}
.tag.shopee{background:var(--c-shopee);color:var(--on-shopee)}.tag.tiktok{background:var(--c-tiktok);color:var(--on-tiktok)}
.chg{font-size:12px;font-weight:650;margin-left:6px;white-space:nowrap;color:var(--ink2)}.chg.dn{color:var(--warn-ink)}
.ref{font-size:12px;font-weight:400;color:var(--ink2);margin-left:4px}.finds .det{display:block;font-size:14px;color:var(--ink2);margin-top:3px}.finds .det b,.finds .fsub b{color:var(--ink)}.finds .fsub{margin:4px 0 0;padding-left:18px;list-style:disc;font-size:14px;color:var(--ink2)}.finds .fsub li{counter-increment:none;background:none;border:0;border-radius:0;padding:0;margin:2px 0;max-width:none}.finds .fsub li::before{content:none}.k-ref{font-size:12px;color:var(--ink2);margin:8px 0 0}
.mucluc{margin-top:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.mucluc h2{font-size:15px;font-weight:700;margin:0 0 8px;letter-spacing:0}
.mucluc ol{list-style:none;margin:0;padding:0;columns:2;column-gap:28px}
.mucluc li{break-inside:avoid;padding:5px 0;border-top:1px solid var(--line)}
.mucluc li:first-child{border-top:0}
.mucluc a{text-decoration:none;color:var(--ink);font-weight:650;font-size:14.5px}
.mucluc a:hover{color:var(--accent)}
.mucluc a b{color:var(--accent);font-weight:700;margin-right:6px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase}
.mucluc span{display:block;font-size:12.5px;color:var(--ink2);margin-top:1px}
@media(max-width:700px){.mucluc ol{columns:1}}
@media print{.mucluc{break-inside:avoid}}
@media(max-width:700px){.pv{grid-template-columns:1fr}}
.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 22px}
@media(max-width:760px){.two{grid-template-columns:1fr}}
.panel{min-width:0}.panel h4{font-size:13.5px;font-weight:700;margin:0 0 10px;color:var(--ink2)}
.hb{display:grid;gap:9px}
.hb-r{display:grid;grid-template-columns:minmax(0,10em) minmax(0,1fr);gap:2px 10px;align-items:center;border-radius:6px}
.hb-r:hover{background:var(--surface2)}
.hb-l{font-size:13px;line-height:1.3;color:var(--ink);min-width:0;overflow-wrap:anywhere}
.hb-l small{display:block;color:var(--muted);font-size:11.5px}
.hb-t{display:flex;flex-direction:column;gap:2px;min-width:0}
.hb-b{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;min-height:13px}
.hb-b i{display:block;height:12px;border-radius:0 4px 4px 0;min-width:2px;flex:none}
.hb-b span{font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
.hb-b span .chg{margin-left:4px}
.hb.wide .hb-r{grid-template-columns:minmax(0,15em) minmax(0,1fr)}
@media(max-width:520px){.hb-r,.hb.wide .hb-r{grid-template-columns:1fr}}
.stk2{display:flex;gap:2px;height:26px}
.stk2 i{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:12px;font-weight:650;min-width:2px;white-space:nowrap;overflow:hidden}
.stk2 i:first-child{border-radius:4px 0 0 4px}.stk2 i:last-child{border-radius:0 4px 4px 0}
.t-on-g4{color:var(--on-g4)}.t-on-g1{color:var(--on-g1)}.t-on-shopee{color:var(--on-shopee)}.t-on-tiktok{color:var(--on-tiktok)}
.bg-acc{background:var(--accent)}
.kp-h{font-size:13.5px;font-weight:700;color:var(--ink2);margin:4px 0 -6px}
.kpi .chg{margin-left:0}.kpi .ref{margin-left:0;display:block}
.take{margin:12px 0 0;font-size:14px;color:var(--ink);padding-left:12px;border-left:3px solid var(--accent-line)}
.take b{font-weight:700}
.ftip{position:fixed;z-index:9;pointer-events:none;background:var(--surface);color:var(--ink);border:1px solid var(--axis);border-radius:8px;padding:6px 10px;font-size:12.5px;line-height:1.45;box-shadow:0 4px 14px var(--shadow);max-width:280px;transform:translate(-50%,calc(-100% - 12px));display:none}
.chart .hit{fill:transparent}.chart .hit:hover{fill:var(--track);fill-opacity:.5}
.chart .dash{stroke-dasharray:5 5}
.finds .det{display:block;font-size:14px;color:var(--ink2);margin-top:3px}
.ref{font-size:12px;font-weight:400;color:var(--ink2);margin-left:4px}
.chg{font-size:12px;font-weight:650;margin-left:6px;white-space:nowrap;color:var(--ink2)}.chg.dn{color:var(--warn-ink)}
.mucluc{margin-top:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.mucluc h2{font-size:15px;font-weight:700;margin:0 0 8px;letter-spacing:0}
.mucluc ol{list-style:none;margin:0;padding:0;columns:2;column-gap:28px}
.mucluc li{break-inside:avoid;padding:5px 0;border-top:1px solid var(--line)}
.mucluc li:first-child{border-top:0}
.mucluc a{text-decoration:none;color:var(--ink);font-weight:650;font-size:14.5px}
.mucluc a b{color:var(--accent);font-weight:700;margin-right:6px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase}
.mucluc span{display:block;font-size:12.5px;color:var(--ink2);margin-top:1px}
@media(max-width:700px){.mucluc ol{columns:1}}
@media print{.v-narrow{display:none!important}.v-wide{display:block!important}.fig,.mucluc{break-inside:avoid}.ftip{display:none!important}}
`;
