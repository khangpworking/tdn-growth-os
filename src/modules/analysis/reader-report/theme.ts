// Golden reader-report theme (thạch dừa reader report approved 05/10/2026).
// A new look is a new theme file; layout and metrics code stay unchanged.
export const CSS = `
:root{--bg:#f7f6f2;--card:#fff;--ink:#1d2327;--mute:#5d6870;--line:#e2e0d8;--acc:#0f766e;--acc2:#99d5cc;--gry:#b9b6ad;--warn:#b45309;--warnbg:#fff7e6;--neg:#b42318;--pos:#15803d;--chip:#e6f2f0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14181b;--card:#1c2226;--ink:#e7eaec;--mute:#9aa5ad;--line:#2d3439;--acc:#4fd1c0;--acc2:#2c6d66;--gry:#59606a;--warn:#f0b35a;--warnbg:#2a2215;--neg:#f2867c;--pos:#6fd394;--chip:#1f3431}}
:root[data-theme="dark"]{--bg:#14181b;--card:#1c2226;--ink:#e7eaec;--mute:#9aa5ad;--line:#2d3439;--acc:#4fd1c0;--acc2:#2c6d66;--gry:#59606a;--warn:#f0b35a;--warnbg:#2a2215;--neg:#f2867c;--pos:#6fd394;--chip:#1f3431}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.6 "Be Vietnam Pro","Segoe UI",system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 80px}
header.top h1{font-size:28px;line-height:1.25;margin:0 0 6px}header.top .sub{color:var(--mute);margin:0 0 14px}
.badge{display:inline-block;background:var(--warnbg);color:var(--warn);border:1px solid var(--warn);border-radius:999px;padding:2px 12px;font-size:13px;margin-right:6px}
.box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 22px;margin:18px 0}
.box h3{margin:0 0 8px;font-size:16px}.keys li{margin:6px 0}
nav.toc{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}nav.toc a{font-size:13px;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:3px 9px}
nav.toc a b{color:var(--acc)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 24px;margin:16px 0}
.sh{display:flex;align-items:center;gap:10px}.sid{background:var(--chip);color:var(--acc);font-weight:700;font-size:13px;border-radius:6px;padding:2px 8px}
h2{font-size:19px;margin:0}.ans{font-size:17px;font-weight:600;margin:10px 0 12px;line-height:1.45}
.lim{color:var(--mute);font-size:13.5px;border-top:1px dashed var(--line);padding-top:8px;margin-bottom:0}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin:8px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12.5px;color:var(--mute);font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.chart{margin:8px 0 6px;overflow-x:auto}.chart svg{width:100%;min-width:560px;height:auto}.flint{margin:12px 0}.flint svg{background:#fff;border-radius:8px;max-width:760px;display:block}
@media (max-width:600px){section,.box{padding:16px 14px}.ans{font-size:16px}}figcaption{font-size:12.5px;color:var(--mute)}
.cl{font-size:13px;fill:var(--ink)}.cv{font-size:13px;fill:var(--ink);font-weight:600}.cs{font-size:11.5px;fill:var(--mute);font-weight:400}
.b1{fill:var(--acc)}.b2{fill:var(--gry)}.b3{fill:var(--acc2)}.bneg{fill:var(--neg)}.bpos{fill:var(--pos)}
.grid{stroke:var(--line)}.rng{stroke:var(--acc2);stroke-width:8;stroke-linecap:round}.dot{fill:var(--acc)}
.q{border-left:3px solid var(--acc2);padding:2px 10px;margin:6px 0;font-style:italic}.q small{font-style:normal;color:var(--mute)}
.tag{display:inline-block;font-size:11.5px;border-radius:4px;padding:0 6px;margin:1px 2px;background:var(--chip);color:var(--acc)}
.neg{color:var(--neg)}.pos{color:var(--pos)}.st{font-size:12px;font-weight:600}
details{margin:8px 0}summary{cursor:pointer;color:var(--acc);font-weight:600}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:8px 0}.kpi{border:1px solid var(--line);border-radius:10px;padding:10px 14px}.kpi b{display:block;font-size:24px;color:var(--acc)}.kpi span{font-size:13px;color:var(--mute)}
.ex{margin:18px 0 6px}.exh{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;border-top:2px solid var(--ink);padding-top:6px;margin-bottom:4px}
.exn{font-weight:700;color:var(--acc);font-size:13.5px;white-space:nowrap}.ext{font-weight:700;font-size:15px}.exu{flex-basis:100%;font-size:12.5px;color:var(--mute)}
.ex-src{font-size:12px;color:var(--mute);margin:2px 0 8px;font-style:italic}
.ex-note{font-size:12.5px;color:var(--mute);margin:8px 0 2px;padding-left:10px;border-left:2px solid var(--line)}
.fact{display:flex;gap:14px;align-items:flex-start;background:var(--chip);border:1px solid var(--acc2);border-left:6px solid var(--acc);border-radius:10px;padding:14px 18px;margin:12px 0 26px;font-size:16.5px;line-height:1.55;font-weight:500;color:var(--ink);box-shadow:0 2px 10px rgba(15,118,110,.08);-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid}
.fact>b{flex:none;display:inline-flex;align-items:center;gap:6px;background:var(--acc);color:var(--card);font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 11px 4px 9px;border-radius:999px;margin-top:2px;white-space:nowrap}
.fact>b::before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}
.fact em.n{font-style:normal;font-weight:700;color:var(--acc)}
@media (max-width:640px){.fact{flex-direction:column;gap:8px;padding:12px 14px;font-size:15.5px}}
.ex table{min-width:620px}.ex td:last-child{min-width:12em}
span.n{display:block;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.lead{font-size:15.5px}.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:8px 0}
.scope>div{border:1px solid var(--line);border-radius:10px;padding:10px 14px}.scope span{display:block;font-size:12px;color:var(--mute);text-transform:uppercase;letter-spacing:.04em}.scope b{display:block;font-size:15px}.scope small{color:var(--mute)}
.steps li,.trend li,.notes li{margin:5px 0}.keys small{color:var(--acc);white-space:nowrap}
footer{color:var(--mute);font-size:13px;margin-top:30px}
@media print{body{background:#fff}section,.box{break-inside:avoid}nav.toc{display:none}.ex table{min-width:0;width:100%}.ex td:last-child{min-width:0}table{font-size:12px}th,td{padding:4px 5px}td{overflow-wrap:anywhere}th span.n{white-space:normal}}
`;
export const CSS_COVER = `
.cover{position:relative;isolation:isolate;display:flex;flex-direction:column;justify-content:flex-end;min-height:clamp(520px,80vh,700px);color:#fff;background:#0b2620 center 62%/cover no-repeat}
.cover::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(5,22,18,.94) 0%,rgba(5,22,18,.84) 40%,rgba(5,22,18,.4) 74%,rgba(5,22,18,.18) 100%),linear-gradient(0deg,rgba(5,22,18,.88) 0%,rgba(5,22,18,0) 50%)}
.cover-in{width:100%;max-width:980px;margin:0 auto;padding:56px 16px 18px}
.cover-rule{width:72px;height:5px;background:#4fd1c0;margin:0 0 22px}
.cover h1{font-size:clamp(32px,5.2vw,54px);line-height:1.1;font-weight:800;letter-spacing:-.015em;max-width:12.5em;margin:0 0 18px;text-wrap:balance}
.cover h1 span{display:block}
.cover .cv-k{font-size:clamp(13px,1.6vw,16px);font-weight:700;text-transform:uppercase;letter-spacing:.18em;color:#4fd1c0;margin:0 0 14px}
.cover .cv-m{font-size:clamp(60px,11vw,120px);line-height:.92;font-weight:800;letter-spacing:-.035em;text-shadow:0 4px 28px rgba(0,0,0,.35)}
.cover .cv-p{font-size:clamp(22px,3.2vw,34px);line-height:1.2;font-weight:600;letter-spacing:-.005em;color:#ffd391;margin:16px 0 0}
.cover-meta{;flex-wrap:wrap;list-style:none;padding:0;margin:0 0 22px;font-size:15.5px;color:rgba(255,255,255,.88);font-variant-numeric:tabular-nums}
.cover-meta li:not(:last-child)::after{content:"·";margin:0 10px;color:rgba(255,255,255,.45)}
.cover .badge{background:rgba(5,22,18,.45);color:#ffd391;border-color:rgba(255,211,145,.7);margin:0 6px 6px 0}
.cover-credit{margin:30px 0 0;padding-top:10px;border-top:1px solid rgba(255,255,255,.18);font-size:11.5px;color:rgba(255,255,255,.66)}
.cover-credit a{color:inherit;text-underline-offset:2px}
.mk main{padding-top:36px}
.mk .box{border-radius:4px;border-top:3px solid var(--acc);padding:22px 26px}
.mk .box h3{font-size:12.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--acc);margin:22px 0 8px}.mk .box h3:first-child{margin-top:0}.mk .box>:last-child{margin-bottom:0}
.mk .scope>div{border:0;border-left:3px solid var(--acc2);border-radius:0;padding:2px 0 2px 12px}
.mk nav.toc{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:0 28px;margin:30px 0;padding:10px 0;border-top:2px solid var(--ink);border-bottom:1px solid var(--line)}
.mk nav.toc a{display:flex;gap:12px;background:none;border:0;border-bottom:1px dotted var(--line);border-radius:0;padding:8px 0;font-size:14.5px}
.pl-srclist{margin:4px 0 14px;padding-left:22px}.pl-srclist li{margin:3px 0}
.mk nav.toc a b{min-width:4.4em;white-space:nowrap}.mk nav.toc a:hover{color:var(--acc)}
.mk section{border-radius:4px;padding:30px 34px;margin:24px 0}
.mk .sh{align-items:baseline;gap:14px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.mk .sid{background:var(--acc);color:var(--card);font-size:13px;letter-spacing:.04em;border-radius:3px;padding:3px 9px}
.mk h2{font-size:24px;line-height:1.3;letter-spacing:-.005em;text-wrap:balance}
.mk .ans{font-size:18px;line-height:1.5;border-left:4px solid var(--acc);padding:2px 0 2px 16px;margin:18px 0 18px}
.mk section h3{font-size:16.5px;margin:24px 0 8px}
.mk .grid4{gap:14px 20px}.mk .kpi{border:0;border-top:3px solid var(--acc);border-radius:0;padding:10px 0 4px}
.mk .kpi b{font-size:28px;font-weight:800;letter-spacing:-.01em;line-height:1.25;font-variant-numeric:tabular-nums}
.mk thead th{border-bottom:1.5px solid var(--ink)}.mk tbody tr:hover td{background:var(--chip)}
@media (max-width:600px){.cover{min-height:500px}.cover::before{background:linear-gradient(0deg,rgba(5,22,18,.95) 0%,rgba(5,22,18,.82) 55%,rgba(5,22,18,.45) 100%)}.cover-in{padding-top:40px}.cover-meta{font-size:14.5px}
.mk section,.mk .box{padding:20px 16px}.mk h2{font-size:20px}.mk .ans{font-size:16.5px;padding-left:12px}.mk .kpi b{font-size:24px}.mk .grid4:has(>.kpi){grid-template-columns:repeat(2,minmax(0,1fr))}}
.pl-src{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:12px 0 6px}
.pl-card{border:1px solid var(--line);border-top:3px solid var(--acc);border-radius:4px;padding:14px 16px 12px;background:var(--card)}
.pl-card h4{margin:0 0 8px;font-size:15.5px;line-height:1.35}
.pl-card dl{margin:0;display:grid;gap:2px}.pl-card dt{font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin-top:6px}.pl-card dd{margin:0;font-size:14px;line-height:1.5}
.pl-card dt:nth-of-type(3)+dd{color:var(--warn)}
.pl-off{border-style:dashed;border-top-style:solid;border-top-color:var(--gry);background:transparent}.pl-off h4{color:var(--mute)}
.pl-trace{font-size:14px;color:var(--mute);background:var(--chip);border-radius:4px;padding:10px 14px;margin:10px 0 4px}.pl-trace i{color:var(--ink);overflow-wrap:anywhere}
.ex table.pl-seg{min-width:640px}.pl-seg td:first-child{font-weight:600;width:24%}
.pl-seg tr.core td:first-child{box-shadow:inset 3px 0 0 var(--acc);padding-left:12px}
.pl-seg tr.non td{color:var(--mute)}.pl-seg tr.non td:first-child{box-shadow:inset 3px 0 0 var(--gry);padding-left:12px}
.pl-seg tr.core+tr.non td{border-top:2px solid var(--ink)}
.pl-terms{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:0 24px;margin:10px 0 6px}
.pl-terms>div{border-top:1px solid var(--line);padding:9px 0 10px}.pl-terms dt{font-weight:700;color:var(--acc);font-size:14.5px}.pl-terms dd{margin:2px 0 0;font-size:14px;line-height:1.5}
.mk .box.pl-disc{border-top-color:var(--warn);background:var(--warnbg)}.mk .box.pl-disc h3{color:var(--warn)}
.pl-all{margin:22px 0 4px;border:1px solid var(--line);border-radius:4px}
.pl-all>summary{padding:12px 16px;list-style-position:inside}.pl-all[open]>summary{border-bottom:1px solid var(--line)}
.pl-all .tw{max-height:70vh;overflow:auto}
table.pl-list{min-width:880px;font-size:13px;margin:0}.pl-list th,.pl-list td{padding:5px 8px}
.pl-list thead th{position:sticky;top:0;z-index:1;background:var(--card)}.pl-list tbody tr:nth-child(even) td{background:var(--chip)}
.pl-list td:first-child{white-space:nowrap}.pl-list td:nth-child(2){min-width:9.5em}.pl-list td:last-child{min-width:18em}
@media (max-width:640px){.pl-src{grid-template-columns:1fr}.pl-seg thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.ex table.pl-seg{min-width:0}.pl-seg,.pl-seg tbody,.pl-seg tr,.pl-seg td{display:block;width:auto}
.pl-seg tr{padding:8px 0 8px 12px;border-bottom:1px solid var(--line)}.pl-seg tr.core{box-shadow:inset 3px 0 0 var(--acc)}.pl-seg tr.non{box-shadow:inset 3px 0 0 var(--gry)}
.pl-seg td,.pl-seg tr.core td:first-child,.pl-seg tr.non td:first-child{border:0;padding:2px 0;box-shadow:none;width:auto}.pl-seg tr.core+tr.non{border-top:2px solid var(--ink)}.pl-seg tr.core+tr.non td{border-top:0}
.pl-seg td:not(:first-child)::before{content:attr(data-l);display:block;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)}
.pl-all .tw{max-height:75vh}}
@media print{.cover{min-height:100vh;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}.mk section{border:0;padding:0 0 12px}
.mk section#phu-luc{break-inside:auto}.pl-card,.pl-terms>div,.pl-seg tr,.pl-list tr{break-inside:avoid}.pl-src,.pl-terms{gap:8px 16px}
.pl-all{border:0}.pl-all::details-content{content-visibility:visible;display:block}.pl-all>summary{padding:0 0 6px;list-style:none}.pl-all .tw{max-height:none;overflow:visible}
table.pl-list{min-width:0;font-size:10px}.pl-list thead{display:table-header-group}.pl-list thead th{position:static}.pl-list th,.pl-list td{padding:3px 5px}.pl-list td:nth-child(2){min-width:7em}.pl-list td:last-child{min-width:13em}.pl-list th span.n{white-space:normal}}
`;
// Bổ sung của kit: nhãn sàn, ô tìm trong danh sách sản phẩm, hình SVG tự vẽ.
export const CSS_KIT = `
.plat{display:inline-block;font-size:11.5px;font-weight:700;border-radius:3px;padding:0 6px;margin-right:4px;color:#fff;vertical-align:1px}
.plat.shopee{background:#c2410c}.plat.tiktok{background:#1d2327}
.pl-find{width:100%;max-width:420px;font:inherit;padding:6px 10px;margin:8px 16px;border:1px solid var(--line);border-radius:4px;background:var(--card);color:var(--ink)}
.kc text{font-family:inherit}.kc .ax{font-size:11.5px;fill:var(--mute)}.kc .lb{font-size:12.5px;fill:#1d2327}.kc .vl{font-size:11.5px;fill:#1d2327;font-weight:600}.kc .lg{font-size:12px;fill:#1d2327}
.kc .gl{stroke:#e6e6e6}.kc .bs{stroke:#999}
@media print{.pl-find{display:none}}
`;
