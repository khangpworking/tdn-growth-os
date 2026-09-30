// Static CSS for the report-kit look. Bundled fonts are supplied separately;
// this theme never imports remote styles, scripts or images.
export const REPORT_KIT_FONT_STACK = "Montserrat,'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif";

export const REPORT_KIT_CSS = `
:root{color-scheme:light;--ink:#262838;--navy:#232E7A;--deep:#1B1D3A;--blue:#3F4FC1;--lblue:#8E99E0;--yellow:#FFC800;--amber:#F2B600;--grey:#A5A8B8;--bd:#D9DCEB;--th:#EEF0FA;--row:#E3E5F0;--mut:#5C5F73;--rule:#FFF6D1;--canvas:#E6E9F5;--warn-bg:#FFF1E2;--warn-ink:#8A4B00;--i-bg:#F3F6FA;--i-ink:#0B1F44;--i-navy:#0B2A5C;--i-cyan:#059ED9;--i-cyan-ink:#04688F;--i-orange:#F7931E;--i-mut:#4F607B;--ok-bg:#E7F5EE;--ok-ink:#0C6A42;--dash:#9AA6B8}
*{box-sizing:border-box}html{scroll-padding-top:16px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.6 Montserrat,'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;overflow-wrap:break-word}
a{color:var(--blue);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--blue);outline-offset:3px}
.skip{position:absolute;left:12px;top:-80px;padding:12px;background:#fff;z-index:10}.skip:focus{top:12px}
code{font:12.5px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
small{color:var(--mut)}
main{max-width:1120px;margin:0 auto;padding:24px 16px 48px}
.brand{display:inline-flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.02em;font-size:14px;color:var(--blue);white-space:nowrap}
.brand i{display:inline-block;width:14px;height:14px;background:var(--yellow);transform:rotate(45deg)}
.brand b{color:var(--ink);font-weight:700}
.cover{position:relative;overflow:hidden;background:#fff;border:1px solid var(--bd);min-height:min(92vh,760px);display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:0}
.cover:before{content:"";position:absolute;inset:0;background:var(--blue);clip-path:polygon(64% 0,100% 0,100% 100%,42% 100%)}
.cover:after{content:"";position:absolute;inset:0;background:var(--yellow);clip-path:polygon(61.5% 0,64% 0,42% 100%,39.6% 100%)}
.cover>*{position:relative;z-index:1}
.cv-left{padding:32px 32px 32px 40px;display:flex;flex-direction:column;gap:28px;justify-content:space-between}
.cv-eyebrow{margin:0;color:var(--blue);font-weight:700;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
.cv-left h1{margin:8px 0 0;font-size:clamp(28px,5vw,46px);line-height:1.12;font-weight:800;text-transform:uppercase;color:var(--deep);text-wrap:balance}
.cv-lede{margin:0;max-width:34ch;font-style:italic;font-weight:600;color:var(--blue);font-size:16px}
.cv-meta{border-left:4px solid var(--yellow);padding:2px 0 2px 14px;font-size:13px}
.cv-meta b{display:block;font-size:22px;font-weight:800;color:var(--deep);margin:2px 0}
.cv-meta span{display:block;color:var(--mut)}
.cv-kpi strong{display:block;font-size:clamp(34px,6vw,54px);line-height:1;font-weight:800;color:var(--blue)}
.cv-kpi span{display:block;max-width:38ch;margin-top:6px;font-size:13px;color:var(--mut)}
.cv-right{padding:32px 40px 32px 0;display:flex;flex-direction:column;justify-content:center;color:#fff;padding-left:14%}
.cv-right h2{margin:0 0 14px;color:var(--yellow);font-size:13px;letter-spacing:.2em;text-transform:uppercase;font-weight:800}
.toc{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.toc a{color:#fff;text-decoration:none;font-weight:700;font-size:14px;display:flex;gap:12px;align-items:baseline;min-height:32px}
.toc a:hover,.toc a:focus-visible{text-decoration:underline}
.toc a:focus-visible{outline-color:#fff}
.toc em{font-style:normal;color:var(--yellow);font-weight:800;min-width:24px}
.toc small{display:block;color:#DDE1FA;font-weight:500;font-size:12px}
.jump{display:flex;flex-wrap:wrap;gap:4px 16px;margin:16px 0 0;padding:0;list-style:none}
.jump a{display:inline-flex;align-items:center;min-height:44px;font-weight:600;font-size:13px}
.part-title{margin:40px 0 16px}
.part-title .pt{margin:0;font-size:12px;color:var(--blue);font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.part-title h2{margin:2px 0 4px;font-size:clamp(22px,3.4vw,30px);line-height:1.2;font-weight:800;color:var(--deep)}
.part-title p{margin:0;max-width:75ch;color:var(--mut)}
.sheet{position:relative;background:#fff;border:1px solid var(--bd);margin:0 0 24px;padding:28px 36px 64px}
.sheet:after{content:"";position:absolute;right:0;bottom:0;width:64px;height:64px;background:var(--yellow);clip-path:polygon(100% 0,100% 100%,0 100%)}
.sh-head{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:flex-start;justify-content:space-between;margin-bottom:18px}
.sh-head h3{margin:0;font-size:clamp(22px,3vw,28px);line-height:1.2;font-weight:800;color:var(--ink);text-wrap:balance}
.sh-id{display:block;font-size:12px;font-weight:800;letter-spacing:.14em;color:var(--blue);margin-bottom:2px}
.sh-sub{margin:4px 0 0;font-style:italic;font-weight:600;color:var(--blue);font-size:15px}
.sh-foot{position:absolute;left:0;right:72px;bottom:18px;display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding-left:0}
.sh-foot:before{content:"";width:4px;height:14px;background:var(--blue);margin-left:0}
.sh-foot b{color:var(--blue)}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;align-items:start}
.stack{display:grid;gap:16px}
.card{border:1px solid var(--bd);background:#fff}
.cp{background:var(--navy);color:#fff;font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:9px 14px}
.cb{padding:14px}
.sr{margin:0;padding:8px 14px 10px;font-style:italic;font-size:12px;color:var(--mut);border-top:1px solid var(--row)}
.prose p{margin:0 0 10px;max-width:68ch}.prose p b{font-weight:800}
.rule{background:var(--rule);border-left:4px solid var(--yellow);padding:12px 16px;margin:16px 0 0;font-size:13.5px}
.rule b{font-weight:800}
.chip{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border:1px solid var(--bd);font-size:12px;font-weight:700;background:#fff;color:var(--ink);white-space:nowrap}
.chip:before{content:"";width:9px;height:9px;flex:none;background:var(--grey)}
.chip.partial{background:var(--blue);border-color:var(--blue);color:#fff}.chip.partial:before{background:var(--yellow)}
.chip.method{background:#EEF0FA;border-color:var(--lblue);color:var(--navy)}.chip.method:before{background:var(--lblue)}
.chip.blocked,.chip.manual{background:var(--warn-bg);border-color:#E9B877;color:var(--warn-ink)}.chip.blocked:before{background:var(--amber);border-radius:50%}.chip.manual:before{background:var(--amber);transform:rotate(45deg)}
.chip.none{background:#fff;border:1px dashed var(--dash);color:var(--mut)}.chip.none:before{background:transparent;border:1px dashed var(--dash)}
.plot{display:grid;gap:12px}
.pr{display:grid;grid-template-columns:minmax(96px,150px) minmax(0,1fr) minmax(80px,auto);gap:4px 12px;align-items:center}
.pr .lb{font-size:13px;font-weight:600}
.pr .val{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;font-size:13.5px;min-height:32px;display:inline-flex;align-items:center;justify-content:flex-end}
.pr .val a{color:var(--deep)}
.pr .nt{grid-column:1/-1;font-size:12px;color:var(--mut)}
.pr .miss{grid-column:2/-1;font-size:12.5px;color:var(--warn-ink);background:var(--warn-bg);border:1px dashed #E9B877;padding:6px 10px}
.trk{height:22px;background:repeating-linear-gradient(90deg,transparent 0 calc(25% - 1px),var(--row) calc(25% - 1px) 25%);border-left:1px solid var(--grey);border-bottom:1px solid var(--row);position:relative}
.trk i{display:block;height:100%;background:var(--blue);min-width:3px}
.trk.b2 i{background:var(--lblue)}.trk.b3 i{background:var(--amber)}
.trk.sg{background:linear-gradient(90deg,transparent calc(50% - 1px),var(--ink) calc(50% - 1px) calc(50% + 1px),transparent calc(50% + 1px));border-left:0}
.trk.sg i{position:absolute;top:0;background:var(--blue)}.trk.sg i.neg{right:50%;background:var(--navy)}.trk.sg i.pos{left:50%}
.axis{display:flex;justify-content:space-between;font-size:11px;color:var(--mut);margin:-4px 0 0;grid-column:2/3;padding-top:2px}
.fig-t{margin:0 0 10px;font-size:14px;font-weight:800;color:var(--ink)}
.fig-c{margin:10px 0 0;font-size:12px;color:var(--mut);font-style:italic}
.fig{margin:0;padding:16px 0;border-top:1px solid var(--row)}
.fig:first-child{border-top:0;padding-top:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.kpi{background:#fff;border-left:5px solid var(--blue);box-shadow:0 1px 3px rgba(11,31,68,.12);padding:14px 16px;min-width:0}
.kpi:nth-child(2){border-left-color:var(--i-cyan)}.kpi:nth-child(3){border-left-color:var(--i-orange)}.kpi:nth-child(4){border-left-color:var(--i-navy)}
.kpi h4{margin:0;font-size:11.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--i-mut)}
.kpi strong{display:block;font-size:clamp(22px,3vw,30px);line-height:1.15;font-weight:800;color:var(--i-ink);margin:4px 0;overflow-wrap:anywhere}
.kpi p{margin:0;font-size:12.5px;color:var(--i-mut)}
.kpi em{display:block;font-style:normal;font-weight:700;font-size:12.5px;color:var(--i-cyan-ink);margin-top:4px}
.kpi.gap{border-left-style:dashed;border-left-color:var(--dash);background:repeating-linear-gradient(135deg,#fff 0 10px,#F7F8FB 10px 20px)}
.kpi.gap strong{font-size:18px;color:var(--warn-ink)}
.sbar{display:flex;height:34px;border:1px solid var(--bd);background:#fff}
.sbar span{display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;min-width:30px;color:#fff}
.sbar .partial{background:var(--blue)}.sbar .method{background:var(--lblue);color:var(--deep)}.sbar .blocked{background:var(--amber);color:var(--deep)}.sbar .manual{background:#E08A00;color:var(--deep)}.sbar .none{background:#fff;color:var(--mut);border-left:1px dashed var(--dash)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0 0;padding:0;list-style:none;font-size:12.5px}
.legend li{display:inline-flex;align-items:center;gap:6px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin:16px 0 0;padding:0;list-style:none}
.tiles a{display:block;height:100%;padding:8px 10px;border:1px solid var(--bd);background:#fff;text-decoration:none;color:var(--ink);font-size:12.5px;line-height:1.35;border-top:4px solid var(--grey)}
.tiles a:hover{background:var(--th)}
.tiles b{display:block;font-size:12px;letter-spacing:.08em;color:var(--blue)}
.tiles small{display:block;margin-top:2px;font-weight:600}
.tiles .partial a{border-top-color:var(--blue)}.tiles .method a{border-top-color:var(--lblue)}.tiles .blocked a,.tiles .manual a{border-top-color:var(--amber)}.tiles .none a{border-top-style:dashed}
.table-wrap{overflow:auto;max-width:100%}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
thead th{background:var(--th);color:var(--navy);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;text-align:left}
th,td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--row)}
td small,th small{display:block}
caption{text-align:left;padding:0 0 8px;color:var(--mut);font-size:12.5px}
.miss-box{background:var(--warn-bg);border:1px dashed #E9B877;border-left:4px solid var(--amber);padding:12px 16px;color:var(--warn-ink)}
.miss-box b{font-weight:800}
.miss-box p{margin:0 0 6px;max-width:68ch}.miss-box p:last-child{margin:0}
.need{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}
.need li{display:flex;gap:10px;align-items:baseline;font-size:13.5px}
.need li:before{content:"!";flex:none;width:20px;height:20px;border-radius:50%;background:var(--amber);color:var(--deep);font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center}
.need li.ok:before{content:"\2713";background:var(--ok-ink);color:#fff}
.need li.ok{color:var(--ok-ink)}
.need small{margin-left:auto;padding-left:8px;text-align:right}
.limits{margin:8px 0 0;padding-left:20px;max-width:75ch}.limits li{margin:4px 0;overflow-wrap:anywhere}
dl{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr);gap:8px 16px;margin:10px 0}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}
details{border-top:1px solid var(--row);padding:10px 0}
summary{cursor:pointer;font-weight:700;min-height:32px}summary:hover{color:var(--blue)}
details:target,tr:target,details:has(>:target){background:#E1E6FB}
.obs{font-size:13px}
.obs td:first-child,.obs th:first-child{min-width:140px}
.tag{display:inline-block;padding:1px 8px;font-size:11.5px;font-weight:700;border:1px solid var(--bd);background:var(--th);color:var(--navy);margin:0 6px 4px 0}
.tag.warn{background:var(--warn-bg);border-color:#E9B877;color:var(--warn-ink)}
.tag.zero{background:var(--ok-bg);border-color:#9BD3B7;color:var(--ok-ink)}
.ins{background:var(--i-bg);margin:40px -16px 0;padding:0 0 32px}
.ins-head{position:relative;overflow:hidden;color:#fff;padding:28px clamp(16px,4vw,40px) 26px;background:radial-gradient(circle at 82% 30%,rgba(5,158,217,.45),rgba(5,158,217,0) 46%),linear-gradient(120deg,#061634,#0B2A5C 72%)}
.ins-head:before,.ins-head:after{content:"";position:absolute;border-radius:50%;border:2px solid rgba(5,158,217,.6);right:9%;top:50%;width:180px;height:180px;transform:translateY(-50%)}
.ins-head:after{width:128px;height:128px;right:calc(9% + 26px);border-color:rgba(247,147,30,.55)}
.ins-head>*{position:relative;z-index:1}
.ins-head .pt{margin:0;color:#7FD2F3;font-size:12px;letter-spacing:.2em;text-transform:uppercase;font-weight:800}
.ins-head h2{margin:6px 0 8px;font-size:clamp(24px,4vw,38px);line-height:1.15;font-weight:800;text-transform:uppercase;max-width:22ch;text-wrap:balance}
.ins-head p{margin:0;max-width:60ch;color:#DCE6F5}
.ins-head .brand{position:absolute;right:clamp(16px,4vw,40px);top:24px;border:2px solid var(--i-cyan);border-radius:8px;padding:6px 12px;color:#fff;z-index:2}
.ins-head .brand b{color:var(--i-orange)}.ins-head .brand i{background:var(--i-orange)}
.ins-body{padding:20px clamp(16px,3vw,32px) 0;color:var(--i-ink)}
.ins .kpis{margin-bottom:18px}
.ip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));gap:16px;align-items:start}
.ip{background:#fff;border-radius:14px;box-shadow:0 1px 4px rgba(11,31,68,.1);padding:16px 18px;min-width:0}
.ip.wide{grid-column:1/-1}
.ph{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:flex-start;justify-content:space-between;border-left:4px solid var(--i-cyan);padding-left:10px;margin:0 0 12px}
.ph h3{margin:0;font-size:15px;line-height:1.25;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--i-ink)}
.ph small{display:block;color:var(--i-cyan-ink);font-weight:800;letter-spacing:.1em}
.ip .sub{margin:0 0 10px;font-size:13px;color:var(--i-mut)}
.ip .miss-box{background:#FFF1E2;border-color:#E9B877;border-left-color:var(--i-orange);border-radius:8px}
.ip .need li:before{background:var(--i-orange)}
.ip .chip{border-radius:999px}
.ibar{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;margin:20px clamp(16px,3vw,32px) 0;background:var(--i-navy);color:#fff;padding:14px 20px;border-radius:12px}
.ibar b{background:var(--i-orange);color:var(--i-navy);padding:4px 12px;border-radius:6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
.ibar span{flex:1 1 280px;font-weight:700}
.ibar span em{font-style:normal;color:var(--i-orange)}
.status{margin:40px 0 0}
.sec-note{font-size:12.5px;color:var(--mut);max-width:75ch}
.appendix{margin-top:40px;background:#fff;border:1px solid var(--bd);padding:24px clamp(16px,3vw,36px) 32px}
.appendix>h2{margin:0 0 4px;font-size:clamp(20px,3vw,26px);font-weight:800;color:var(--deep)}
.appendix>p.lede{margin:0 0 12px;color:var(--mut);max-width:75ch}
.appendix section{margin-top:28px;border-top:4px solid var(--navy);padding-top:16px}
.appendix section>h2{margin:0 0 10px;font-size:19px;font-weight:800;color:var(--navy)}
.appendix h3{font-size:15px;margin:18px 0 6px;font-weight:800}
.appendix p{max-width:75ch}
.appendix .missing{color:var(--warn-ink);background:var(--warn-bg);border-left:4px solid var(--amber);padding:10px 14px;margin:0}
.appendix .caption{font-size:12.5px;color:var(--mut)}
.appendix .members{display:flex;gap:6px;flex-wrap:wrap}
.appendix .members a{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;background:var(--th);font-weight:700}
.appendix .downloads{display:flex;gap:4px 24px;flex-wrap:wrap;padding-left:20px}
.appendix .downloads a,.appendix a[download]{display:inline-flex;align-items:center;min-height:44px}
.appendix #source-rows table{min-width:750px}
.appendix .readiness-summary{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 20px;align-items:baseline}
.appendix .readiness-summary>span:first-child{flex:1 1 250px}
.appendix .section-state{font-size:12.5px;color:var(--mut);font-weight:500}
.appendix .section-readiness details{margin-left:16px;font-size:13px}
.appendix summary{min-height:44px;padding:8px 0}
.appendix .table-wrap:focus-visible{outline-offset:-3px}
footer.kit-foot{margin-top:28px;padding-top:16px;border-top:1px solid var(--bd);color:var(--mut);font-size:12.5px}
@media(max-width:900px){.cover{grid-template-columns:1fr;min-height:0}.cover:before{clip-path:none;top:auto;height:54%}.cover:after{display:none}.cv-left{padding:24px 20px;gap:22px}.cv-right{padding:24px 20px 28px;margin-top:8px}.two{grid-template-columns:1fr}.sheet{padding:22px 18px 60px}.sh-foot{left:0}.ins{margin:40px -16px 0}.ins-head .brand{position:static;display:inline-flex;margin-bottom:12px}.ins-head:before,.ins-head:after{display:none}}
@media(max-width:560px){.pr{grid-template-columns:minmax(0,1fr) auto}.pr .trk,.pr .axis,.pr .miss{grid-column:1/-1}dl{grid-template-columns:1fr;gap:2px}dd{margin-bottom:10px}.cv-left h1{font-size:28px}}
@media print{body{background:#fff;font-size:10pt}main{max-width:none;padding:0}.skip,.jump{display:none}.cover{min-height:0;break-after:page}.sheet,.ip,.card,.fig,tr{break-inside:avoid}.ins{margin:24px 0 0}.sheet:after{display:block}.trk,.trk i,.chip,.sbar span,.cover:before,.cover:after,.ins-head,.ibar,.cp,.sheet:after{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:inherit}.table-wrap{overflow:visible}.appendix #source-rows table{min-width:0}details>*{display:block}summary{list-style:none}}
`;
