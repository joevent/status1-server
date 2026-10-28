/* Status 1 Wachenportal – nutzt dieselbe Berichtsvorlage wie die App (report.js) */
(function(){
"use strict";
var main=document.getElementById("main"),who=document.getElementById("who"),printarea=document.getElementById("printarea");
var ME=null,MONTHS=[],NOW="",SEL="",CURDATA=null;
var MN=["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
function h(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function mName(m){var p=m.split("-");return MN[+p[1]-1]+" "+p[0]}
function shift(m,k){var p=m.split("-"),i=(+p[0])*12+(+p[1]-1)+k;return Math.floor(i/12)+"-"+String(i%12+1).padStart(2,"0")}
function api(path,body){
  var o={method:body?"POST":"GET",credentials:"same-origin",headers:{}};
  if(body){o.headers["Content-Type"]="application/json";o.headers["X-S1"]="1";o.body=JSON.stringify(body)}
  return fetch(path,o).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok){var e=new Error(j.error||("Fehler "+r.status));e.status=r.status;throw e}return j})});
}
function qrSvg(text){try{var q=qrcode(0,"M");q.addData(text,"Byte");q.make();return q.createSvgTag({cellSize:4,margin:2,scalable:true})}catch(e){return""}}
function appLink(){return location.origin+"/app/?w="+encodeURIComponent((ME.code||"").replace(/-/g,""))}
function form(el){var o={};el.querySelectorAll("input,select").forEach(function(i){if(i.name)o[i.name]=i.type==="checkbox"?i.checked:i.value});return o}
function msg(el,text,ok){var m=el.querySelector(".msg");if(!m){m=document.createElement("div");m.className="msg";el.appendChild(m)}m.className="msg "+(ok?"ok":"err");m.textContent=text}

// ---------- Start ----------
function init(){
  api("/api/status").then(function(st){
    if(!st.setup)return vSetup();
    return api("/api/me").then(function(me){ME=me;dash()}).catch(function(){vLogin()});
  }).catch(function(){main.innerHTML='<div class="card narrow err">Der Server ist nicht erreichbar.</div>'});
}
function header(){
  if(!ME){who.innerHTML="";return}
  who.innerHTML='<span>'+h(ME.wache)+'</span><button class="btn small" id="logout">Abmelden</button>';
  document.getElementById("logout").onclick=function(){api("/api/logout",{}).then(function(){ME=null;header();vLogin()})};
}
function vSetup(){
  main.innerHTML='<form class="card narrow" id="f" autocomplete="off"><h1>Wachenportal einrichten</h1>'+
   '<p class="muted">Einmalig: Wache anlegen und ein Konto für die Wachenleitung. Danach bekommen Sie den Wachen-Code, mit dem sich die Fahrzeughandys verbinden.</p>'+
   '<label>Name der Wache<input name="wache" maxlength="60" required placeholder="z. B. Rettungswache Hachenburg"></label>'+
   '<label>E-Mail der Wachenleitung<input name="email" type="email" required autocomplete="username"></label>'+
   '<label>Passwort (mindestens 10 Zeichen)<input name="password" type="password" minlength="10" required autocomplete="new-password"></label>'+
   '<label>Passwort wiederholen<input name="password2" type="password" minlength="10" required autocomplete="new-password"></label>'+
   '<button class="btn primary" type="submit">Einrichten</button></form>';
  var f=document.getElementById("f");
  f.onsubmit=function(e){e.preventDefault();var d=form(f);if(d.password!==d.password2)return msg(f,"Die beiden Passwörter stimmen nicht überein.");
    api("/api/setup",d).then(function(){return api("/api/me")}).then(function(me){ME=me;dash(true)}).catch(function(er){msg(f,er.message)})};
}
function vLogin(needTotp,keep){
  main.innerHTML='<form class="card narrow" id="f"><h1>Anmelden</h1><p class="muted">Für die Wachenleitung.</p>'+
   '<label>E-Mail<input name="email" type="email" required autocomplete="username" value="'+h(keep&&keep.email||"")+'"></label>'+
   '<label>Passwort<input name="password" type="password" required autocomplete="current-password"></label>'+
   (needTotp?'<label>Bestätigungscode aus der Authenticator-App<input name="totp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>':'')+
   '<button class="btn primary" type="submit">Anmelden</button></form>';
  var f=document.getElementById("f");
  f.onsubmit=function(e){e.preventDefault();var d=form(f);
    api("/api/login",d).then(function(r){if(r.needTotp)return vLogin(true,d);return api("/api/me").then(function(me){ME=me;dash()})}).catch(function(er){msg(f,er.message)})};
}

