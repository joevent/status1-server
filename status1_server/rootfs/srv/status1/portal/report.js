/* Automatisch erzeugt aus der App (tools/sync_app.py). Nicht von Hand ändern. */
var db=window.db||{settings:{station:""}};
const TAGS=[
 {g:"Team",items:[["kom","Kommunikation"],["fue","Führung & Entscheidung"],["spk","Bedenken ansprechen"]]},
 {g:"Ablauf",items:[["anf","Anfahrt & Navigation"],["lag","Lageeinschätzung"],["mat","Material & Gerät"],["med","Medikamente"],["zei","Zeitmanagement"],["dok","Dokumentation"]]},
 {g:"Schnittstellen",items:[["lst","Leitstelle"],["nef","Notarzt / NEF"],["fwp","Feuerwehr / Polizei"],["kla","Klinik-Anmeldung"],["zna","ZNA-Übergabe"],["rmt","Weitere Rettungsmittel (RTW, RTH)"]]},
 {g:"Mensch",items:[["mue","Müdigkeit"],["str","Stress & Schreckmoment"],["eig","Eigenschutz"]]}
];
const TAGNAME={},TAGGROUP={};
TAGS.forEach(g=>g.items.forEach(([id,n])=>{TAGNAME[id]=n;TAGGROUP[id]=g.g}));
const CATS=["Internistisch","Trauma","Reanimation","Kind","Transport","Sonstiges"];
const DET={
 zna:{places:"kliniken",asp:["Wartezeit","Ansprechpartner","Übergabe-Ablauf","Umgangston","Aufnahmekapazität"]},
 kla:{places:"kliniken",asp:["Voranmeldung erreicht","Rückfragen","Zuweisung","Umgangston"]},
 lst:{places:"leitstellen",asp:["Alarmierung","Einsatzinformationen","Rückmeldung","Nachforderung","Funkverkehr"]},
 nef:{asp:["Absprache","Eintreffen","Übergabe","Zusammenarbeit"]},
 fwp:{asp:["Absprache","Zugang & Rettung","Einsatzleitung"]},
 anf:{asp:["Adresse unklar","Navigation","Verkehr","Zufahrt"]},
 mat:{asp:["Fehlte","Defekt","Ungünstig gelagert"]},
 dok:{asp:["Zeitaufwand","Software / Tablet","Unklare Vorgaben","Übergabeprotokoll"]},
 eig:{asp:["Aggression / Gewalt","Verkehr","Infektionsschutz","Absicherung der Einsatzstelle"]}
};
const MIN_NEG=3;
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function TODAY(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
const MON=["Jan.","Feb.","März","Apr.","Mai","Juni","Juli","Aug.","Sept.","Okt.","Nov.","Dez."];
function dLong(iso){if(!iso)return"";const p=iso.split("-").map(Number);return p[2]+". "+MON[p[1]-1]+" "+p[0]}
function rid(){return Math.random().toString(36).slice(2,10)}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function emptyData(){return{n:0,counts:{},place:{},asp:{},cats:{},lessons:[],veh:0,from:null,to:null}}
function addInto(t,x){
  t.n+=+x.n||0;
  Object.keys(x.counts||{}).forEach(k=>{const a=t.counts[k]=t.counts[k]||{pos:0,neg:0},b=x.counts[k]||{};a.pos+=+b.pos||0;a.neg+=+b.neg||0});
  ["place","asp","cats"].forEach(f=>Object.keys(x[f]||{}).forEach(k=>{t[f][k]=(t[f][k]||0)+(+x[f][k]||0)}));
  t.lessons=t.lessons.concat(x.lessons||[]);
  t.veh+=+x.veh||1;
  if(x.from&&(!t.from||x.from<t.from))t.from=x.from;
  if(x.to&&(!t.to||x.to>t.to))t.to=x.to;
  return t;
}
function ownSnap(){if(!db.snapId){db.snapId=rid();save()}
  return{v:1,id:db.snapId,from:db.since||null,to:TODAY(),n:db.debriefs,counts:db.counts,place:db.place||{},asp:db.asp||{},cats:db.cats||{},lessons:db.lessons||[],veh:1}}
function dataset(merged){const d=addInto(emptyData(),ownSnap());if(merged)(db.collected||[]).forEach(c=>addInto(d,c));d.lessons=shuffle(d.lessons.slice());return d}
function totalsOf(d){const t={};Object.keys(d.counts).forEach(k=>t[k]=[d.counts[k].pos||0,d.counts[k].neg||0]);return t}
function prevFor(merged){const h=(db.history||[]).filter(x=>!!x.merged===!!merged);return h[h.length-1]||null}
function pct(c,n){return n?Math.round(c/n*100):0}
function rRows(d){const r=[];TAGS.forEach(g=>g.items.forEach(([id,n])=>{const c=d.counts[id]||{};r.push({id,n,g:g.g,p:c.pos||0,m:c.neg||0})}));return r}
function topAsp(d,m,id){const pre=m+"|"+id+"|";let best=null,bc=0;Object.keys(d.asp).forEach(k=>{if(k.startsWith(pre)&&d.asp[k]>bc){bc=d.asp[k];best=k.slice(pre.length)}});return best?{x:best,c:bc}:null}
function changes(d,prev){
  if(!prev||!prev.n||!d.n)return[];
  const out=[];
  rRows(d).forEach(r=>{const pv=(prev.t||{})[r.id]||[0,0];
    [["m",1,"besser machen"],["p",0,"lief gut"]].forEach(([f,i,lab])=>{const now=r[f],bef=pv[i];if(Math.max(now,bef)<3)return;
      const a=pct(bef,prev.n),b=pct(now,d.n);if(Math.abs(b-a)<10)return;
      out.push({n:r.n,f,lab,a,b,good:f==="m"?b<a:b>a,d:Math.abs(b-a)})})});
  return out.sort((x,y)=>y.d-x.d).slice(0,6);
}
function periodText(d){return d.from?dLong(d.from)+" – "+dLong(d.to):"bis "+dLong(d.to)}
function rpPage(no,total,meta,title,body){
  return `<section class="rp-page"><header class="rp-head"><span class="rp-brand"><span class="rp-key">1</span>Status 1<small>DEBRIEF</small></span><span class="rp-meta">${meta}</span></header>
  ${title?`<div class="rp-title"><span class="rp-eyebrow">${title[0]}</span><h2>${title[1]}</h2></div>`:""}${body}
  <footer class="rp-foot"><span>Anonym erhoben: keine Namen, keine Patientendaten, keine Uhrzeiten. Einrichtungen bei „besser machen“ erst ab ${MIN_NEG} Nennungen.</span><span>Seite ${no} von ${total}</span></footer></section>`;
}
function reportHtml(d,prev){
  const st=(db.settings.station||"").trim()||"Rettungswache";
  const meta=esc(st)+"<br>"+periodText(d);
  const rows=rRows(d);
  const tp=rows.reduce((a,r)=>a+r.p,0),tn=rows.reduce((a,r)=>a+r.m,0);
  const topP=rows.filter(r=>r.p>0).sort((a,b)=>b.p-a.p).slice(0,3);
  const topN=rows.filter(r=>r.m>0).sort((a,b)=>b.m-a.m).slice(0,3);
  const li=(r,m,i)=>{const a=topAsp(d,m==="p"?"pos":"neg",r.id);const c=m==="p"?r.p:r.m;
    return `<li><span class="no">${i+1}</span><span class="nm">${esc(r.n)}<small>${a?"vor allem: "+esc(a.x):"in "+pct(c,d.n)+" % der Debriefs"}</small></span><span class="ct">${c}×</span></li>`};
  const chg=changes(d,prev);
  const basis=`${d.n} Debriefs${d.veh>1?" · "+d.veh+" Fahrzeuge zusammengeführt":""}`;
  const p1=`<div class="rp-cover"><span class="rp-eyebrow">Debrief-Bericht</span><h1>${esc(st)}</h1><div class="rp-sub">${periodText(d)}</div><div class="rp-basis">${basis}</div></div>
   <div class="rp-kpis"><div class="rp-kpi"><b>${d.n}</b><span>Debriefs</span></div><div class="rp-kpi"><b style="color:var(--po)">${tp}</b><span>× lief gut</span></div><div class="rp-kpi"><b style="color:var(--ne)">${tn}</b><span>× besser machen</span></div><div class="rp-kpi"><b>${d.lessons.length}</b><span>Lehren notiert</span></div></div>
   <div class="rp-two"><div class="rp-top p"><h3>Die größten Stärken</h3>${topP.length?`<ol>${topP.map((r,i)=>li(r,"p",i)).join("")}</ol>`:`<p class="none">Noch keine Nennungen.</p>`}</div>
   <div class="rp-top n"><h3>Die wichtigsten Verbesserungsthemen</h3>${topN.length?`<ol>${topN.map((r,i)=>li(r,"n",i)).join("")}</ol>`:`<p class="none">Noch keine Nennungen.</p>`}</div></div>
   <div class="rp-box"><h3>Veränderung zum letzten Zeitraum</h3>${prev?(()=>{
     const say=c=>c.f==="m"?(c.b<c.a?"wird seltener als Problem genannt":"wird häufiger als Problem genannt"):(c.b>c.a?"wird häufiger als Stärke genannt":"wird seltener als Stärke genannt");
     const row=c=>`<div class="rp-ch"><div class="t"><b>${esc(c.n)}</b> ${say(c)}</div><div class="cmp"><span class="k">vorher</span><span class="rbar"><i class="was" style="width:${Math.min(100,c.a)}%"></i></span><span class="v">${c.a} %</span><span class="k">jetzt</span><span class="rbar"><i class="${c.good?"ps":"ng"}" style="width:${Math.min(100,c.b)}%"></i></span><span class="v">${c.b} %</span></div></div>`;
     const G=chg.filter(c=>c.good).slice(0,3),B=chg.filter(c=>!c.good).slice(0,3);
     return `<div class="rp-chg2"><div class="col g"><h4>Positiv entwickelt</h4>${G.length?G.map(row).join(""):`<p class="rp-note">Keine deutliche Verbesserung.</p>`}</div><div class="col b"><h4>Im Blick behalten</h4>${B.length?B.map(row).join(""):`<p class="rp-note">Keine deutliche Verschlechterung.</p>`}</div></div>
      <p class="rp-note">Vergleich mit ${periodText({from:prev.from,to:prev.to})} (${prev.n} Debriefs). Prozent = Anteil der Debriefs, in denen das Thema genannt wurde. So sind unterschiedlich lange Zeiträume vergleichbar. Gezeigt werden Veränderungen ab 10 Prozentpunkten.</p>`})():`<p class="rp-note">Der Vergleich erscheint ab dem nächsten Bericht.</p>`}</div>
   <div class="rp-box"><h3>Nach Bereichen</h3><div class="rp-areas">${(()=>{const A=TAGS.map(g=>{let p=0,m=0;g.items.forEach(([id])=>{const r=rows.find(x=>x.id===id);p+=r.p;m+=r.m});return{g:g.g,p,m}});const mx=Math.max(1,...A.map(a=>a.p+a.m));
     return A.map(a=>`<div class="rp-area"><span class="nm">${a.g}</span><span class="tr"><i class="p" style="width:${(a.p/mx*100).toFixed(1)}%"></i><i class="n" style="width:${(a.m/mx*100).toFixed(1)}%"></i></span><span class="v"><b style="color:var(--po)">${a.p}</b> · <b style="color:var(--ne)">${a.m}</b></span></div>`).join("")})()}</div></div>
   ${d.n<10?`<p class="rp-note">Hinweis: Bei weniger als 10 Debriefs zeigen die Zahlen nur eine Tendenz.</p>`:""}`;
  const max=Math.max(1,...rows.map(r=>Math.max(r.p,r.m)));
  const bw=v=>`width:calc((100% - 8mm) * ${(v/max).toFixed(3)})`;
  let ch=`<div class="rp-chart"><div class="rp-ch-head"><span></span><span class="l">lief gut</span><span class="r">besser machen</span></div>`;
  TAGS.forEach(g=>{ch+=`<div class="rp-grp">${g.g}</div>`;g.items.forEach(([id])=>{const r=rows.find(x=>x.id===id);
    ch+=`<div class="rp-row ${r.p+r.m?"":"zero"}"><span class="lab">${esc(r.n)}</span><span class="lft"><em>${r.p||""}</em>${r.p?`<i style="${bw(r.p)}"></i>`:""}</span><span class="rgt">${r.m?`<i style="${bw(r.m)}"></i>`:""}<em>${r.m||""}</em></span></div>`})});
  ch+=`</div><p class="rp-note">Je Schlagwort: wie oft es in den Debriefs als „lief gut“ (links) und als „besser machen“ (rechts) angetippt wurde.</p>`;
  let dets="",mini="";
  Object.keys(DET).forEach(id=>{
    const pl={},as={};
    ["pos","neg"].forEach(m=>{const pre=m+"|"+id+"|";
      Object.keys(d.place).filter(k=>k.startsWith(pre)).forEach(k=>{const x=k.slice(pre.length);(pl[x]=pl[x]||{pos:0,neg:0})[m]+=d.place[k]});
      Object.keys(d.asp).filter(k=>k.startsWith(pre)).forEach(k=>{const x=k.slice(pre.length);(as[x]=as[x]||{pos:0,neg:0})[m]+=d.asp[k]})});
    const pk=Object.keys(pl),ak=Object.keys(as);if(!pk.length&&!ak.length)return;
    let under=0;const prow=[];
    pk.forEach(x=>{const c=pl[x];const nshow=c.neg>=MIN_NEG?c.neg:0;if(c.neg&&c.neg<MIN_NEG)under+=c.neg;if(c.pos||nshow)prow.push({x,p:c.pos,n:nshow})});
    prow.sort((a,b)=>(b.p+b.n)-(a.p+a.n));
    const arow=ak.map(x=>({x,p:as[x].pos,n:as[x].neg})).sort((a,b)=>(b.p+b.n)-(a.p+a.n));
    const tbl=(rs,extra)=>`<table><tr><th></th><th>gut</th><th>besser</th></tr>${rs.map(r=>`<tr><td>${esc(r.x)}</td><td class="c p">${r.p||"–"}</td><td class="c n">${r.n||"–"}</td></tr>`).join("")}${extra||""}</table>`;
    const extra=under?`<tr><td class="muted">Weitere Einrichtungen (je unter ${MIN_NEG})</td><td class="c">–</td><td class="c n">${under}</td></tr>`:"";
    if(DET[id].places)dets+=`<div class="rp-det"><h3>${esc(TAGNAME[id])}</h3><div class="rp-det-grid"><div><h4>Wo?</h4>${prow.length||under?tbl(prow.slice(0,6),extra):`<p class="rp-note">Keine Angaben.</p>`}</div><div><h4>Was genau?</h4>${arow.length?tbl(arow.slice(0,6)):`<p class="rp-note">Keine Angaben.</p>`}</div></div></div>`;
    else mini+=`<div class="rp-det"><h3>${esc(TAGNAME[id])}</h3>${arow.length?tbl(arow.slice(0,5)):`<p class="rp-note">Keine Angaben.</p>`}</div>`;
  });
  const cats=Object.keys(d.cats||{});
  const p3=(dets||mini?`<div class="rp-dets">${dets}${mini?`<div class="rp-minis">${mini}</div>`:""}</div>`:`<p class="rp-note">In diesem Zeitraum wurden keine Details zu Einrichtungen oder Unterpunkten angegeben.</p>`)+
    (cats.length?`<div class="rp-box"><h3>Einsatzart (freiwillig erfasst)</h3><p style="margin:0">${cats.map(c=>esc(c)+": "+d.cats[c]).join(" · ")}</p></div>`:"");
  const L=d.lessons.slice(0,16);
  const p4=`<div class="rp-box" style="border:0;padding:0"><h3>Lehren aus den Einsätzen</h3>${L.length?`<div class="rp-lessons">${L.map(t=>`<p>${esc(t)}</p>`).join("")}</div>${d.lessons.length>16?`<p class="rp-note">und ${d.lessons.length-16} weitere in der App</p>`:""}`:`<p class="rp-note">Keine Lehren notiert.</p>`}</div>
   <div class="rp-meet"><h3>Für die Wachenbesprechung</h3>
    <div class="rp-q"><b>1</b><div><b style="font-family:var(--body);font-size:10pt;color:inherit">Unsere Stärken: Was läuft gut, und wie erhalten wir es?</b><div class="lines"></div></div></div>
    <div class="rp-q"><b>2</b><div><b style="font-family:var(--body);font-size:10pt;color:inherit">Unsere Verbesserungsthemen: Was steckt dahinter?</b><div class="lines"></div></div></div>
    <div class="rp-q"><b>3</b><div><b style="font-family:var(--body);font-size:10pt;color:inherit">Maßnahmen</b>
     <table><tr><th style="width:55%">Maßnahme</th><th>Zuständig</th><th>Bis wann</th></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></table></div></div>
   </div>`;
  return rpPage(1,4,meta,null,p1)+rpPage(2,4,meta,["Übersicht","Alle Schlagworte"],ch)+rpPage(3,4,meta,["Genauer hingeschaut","Schnittstellen und Details"],p3)+rpPage(4,4,meta,["Aus der Praxis","Lehren und nächste Schritte"],p4);
}
function fitReport(){const w=document.getElementById("rpwrap"),d=document.getElementById("rpdoc");if(!w||!d)return;
  d.style.transform="none";const k=Math.min(1,w.clientWidth/d.offsetWidth);d.style.transform=`scale(${k})`;w.style.height=(d.offsetHeight*k)+"px"}