// ---------- Übersicht ----------
function periods(){
  var list=[],seen={};
  MONTHS.slice().reverse().forEach(function(x){seen[x.m]=x.n});
  if(!seen[NOW])seen[NOW]=0;
  Object.keys(seen).sort().reverse().forEach(function(m){list.push({v:m+":"+m,l:mName(m)+" ("+seen[m]+" Debriefs)"})});
  list.push({v:shift(NOW,-2)+":"+NOW,l:"Letzte 3 Monate"});
  list.push({v:NOW.slice(0,4)+"-01:"+NOW,l:"Dieses Jahr"});
  if(MONTHS.length)list.push({v:MONTHS[0].m+":"+NOW,l:"Gesamter Zeitraum"});
  var seenV={};return list.filter(function(x){if(seenV[x.v])return false;seenV[x.v]=1;return true});
}
function dash(first){
  header();
  api("/api/months").then(function(r){MONTHS=r.months;NOW=r.now;if(!SEL)SEL=NOW+":"+NOW;render(first)});
}
function render(first){
  main.innerHTML=
   (first?'<div class="card ok no-print"><b>Eingerichtet.</b> Verbinden Sie jetzt die Fahrzeughandys über den QR-Code rechts. Die Auswertung erscheint, sobald genug Debriefs eingegangen sind.</div>':'')+
   '<div class="toolbar no-print"><label>Zeitraum<select id="per">'+periods().map(function(p){return'<option value="'+p.v+'"'+(p.v===SEL?" selected":"")+'>'+h(p.l)+'</option>'}).join("")+'</select></label>'+
   '<button class="btn primary" id="print">Als PDF sichern</button></div>'+
   '<div class="grid"><section id="rep" class="repwrap"><p class="muted">Wird geladen …</p></section><aside class="side">'+
   cardVehicles()+cardTrend()+cardAccount()+'</aside></div>';
  document.getElementById("per").onchange=function(e){SEL=e.target.value;loadReport()};
  document.getElementById("print").onclick=function(){if(!CURDATA)return;document.body.className="p-report";window.print();setTimeout(function(){document.body.className=""},500)};
  wireVehicles();wireAccount();loadTrend();loadReport();
}
function loadReport(){
  var el=document.getElementById("rep"),p=SEL.split(":");
  el.innerHTML='<p class="muted">Wird geladen …</p>';CURDATA=null;
  api("/api/data?from="+p[0]+"&to="+p[1]).then(function(r){
    if(r.below){el.innerHTML='<div class="card notice"><h2>Noch zu wenige Debriefs</h2><p>Im gewählten Zeitraum sind <b>'+r.n+'</b> Debriefs eingegangen. Damit niemand aus einzelnen Einsätzen erkennbar wird, erscheint die Auswertung erst ab <b>'+r.min+'</b> Debriefs.</p><p class="small">Tipp: einen längeren Zeitraum wählen.</p></div>';return}
    CURDATA=r.data;window.db={settings:{station:ME.wache}};
    el.innerHTML='<div class="rp-wrap" id="rpwrap"><div class="rp-doc" id="rpdoc">'+reportHtml(r.data,r.prev)+'</div></div>';
    fitReport();
  }).catch(function(er){el.innerHTML='<div class="card err">'+h(er.message)+'</div>'});
}
window.addEventListener("resize",function(){if(document.getElementById("rpdoc"))fitReport()});

// ---------- Fahrzeuge verbinden ----------
function cardVehicles(){
  var local=/\.local$/i.test(location.hostname);
  return '<div class="card no-print" id="veh"><h3>Fahrzeuge verbinden</h3>'+
   '<p class="small" style="margin:0">Alle Fahrzeughandys der Wache nutzen denselben Code. Der Server kann die Fahrzeuge deshalb nicht unterscheiden.</p>'+
   '<div class="qr">'+qrSvg(appLink())+'</div>'+
   '<div class="codebox" id="code">'+h(ME.code)+'</div>'+
   '<p class="small" style="margin:0">Mit der Handykamera scannen: Die App öffnet sich und verbindet sich mit dieser Wache. Oder in der App unter Einstellungen → Zentrale Auswertung Adresse und Code eintragen.</p>'+
   (local?'<p class="small" style="margin:0"><b>Hinweis:</b> Sie haben das Portal über „'+h(location.hostname)+'“ geöffnet. Android-Handys finden solche Namen oft nicht. Öffnen Sie das Portal besser über die IP-Adresse des Servers und erzeugen Sie den QR-Code dort.</p>':'')+
   '<div class="row"><button class="btn" id="poster">Aushang drucken</button><button class="btn warn" id="rot">Code erneuern</button></div>'+
   '<p class="small" style="margin:0">Adresse für die App: <span style="user-select:all">'+h(location.origin)+'</span></p></div>';
}
function wireVehicles(){
  document.getElementById("poster").onclick=printPoster;
  var b=document.getElementById("rot"),armed=false;
  b.onclick=function(){
    if(!armed){armed=true;b.textContent="Wirklich erneuern? Alle Handys neu verbinden";return}
    api("/api/rotate",{}).then(function(r){ME.code=r.code;render()}).catch(function(er){msg(document.getElementById("veh"),er.message)});
  };
}
function printPoster(){
  printarea.innerHTML='<div class="poster"><div class="ph"><span class="key">1</span><b>Status 1</b></div>'+
   '<div><div class="small">'+h(ME.wache)+'</div><h1>Fahrzeughandy mit der Wache verbinden</h1></div>'+
   '<div class="pq">'+qrSvg(appLink())+'</div>'+
   '<ol><li>Kamera des Fahrzeughandys auf den Code richten und den Link öffnen.</li><li>Die App „Status 1“ öffnet sich und meldet „Mit Wache verbunden“.</li><li>Im Browser „Zum Home-Bildschirm“ wählen, damit die App wie gewohnt startet.</li></ol>'+
   '<div><div class="small" style="margin-bottom:2mm">Ohne Kamera: In der App unter Einstellungen → Zentrale Auswertung eintragen</div><div class="pc">'+h(location.origin)+'<br>'+h(ME.code)+'</div></div>'+
   '<div class="pf">Übertragen werden nur Zählerstände und Lehren ohne Uhrzeit, ohne Fahrzeug und ohne Namen. Nur die Wachenleitung sieht die Auswertung, ab einer Mindestzahl an Debriefs.</div></div>';
  document.body.className="p-poster";window.print();setTimeout(function(){document.body.className=""},500);
}

// ---------- Verlauf ----------
function cardTrend(){
  var opts='<option value="">Debriefs je Monat</option>';
  TAGS.forEach(function(g){g.items.forEach(function(it){opts+='<option value="'+it[0]+'">'+h(it[1])+'</option>'})});
  return '<div class="card no-print trend"><h3>Verlauf</h3><label>Anzeigen<select id="tsel">'+opts+'</select></label><div id="tchart"><p class="small">Wird geladen …</p></div></div>';
}
var TREND=null;
function loadTrend(){api("/api/trend").then(function(r){TREND=r;drawTrend();document.getElementById("tsel").onchange=drawTrend})}
function drawTrend(){
  var el=document.getElementById("tchart");if(!el||!TREND)return;
  var M=TREND.months.slice(-12),tag=document.getElementById("tsel").value;
  if(!M.length){el.innerHTML='<p class="small">Noch keine Daten.</p>';return}
  var W=320,H=170,L=30,B=26,T=10,R=8,cw=(W-L-R)/M.length;
  var svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Verlauf">';
  function y(v,max){return T+(H-T-B)*(1-v/max)}
  if(!tag){
    var max=Math.max(1,Math.max.apply(null,M.map(function(m){return m.v["#debriefs"]||0})));
    [0,max].forEach(function(v){svg+='<text x="'+(L-4)+'" y="'+(y(v,max)+4)+'" font-size="10" text-anchor="end" fill="#56636f">'+v+'</text>'});
    M.forEach(function(m,i){var v=m.v["#debriefs"]||0,bw=Math.min(cw*.64,28),x=L+i*cw+(cw-bw)/2,bh=(H-T-B)*v/max;
      svg+='<rect x="'+x.toFixed(1)+'" y="'+(H-B-bh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2" fill="'+(v<TREND.min?"#b9c2cb":"#14202b")+'"></rect>'});
    svg+=axis(M,L,cw,H,B)+'</svg><p class="small" style="margin:0">Grau: unter der Mindestzahl von '+TREND.min+' Debriefs, wird in der Auswertung nicht angezeigt.</p>';
  }else{
    var pts={pos:[],neg:[]};
    M.forEach(function(m,i){var n=m.v["#debriefs"]||0,ok=n>=TREND.min;["pos","neg"].forEach(function(k){pts[k].push(ok?Math.round((m.v[k+"|"+tag]||0)/n*100):null)})});
    var max=Math.max(10,Math.max.apply(null,pts.pos.concat(pts.neg).filter(function(v){return v!=null})));
    [0,max].forEach(function(v){svg+='<text x="'+(L-4)+'" y="'+(y(v,max)+4)+'" font-size="10" text-anchor="end" fill="#56636f">'+v+' %</text>'});
    [["pos","#1d8552"],["neg","#a96200"]].forEach(function(c){var d="",started=false;
      pts[c[0]].forEach(function(v,i){if(v==null){started=false;return}var x=L+i*cw+cw/2,yy=y(v,max);d+=(started?"L":"M")+x.toFixed(1)+" "+yy.toFixed(1);started=true;
        svg+='<circle cx="'+x.toFixed(1)+'" cy="'+yy.toFixed(1)+'" r="2.6" fill="'+c[1]+'"></circle>'});
      svg+='<path d="'+d+'" fill="none" stroke="'+c[1]+'" stroke-width="2"></path>'});
    svg+=axis(M,L,cw,H,B)+'</svg><div class="legend"><span><i style="background:#1d8552"></i>lief gut</span><span><i style="background:#a96200"></i>besser machen</span></div><p class="small" style="margin:0">Anteil der Debriefs je Monat, in denen das Schlagwort genannt wurde. Monate unter der Mindestzahl bleiben leer.</p>';
  }
  el.innerHTML=svg;
}
function axis(M,L,cw,H,B){var s='<line x1="'+L+'" x2="'+(L+cw*M.length)+'" y1="'+(H-B)+'" y2="'+(H-B)+'" stroke="#cbd3db"></line>';
  M.forEach(function(m,i){s+='<text x="'+(L+i*cw+cw/2).toFixed(1)+'" y="'+(H-B+14)+'" font-size="9.5" text-anchor="middle" fill="#56636f">'+MN[+m.m.slice(5)-1].slice(0,3)+'</text>'});return s}

// ---------- Konto ----------
function cardAccount(){
  return '<div class="card no-print" id="acc"><h3>Konto und Sicherheit</h3><p class="small" style="margin:0">Angemeldet als '+h(ME.email)+'.</p>'+
   '<details><summary>Name der Wache ändern</summary><form id="fren" class="card" style="border:0;padding:12px 0 0"><label>Name<input name="wache" maxlength="60" value="'+h(ME.wache)+'"></label><button class="btn" type="submit">Speichern</button></form></details>'+
   '<details><summary>Passwort ändern</summary><form id="fpw" class="card" style="border:0;padding:12px 0 0"><label>Bisheriges Passwort<input name="old" type="password" autocomplete="current-password"></label><label>Neues Passwort (mind. 10 Zeichen)<input name="new" type="password" minlength="10" autocomplete="new-password"></label><button class="btn" type="submit">Ändern</button></form></details>'+
   '<details><summary>Zweiter Faktor '+(ME.totp?"(aktiv)":"(aus)")+'</summary><div id="totp" style="padding-top:12px;display:flex;flex-direction:column;gap:10px">'+
    (ME.totp?'<form id="ftd" class="card" style="border:0;padding:0"><label>Passwort zum Ausschalten<input name="password" type="password"></label><button class="btn warn" type="submit">Zweiten Faktor ausschalten</button></form>'
     :'<p class="small" style="margin:0">Empfohlen. Mit einer Authenticator-App (z. B. Microsoft oder Google Authenticator) wird bei der Anmeldung zusätzlich ein Code abgefragt.</p><button class="btn" id="tstart">Einrichten</button>')+'</div></details>'+
   '<details><summary>Testdaten löschen</summary><form id="fdel" class="card" style="border:0;padding:12px 0 0"><p class="small" style="margin:0">Löscht alle Summen und Lehren dieser Wache. Konto und Wachen-Code bleiben.</p><label>Passwort<input name="password" type="password"></label><button class="btn warn" type="submit">Alle Daten löschen</button></form></details></div>';
}
function wireAccount(){
  var acc=document.getElementById("acc");
  document.getElementById("fren").onsubmit=function(e){e.preventDefault();var d=form(e.target);api("/api/rename",d).then(function(){ME.wache=d.wache;header();msg(e.target,"Gespeichert.",true);loadReport()}).catch(function(er){msg(e.target,er.message)})};
  document.getElementById("fpw").onsubmit=function(e){e.preventDefault();api("/api/password",form(e.target)).then(function(){e.target.reset();msg(e.target,"Passwort geändert.",true)}).catch(function(er){msg(e.target,er.message)})};
  document.getElementById("fdel").onsubmit=function(e){e.preventDefault();api("/api/reset-data",form(e.target)).then(function(){dash()}).catch(function(er){msg(e.target,er.message)})};
  var ftd=document.getElementById("ftd");if(ftd)ftd.onsubmit=function(e){e.preventDefault();api("/api/totp/disable",form(e.target)).then(function(){ME.totp=false;render()}).catch(function(er){msg(e.target,er.message)})};
  var ts=document.getElementById("tstart");if(ts)ts.onclick=function(){api("/api/totp/start",{}).then(function(r){
    var box=document.getElementById("totp");
    box.innerHTML='<p class="small" style="margin:0">1. In der Authenticator-App einen neuen Eintrag anlegen und diesen Code scannen:</p><div class="qr">'+qrSvg(r.uri)+'</div>'+
     '<p class="small" style="margin:0">Oder Schlüssel eintippen: <span style="user-select:all;font-family:ui-monospace,monospace">'+h(r.secret)+'</span></p>'+
     '<form id="ftc" class="card" style="border:0;padding:0"><label>2. Angezeigten Code eingeben<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label><button class="btn primary" type="submit">Bestätigen</button></form>';
    document.getElementById("ftc").onsubmit=function(e){e.preventDefault();api("/api/totp/confirm",form(e.target)).then(function(){ME.totp=true;render()}).catch(function(er){msg(e.target,er.message)})};
  }).catch(function(er){msg(acc,er.message)})};
}
init();
})();
