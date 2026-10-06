// DysOrga : l'écran de l'appli (enfant et parent).
import "./styles.css";
import { supa, utilisateur, connexionParent, inscriptionParent, connexionEnfant, deconnexion, monProfil, toutCharger, ecouter, creerStore,
  demander, pronoteLier, pronoteSynchro, pronoteStatut, creerCompteEnfant, activerAlertes, alertesActives } from "./api.js";
import { ouvrirCamera } from "./camera.js";

var MATIERES=[
  {k:"Français",c:"var(--m-fr)"},{k:"Maths",c:"var(--m-ma)"},{k:"Histoire-Géo",c:"var(--m-hg)"},
  {k:"SVT",c:"var(--m-sv)"},{k:"Anglais",c:"var(--m-an)"},{k:"Physique-Chimie",c:"var(--m-ph)"},{k:"Autre",c:"var(--m-au)"}];
function mcolor(m){for(var i=0;i<MATIERES.length;i++)if(MATIERES[i].k===m)return MATIERES[i].c;return "var(--m-au)";}
var BRANCH_COLORS=["var(--m-ma)","var(--m-fr)","var(--m-sv)","var(--m-hg)","var(--m-an)","var(--m-ph)"];
var ICON={
  speak:'<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
  check:'<svg viewBox="0 0 24 24"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  photo:'<svg viewBox="0 0 24 24"><path d="M9 3L7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>'
};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function $(s,r){return (r||document).querySelector(s);}
function ls(k,v){try{if(v===undefined){var x=localStorage.getItem(k);return x?JSON.parse(x):null;}localStorage.setItem(k,JSON.stringify(v));}catch(e){return null;}}
function dayKey(d){d=d||new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function addDays(n){var d=new Date();d.setDate(d.getDate()+n);return dayKey(d);}
function fmtDay(k){if(!k)return "";if(k===dayKey())return "aujourd'hui";if(k===addDays(1))return "demain";if(k===addDays(2))return "après-demain";
  var p=k.split("-");var d=new Date(+p[0],+p[1]-1,+p[2]);return d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});}
function fmtTime(iso){if(!iso)return "";var d=new Date(iso);return d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});}
function fmtWhen(iso){if(!iso)return "jamais";var d=new Date(iso);var k=dayKey(d);return (k===dayKey()?"aujourd'hui":k===addDays(-1)?"hier":d.toLocaleDateString("fr-FR",{day:"numeric",month:"long"}))+" à "+fmtTime(iso);}

/* ---------- voix ---------- */
var canSpeak="speechSynthesis" in window;
function speak(text){if(!canSpeak)return;try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(text);u.lang="fr-FR";u.rate=.9;
  var v=speechSynthesis.getVoices().filter(function(x){return /^fr/i.test(x.lang);})[0];if(v)u.voice=v;speechSynthesis.speak(u);}catch(e){}}
function sayBtn(text,label){if(!canSpeak)return "";return '<button class="say" data-say="'+esc(text)+'" aria-label="'+esc(label||"Écouter")+'" title="Écouter">'+ICON.speak+'</button>';}
document.addEventListener("click",function(e){var b=e.target.closest("[data-say]");if(b){e.preventDefault();speak(b.getAttribute("data-say"));}});

/* ---------- données (Supabase) ---------- */
var S={devoirs:[],cartes:[],tests:[],notes:[],documents:[],edt:[],suivi:{},reglages:{prenom:"Ethan",classe:"4e"}};
var sample=true, sampleImages=true, imgLim={maxCount:5,maxInputBytes:20e6,mediaTypes:["image/jpeg","image/png","image/webp"]};
var device="enfant", profil=null;
var Store=creerStore(S,function(){render();},dbErr);
function dbErr(e){showSync("La sauvegarde n'a pas marché. Vérifie ta connexion internet et réessaie.");console.warn(e);}
function showSync(t){var n=$("#syncNote");n.textContent=t;n.hidden=!t;}

/* ---------- étoiles ---------- */
function stars(){var n=0;S.devoirs.forEach(function(d){if(d.fait)n+=1;});S.tests.forEach(function(t){n+=t.score||0;});S.notes.forEach(function(x){if(auDessus(x))n+=3;});return n;}

/* ---------- état de l'écran ---------- */
var tab=ls("cartable.tab")||"devoirs";
var ui={addOpen:false,addM:"",addQ:addDays(1),mapLoading:false,mapErr:"",map:null,quiz:null,quizLoading:false,quizErr:"",timer:null,timerLeft:0,photos:[],prefill:""};

/* ---------- thème : 2 minutes une fois par jour (illimité en mode parent) ---------- */
var THEME_MS=2*60*1000, themeTick=null;
function themeFin(){var r=S.reglages;return r.theme_jour===dayKey()&&r.theme_debut?new Date(r.theme_debut).getTime()+THEME_MS:0;}
function themeReste(){if(device==="parent")return Infinity;var f=themeFin();return f?f-Date.now():THEME_MS;}
function applyTheme(){
  var c=S.reglages.couleur||"bleu";document.documentElement.setAttribute("data-couleur",c);
  var img=S.reglages.avec_fond&&S.reglages.fond;
  document.body.classList.toggle("fond",!!img);
  document.body.style.backgroundImage=img?'linear-gradient(var(--veil),var(--veil)),url("'+img+'")':"";
}
function themeOpen(){
  if(device==="enfant"){
    var f=themeFin();
    if(f&&Date.now()>f){ui.themeMsg="Tu as déjà choisi ton thème aujourd'hui. Tu pourras le changer demain.";ui.themeOpen=true;renderTheme();return;}
    if(!f)Store.setDoc("reglages",{theme_jour:dayKey(),theme_debut:new Date().toISOString()});
  }
  ui.themeOpen=true;ui.themeMsg="";renderTheme();speak("Tu as 2 minutes pour choisir ton thème.");
  clearInterval(themeTick);if(device==="enfant")themeTick=setInterval(function(){
    if(themeReste()<=0){clearInterval(themeTick);ui.themeMsg="Les 2 minutes sont finies. Ton thème est gardé. Au travail, tu vas y arriver !";renderTheme();speak("Les 2 minutes sont finies. Ton thème est gardé.");return;}
    var t=$("#themeLeft");if(t)t.textContent=resteTxt();},1000);
}
function resteTxt(){var r=themeReste();if(r===Infinity)return "";var s2=Math.max(0,Math.ceil(r/1000));
  return s2>60?"Il te reste 2 minutes au plus.":s2>30?"Il te reste environ 1 minute.":"Il te reste moins de 30 secondes.";}
function renderTheme(){
  var p=$("#themePanel");if(!ui.themeOpen){p.innerHTML="";return;}
  var c=S.reglages.couleur||"bleu",ok=themeReste()>0;
  var h='<div class="card"><div class="row" style="justify-content:space-between"><h2>Mon thème</h2><button class="btn small line" data-act="theme-close">C\'est bon</button></div>';
  if(ui.themeMsg)h+='<p class="note">'+esc(ui.themeMsg)+'</p>';
  if(ok){
    h+=(device==="enfant"?'<p><b>Tu as 2 minutes pour choisir</b>, une fois par jour. <span class="hint" id="themeLeft">'+resteTxt()+'</span></p>':'<p class="hint">En mode parent, pas de limite de temps.</p>')+
     '<div class="swatches">'+[["rose","Rose","#E0428A","#fff"],["jaune","Jaune","#F5B800","#2A1E00"],["bleu","Bleu","#1F5FBF","#fff"]].map(function(o){
       return '<button class="swatch" style="background:'+o[2]+';color:'+o[3]+'" aria-pressed="'+(c===o[0])+'" data-act="theme-c" data-c="'+o[0]+'">'+o[1]+'</button>';}).join("")+'</div>'+
     '<div class="row"><label class="btn ghost" for="fondFile" style="flex:1">'+ICON.photo+(S.reglages.fond?"Changer mon fond d\'écran":"Mettre mon fond d\'écran")+'</label>'+
     (S.reglages.avec_fond?'<button class="btn line" data-act="fond-off" style="flex:1">Enlever le fond</button>':'')+'</div>'+
     '<input type="file" id="fondFile" accept="image/*" hidden><p class="hint">Choisis l\'image de ton fond d\'écran. Elle sera un peu pâlie pour que tu lises bien.</p>';
  }
  p.innerHTML=h+'</div>';
}
function setFond(file){
  if(themeReste()<=0)return;
  var img=new Image(),url=URL.createObjectURL(file);
  img.onload=function(){
    var max=900,sc=Math.min(1,max/Math.max(img.width,img.height)),cv=document.createElement("canvas");
    cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
    var q=.7,data=cv.toDataURL("image/jpeg",q);while(data.length>230000&&q>.3){q-=.1;data=cv.toDataURL("image/jpeg",q);}
    URL.revokeObjectURL(url);
    Store.setDoc("reglages",{fond:data,avec_fond:true});applyTheme();renderTheme();
  };
  img.onerror=function(){URL.revokeObjectURL(url);};img.src=url;
}
function render(){
  applyTheme();$("#themeBtn").hidden=false;
  $("#hello").textContent=device==="parent"?"Espace parent":"Salut "+(S.reglages.prenom||"Ethan");
  $("#today").textContent=new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
  $("#starCount").textContent=stars();
  document.querySelectorAll("nav.tabs button").forEach(function(b){b.setAttribute("aria-selected",String(b.dataset.tab===tab));});
  var v=$("#view");
  v.innerHTML=tab==="devoirs"?vDevoirs():tab==="cartes"?vCartes():tab==="tests"?vTests():tab==="notes"?vNotes():vParent();
}

/* ---------- DEVOIRS ---------- */
function devoirCard(d){
  var c=mcolor(d.matiere);
  return '<div class="card devoir'+(d.fait?" fait":"")+'" style="--mc:'+c+'">'+
   '<button class="check" data-act="toggle" data-id="'+esc(d.id)+'" aria-label="'+(d.fait?"Pas encore fait":"J\'ai fini")+'">'+ICON.check+'</button>'+
   '<div class="body"><div class="row"><span class="chip">'+esc(d.matiere)+'</span><span class="hint">pour '+esc(fmtDay(d.pour))+'</span>'+(d.exemple?'<span class="ex">exemple</span>':'')+'</div>'+
   '<p class="txt">'+esc(d.texte)+'</p>'+
   '<div class="row">'+sayBtn(d.matiere+". "+d.texte,"Écouter le devoir")+
   (d.fait?'':'<button class="btn small ghost" data-act="go-carte" data-sujet="'+esc(d.matiere+" : "+d.texte)+'">Carte mentale</button><button class="btn small ghost" data-act="go-test" data-sujet="'+esc(d.matiere+" : "+d.texte)+'">Me tester</button>')+
   '</div></div></div>';
}
function addForm(){
  if(!ui.addOpen)return '<button class="btn big ghost" data-act="add-open">'+ICON.plus+'Ajouter un devoir</button>';
  return '<div class="card"><h2>Nouveau devoir</h2>'+
   '<div><span class="lbl">Quelle matière ?</span><div class="matieres">'+MATIERES.map(function(m){
      return '<button class="mbtn" style="--mc:'+m.c+'" aria-pressed="'+(ui.addM===m.k)+'" data-act="add-m" data-m="'+esc(m.k)+'">'+esc(m.k)+'</button>';}).join("")+'</div></div>'+
   '<div><label class="lbl" for="addTxt">Qu\'est-ce qu\'il faut faire ?</label><textarea id="addTxt" placeholder="Ex : apprendre la leçon sur les fractions">'+esc(ui.addTxt||"")+'</textarea></div>'+
   '<div><span class="lbl">Pour quand ?</span><div class="quand">'+
     [[addDays(1),"Demain"],[addDays(2),"Après-demain"],[addDays(7),"Dans une semaine"]].map(function(q){
      return '<button class="mbtn" aria-pressed="'+(ui.addQ===q[0])+'" data-act="add-q" data-q="'+q[0]+'">'+q[1]+'</button>';}).join("")+
   '</div><input type="date" id="addDate" value="'+esc(ui.addQ)+'" aria-label="Autre date" style="margin-top:8px"></div>'+
   '<div class="row"><button class="btn" data-act="add-save">Enregistrer</button><button class="btn line" data-act="add-close">Annuler</button></div></div>';
}
var JOURS=[["1","Lundi"],["2","Mardi"],["3","Mercredi"],["4","Jeudi"],["5","Vendredi"],["6","Samedi"]];
function finCours(){
  var e=S.edt.filter(function(x){return x.jour===dayKey();})[0];if(e)return e.fin.slice(0,5);
  var p=S.reglages.planning||{};return p[String(new Date().getDay())]||"";}
function aCommence(){
  var su=S.suivi||{},t=dayKey();
  if(su.debut_devoirs&&dayKey(new Date(su.debut_devoirs))===t)return su.debut_devoirs;
  var f=finCours(),a=su.derniere_activite;
  if(a&&dayKey(new Date(a))===t&&(!f||fmtTime(a)>=f))return a;
  return "";
}
/* ---------- bureau et cahiers : photo, puis consignes une par une ---------- */
function orgCard(){
  var o=ui.org;
  if(!sample||!sampleImages)return '';
  if(!o)return '<div class="card"><h3>Prêt à travailler ?</h3><p class="hint">Montre-moi ton bureau ou tes cahiers. Je te dis quoi faire, une étape à la fois.</p>'+
    '<div class="row"><button class="btn ghost" style="flex:1" data-act="org-start" data-type="bureau">'+ICON.photo+'Mon bureau</button><button class="btn ghost" style="flex:1" data-act="org-start" data-type="cahiers">'+ICON.photo+'Mes cahiers</button></div></div>';
  var titre=o.type==="bureau"?"Mon bureau":"Mes cahiers";
  var h='<div class="card"><div class="row" style="justify-content:space-between"><h3>'+titre+'</h3><button class="btn small line" data-act="org-close">Fermer</button></div>';
  if(o.recadrage)h+='<div class="card courage"><strong>On se reconcentre</strong><p>'+esc(o.recadrage)+'</p>'+sayBtn(o.recadrage,"Écouter")+'</div>';
  if(o.loading)return h+'<div class="wait"><span class="dot"></span>Je regarde ta photo…</div></div>';
  if(o.err)h+='<p class="err">'+esc(o.err)+'</p>';
  if(o.etapes&&o.i<o.etapes.length){var e=o.etapes[o.i];
    h+='<div class="qprog">'+o.etapes.map(function(_,i){return '<span class="'+(i<o.i?"ok":i===o.i?"cur":"")+'"></span>';}).join("")+'</div>'+
      (o.i===0&&o.bravo?'<p>'+esc(o.bravo)+'</p>':'')+
      '<div class="row" style="flex-wrap:nowrap;justify-content:space-between"><p class="question">'+esc((e.emoji?e.emoji+" ":"")+e.texte)+'</p>'+sayBtn(e.texte,"Écouter la consigne")+'</div>'+
      '<button class="btn big" data-act="org-next">C\'est fait</button>';
    return h+'</div>';}
  if(o.etapes&&o.etapes.length&&o.i>=o.etapes.length)h+='<div class="card bravo"><strong>Bravo !</strong><p>Reprends une photo pour que je vérifie, ou commence tes devoirs.</p></div>';
  if(o.ok)h+='<div class="card bravo"><strong>C\'est parfait !</strong><p>'+esc(o.ok)+'</p></div>';
  h+='<button class="btn big" data-act="org-cam">'+ICON.photo+(o.etapes?"Reprendre une photo":"Prendre la photo")+'</button>'+
    '<p class="hint">'+(o.type==="bureau"?"Prends tout ton bureau en photo, de haut.":"Ouvre ton cahier et prends les pages en photo, bien à plat.")+'</p>';
  return h+'</div>';
}
function orgPhoto(f){
  var o=ui.org;if(!o)return;o.recadrage="";o.err="";o.ok="";
  o.loading=true;render();
  demander("bureau",{type:o.type,verification:!!o.etapes},[f]).then(function(r){
    o.loading=false;
    if(r.statut!=="ok"){o.recadrage=r.message||"Reprends la photo de ton bureau ou de tes cahiers.";render();speak(o.recadrage);return;}
    var et=(r.etapes||[]).filter(function(e){return e&&e.texte;}).slice(0,5);
    if(!et.length){o.etapes=null;o.ok=r.parfait||r.bravo||"Tout est prêt pour travailler.";render();speak(o.ok);return;}
    o.etapes=et;o.i=0;o.bravo=r.bravo||"";render();speak((o.bravo?o.bravo+" ":"")+et[0].texte);
    activite();
  }).catch(function(e){o.loading=false;o.err=errText(e);render();});
}
function vDevoirs(){
  var demain=addDays(1);
  var todo=S.devoirs.filter(function(d){return !d.fait;}).sort(function(a,b){return (a.pour||"").localeCompare(b.pour||"");});
  var proches=todo.filter(function(d){return d.pour<=demain;}), plus=todo.filter(function(d){return d.pour>demain;});
  var faits=S.devoirs.filter(function(d){return d.fait;}).sort(function(a,b){return (b.fait_le||"").localeCompare(a.fait_le||"");}).slice(0,6);
  var pourDemain=S.devoirs.filter(function(d){return d.pour===demain;});
  var h='';
  if(device==="enfant"&&!aCommence()&&todo.length)h+='<button class="btn big" data-act="commence">Je commence mes devoirs</button>';
  h+=orgCard();
  if(pourDemain.length&&proches.length===0)h+='<div class="card bravo"><strong>Bravo, tout est fini pour demain !</strong><p>Tu peux te reposer.</p></div>';
  h+='<div class="section-title"><h2>À faire pour demain</h2><span class="count">'+proches.length+' restant'+(proches.length>1?"s":"")+'</span></div>';
  h+=proches.length?proches.map(devoirCard).join(""):'<p class="hint">Rien pour demain.</p>';
  if(plus.length){h+='<div class="section-title"><h2>Plus tard</h2><span class="count">'+plus.length+'</span></div>'+plus.map(devoirCard).join("");}
  h+=addForm();
  if(faits.length){h+='<div class="section-title"><h2>Déjà fait</h2></div>'+faits.map(devoirCard).join("");}
  return '<div class="wrap">'+h+'</div>';
}
function toggleDevoir(id){
  var d=S.devoirs.filter(function(x){return x.id===id;})[0];if(!d)return;
  var fait=!d.fait;Store.upd("devoirs",id,{fait:fait,fait_le:fait?new Date().toISOString():null});
  if(fait&&device==="enfant"){
    var demain=addDays(1);
    var reste=S.devoirs.filter(function(x){return x.pour<=demain&&!x.fait&&x.id!==id;});
    var patch={derniere_activite:new Date().toISOString()};
    if(!reste.length)patch.devoirs_finis_le=new Date().toISOString();
    Store.setDoc("suivi",patch);
    speak(reste.length?"Super ! Encore "+reste.length+" devoir"+(reste.length>1?"s":""):"Bravo, tout est fini pour demain !");
  }
}

/* ---------- assistant ---------- */
function errText(e){var c=e&&e.code;
  if(c==="plafond")return "L'assistant a beaucoup travaillé aujourd'hui. Il revient demain.";
  if(c==="occupe")return "L'assistant est très occupé. Attends une minute et réessaie.";
  if(c==="non_connecte")return "Il faut te reconnecter.";
  return "Ça n'a pas marché cette fois. Vérifie internet et réessaie.";}
function activite(){if(device==="enfant")Store.setDoc("suivi",{derniere_activite:new Date().toISOString()});}

function makeMap(docId){ui.recadrage="";
  var sujet=(($("#mapSujet")||{}).value||"").trim(),lecon=($("#mapLecon")||{}).value||"";
  var doc=docId?S.documents.filter(function(d){return d.id===docId;})[0]:null;
  if(doc&&!sujet)sujet=doc.matiere+" : "+doc.titre;
  if(!sujet&&!lecon.trim()&&!ui.photos.length){ui.mapErr="Écris d'abord le sujet de la carte.";render();return;}
  ui.mapSujet=sujet;ui.mapLecon=lecon;ui.mapLoading=true;ui.mapErr="";ui.map=null;render();
  demander("carte",{sujet:sujet,lecon:lecon,documentId:docId||null},ui.photos.map(function(p){return p.file;})).then(function(r){
    ui.mapLoading=false;
    if(r.statut==="recadrage"){clearPhotos();ui.recadrage=r.message;render();speak(r.message);return;}
    if(r.statut!=="ok"||!(r.branches||[]).length){ui.mapErr=r.message||"Ça n'a pas marché cette fois. Réessaie.";render();return;}
    clearPhotos();
    var m={matiere:(doc&&doc.matiere)||matiereDe(sujet),sujet:sujet||r.titre,titre:r.titre||sujet,branches:r.branches.slice(0,6),astuce:r.astuce||""};
    ui.map=m;render();Store.add("cartes",m);activite();
  }).catch(function(e){ui.mapLoading=false;ui.mapErr=errText(e);render();});
}
function photoBlock(){
  var full=ui.photos.length>=imgLim.maxCount;
  return '<div class="photos"><span class="lbl">Ta leçon en photo</span>'+
   (ui.photos.length?'<div class="thumbs">'+ui.photos.map(function(p,i){return '<div class="thumb"><img src="'+p.url+'" alt="Page '+(i+1)+'"><button class="say" data-act="photo-del" data-i="'+i+'" aria-label="Enlever la page '+(i+1)+'">✕</button><span>Page '+(i+1)+'</span></div>';}).join("")+'</div>':'')+
   (full?'<p class="hint">C\'est le maximum de pages.</p>':
   '<div class="row"><button class="btn" data-act="photo-cam" style="flex:1">'+ICON.photo+(ui.photos.length?"Ajouter une page":"Prendre en photo")+'</button>'+
   (device==="parent"?'<label class="btn line" for="mapImg" style="flex:1">Choisir une image</label><input type="file" id="mapImg" accept="image/*" multiple hidden>':'')+'</div>')+
   '<p class="hint">Pose ta feuille bien à plat, avec de la lumière.</p></div>';
}
function addPhotos(files){
  ui.mapSujet=($("#mapSujet")||{}).value||ui.mapSujet;ui.mapErr="";ui.recadrage="";
  Array.prototype.forEach.call(files,function(f){
    if(ui.photos.length>=imgLim.maxCount)return;
    if(f.size>imgLim.maxInputBytes){ui.mapErr="Une image est trop lourde. Reprends la photo.";return;}
    ui.photos.push({file:f,url:URL.createObjectURL(f)});});
  render();
}
function clearPhotos(){ui.photos.forEach(function(p){try{URL.revokeObjectURL(p.url);}catch(e){}});ui.photos=[];}
function mapText(m){return m.titre+". "+m.branches.map(function(b){return b.titre+" : "+(b.idees||[]).join(", ");}).join(". ")+(m.astuce?". Astuce : "+m.astuce:"");}
function mapView(m){
  return '<div class="card"><div class="row" style="justify-content:space-between"><h2>'+esc(m.titre)+'</h2>'+sayBtn(mapText(m),"Écouter la carte")+'</div>'+
   '<div class="map"><div class="centre">'+esc(m.titre)+'</div><div class="branches">'+
   m.branches.map(function(b,i){return '<div class="branche" style="--bc:'+BRANCH_COLORS[i%BRANCH_COLORS.length]+'"><h3><span class="ico">'+esc(b.emoji||"")+'</span>'+esc(b.titre)+'</h3><ul>'+
     (b.idees||[]).map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul></div>';}).join("")+
   '</div>'+(m.astuce?'<div class="astuce"><b>Pour retenir :</b> '+esc(m.astuce)+'</div>':'')+'</div>'+
   '<div class="row"><button class="btn" data-act="map-test">Me tester sur cette carte</button><button class="btn line" data-act="map-close">Fermer</button></div></div>';
}
function vCartes(){
  var h='';
  if(ui.map)return '<div class="wrap">'+mapView(ui.map)+'</div>';
  var docs=S.documents.slice().sort(function(a,b){return (b.date||"").localeCompare(a.date||"");}).slice(0,5);
  if(docs.length&&!ui.mapLoading)h+='<div class="section-title"><h2>Cours des profs</h2><span class="count">Pronote</span></div><div class="saved">'+docs.map(function(d){
    return '<button class="item" data-act="doc-carte" data-id="'+esc(d.id)+'" style="border-left:8px solid '+mcolor(d.matiere)+'"><span>'+esc(d.matiere)+' · '+esc(d.titre)+'<br><span class="hint">'+esc(fmtDay(d.date))+'</span></span><span class="hint">Faire la carte</span></button>';}).join("")+'</div>';
  h+='<div class="card"><h2>Fabriquer une carte mentale</h2>'+
   (ui.recadrage?'<div class="card courage"><strong>On se reconcentre</strong><p>'+esc(ui.recadrage)+'</p>'+sayBtn(ui.recadrage,"Écouter")+'</div>':'')+
   photoBlock()+
   '<div><label class="lbl" for="mapSujet">Sur quoi ?</label><input type="text" id="mapSujet" value="'+esc(ui.prefill||ui.mapSujet||"")+'" placeholder="Ex : la Révolution française"></div>'+
   '<div><label class="lbl" for="mapLecon">La leçon (si tu l\'as)</label><textarea id="mapLecon" placeholder="Colle ou tape la leçon ici. Tu peux laisser vide.">'+esc(ui.mapLecon||"")+'</textarea></div>'+

   (ui.mapErr?'<p class="err">'+esc(ui.mapErr)+'</p>':'')+
   (ui.mapLoading?'<div class="wait"><span class="dot"></span>Je prépare ta carte… ça peut prendre une minute ou deux.</div>':
     '<button class="btn big" data-act="map-make"'+(sample?'':' disabled')+'>Fabriquer la carte</button>')+'</div>';
  var cartes=S.cartes.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");});
  if(cartes.length){h+='<div class="section-title"><h2>Mes cartes</h2><span class="count">'+cartes.length+'</span></div><div class="saved">'+
    cartes.map(function(c){return '<button class="item" data-act="map-open" data-id="'+esc(c.id)+'"><span>'+esc(c.titre||c.sujet)+(c.exemple?'<span class="ex">exemple</span>':'')+'</span><span class="hint">'+esc(c.cree?fmtWhen(c.cree).split(" à ")[0]:"")+'</span></button>';}).join("")+'</div>';}
  return '<div class="wrap">'+h+'</div>';
}

/* ---------- MINI-TESTS ---------- */
function makeQuiz(sujet,carte,revision){
  sujet=(sujet||"").trim();if(!sujet){ui.quizErr="Écris d'abord sur quoi tu veux être testé.";render();return;}
  tab="tests";ui.quizLoading=true;ui.quizErr="";ui.quiz=null;ui.quizSujet=sujet;render();
  demander("test",{sujet:sujet,carte:carte?mapText(carte):"",revision:!!revision}).then(function(r){
    ui.quizLoading=false;
    if(r.statut!=="ok"){ui.quizErr=r.message||"Choisis un sujet de cours.";render();return;}
    var qs=(r.questions||[]).filter(function(q){return q&&q.q&&Array.isArray(q.choix)&&q.choix.length>=2&&q.bonne>=0&&q.bonne<q.choix.length;}).slice(0,6);
    if(!qs.length){ui.quizErr="Ça n'a pas marché cette fois. Réessaie.";render();return;}
    ui.quiz={sujet:sujet,qs:qs,i:0,rep:[],tried:[],solved:false};render();
  }).catch(function(e){ui.quizLoading=false;ui.quizErr=errText(e);render();});
}
function niveau(score,total){var p=score/total;
  if(p>=.8)return ["n3","Prêt pour l'interro"];if(p>=.5)return ["n2","Presque, encore une révision"];return ["n1","À revoir ensemble"];}
function vQuiz(){
  var z=ui.quiz;
  if(z.i>=z.qs.length){
    var sc=z.rep.filter(Boolean).length,n=niveau(sc,z.qs.length);
    return '<div class="card score"><h2>Résultat</h2><span class="big">'+sc+' / '+z.qs.length+'</span><span class="niveau '+n[0]+'">'+n[1]+'</span>'+
      '<p>Juste du premier coup : '+sc+'. Tu gagnes '+sc+' étoile'+(sc>1?"s":"")+'.</p><div class="row" style="justify-content:center"><button class="btn" data-act="quiz-again">Refaire un test</button><button class="btn line" data-act="quiz-close">Terminer</button></div></div>';
  }
  var q=z.qs[z.i];
  var h='<div class="card"><div class="qprog">'+z.qs.map(function(_,i){return '<span class="'+(i<z.rep.length?(z.rep[i]?"ok":"ko"):i===z.i?"cur":"")+'"></span>';}).join("")+'</div>'+
   '<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><p class="question">'+esc(q.q)+'</p>'+sayBtn(q.q+" "+q.choix.map(function(c,i){return "Réponse "+(i+1)+" : "+c;}).join(". "),"Écouter la question")+'</div>'+
   '<div class="choix">'+q.choix.map(function(c,i){var cls="";
      var tried=z.tried.indexOf(i)>=0;
      if(z.solved&&i===q.bonne)cls="ok";else if(tried)cls="ko";
      return '<button class="'+cls+'" data-act="quiz-ans" data-i="'+i+'"'+(z.solved||tried?" disabled":"")+'>'+esc(c)+'</button>';}).join("")+'</div>';
  if(!z.solved&&z.tried.length){
    h+='<div class="explic"><b>Pas encore. Cherche encore !</b> '+esc(q.indice||"Relis bien la question.")+' '+sayBtn("Indice : "+(q.indice||"Relis bien la question."),"Écouter l'indice")+'</div>';}
  if(z.solved){
    h+='<div class="explic"><b>'+(z.tried.length?"Tu as trouvé !":"Juste du premier coup !")+'</b> '+esc(q.explication||"")+'</div>'+
      '<button class="btn big" data-act="quiz-next">'+(z.i+1<z.qs.length?"Question suivante":"Voir mon résultat")+'</button>';}
  return h+'</div>';
}
function matiereDe(t){t=t||"";for(var i=0;i<MATIERES.length;i++)if(t.indexOf(MATIERES[i].k+" :")===0)return MATIERES[i].k;return "";}
var JOURS_RECENT=10;
function sujets(){
  var lim=new Date();lim.setDate(lim.getDate()-JOURS_RECENT);var limIso=lim.toISOString(),semaine=addDays(7);
  var cur=[],old=[],vus={};
  function key(t){return (t||"").toLowerCase().trim();}
  function push(arr,o){var k=key(o.titre);if(!k||vus[k])return;vus[k]=1;arr.push(o);}
  var cartes=S.cartes.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");});
  cartes.forEach(function(c){if((c.cree||"")>=limIso)push(cur,{titre:c.titre||c.sujet,matiere:c.matiere||matiereDe(c.sujet),carteId:c.id,quand:c.cree});});
  S.devoirs.filter(function(d){return !d.fait&&d.pour<=semaine;}).sort(function(a,b){return (a.pour||"").localeCompare(b.pour||"");})
    .forEach(function(d){push(cur,{titre:d.matiere+" : "+d.texte,matiere:d.matiere,pour:d.pour});});
  cartes.forEach(function(c){if((c.cree||"")<limIso)push(old,{titre:c.titre||c.sujet,matiere:c.matiere||matiereDe(c.sujet),carteId:c.id,quand:c.cree});});
  S.tests.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");})
    .forEach(function(t){if((t.cree||"")<limIso)push(old,{titre:t.sujet,matiere:matiereDe(t.sujet),quand:t.cree,dernier:t.score+" / "+t.total});});
  return {cur:cur,old:old};
}
function sujetBtn(o,i,mode){
  return '<button class="item" data-act="quiz-sujet" data-mode="'+mode+'" data-i="'+i+'" style="border-left:8px solid '+mcolor(o.matiere)+'"><span>'+esc(o.titre)+
    (o.pour?'<br><span class="hint">pour '+esc(fmtDay(o.pour))+'</span>':o.dernier?'<br><span class="hint">dernier score : '+esc(o.dernier)+'</span>':'')+'</span><span class="hint">Tester</span></button>';
}
function vTests(){
  if(ui.quiz)return '<div class="wrap">'+vQuiz()+'</div>';
  var h='',sj=sujets();ui.sujets=sj;
  if(ui.quizErr)h+='<p class="err">'+esc(ui.quizErr)+'</p>';
  if(ui.quizLoading)return '<div class="wrap">'+h+'<div class="card"><div class="wait"><span class="dot"></span>Je prépare tes questions sur « '+esc(ui.quizSujet||"")+' »…</div></div></div>';
  if(sj.cur.length){var top=sj.cur[0];
    h+='<div class="card" style="border-color:var(--accent)"><span class="hint">Ce que tu étudies en ce moment</span><h2>'+esc(top.titre)+'</h2>'+
      '<p class="hint">5 questions. Si tu te trompes, tu as un indice et tu recommences.</p>'+
      '<button class="btn big" data-act="quiz-sujet" data-mode="cur" data-i="0"'+(sample?'':' disabled')+'>Commencer le test</button></div>';
    if(sj.cur.length>1)h+='<div class="section-title"><h2>Aussi en ce moment</h2></div><div class="saved">'+sj.cur.slice(1,5).map(function(o,i){return sujetBtn(o,i+1,"cur");}).join("")+'</div>';
  }else{
    h+='<div class="card"><h2>Rien en cours</h2><p class="hint">Ajoute un devoir ou fabrique une carte mentale : le test du moment apparaîtra ici.</p></div>';
  }
  h+='<div class="section-title"><h2>Réviser un ancien chapitre</h2><span class="count">'+sj.old.length+'</span></div>';
  h+=sj.old.length?'<div class="saved">'+sj.old.map(function(o,i){return sujetBtn(o,i,"old");}).join("")+'</div>'
    :'<p class="hint">Les chapitres de plus de '+JOURS_RECENT+' jours apparaîtront ici pour les réviser.</p>';
  h+='<div class="card"><h3>Un autre sujet</h3><div><label class="lbl" for="quizSujet">Sur quoi ?</label><input type="text" id="quizSujet" value="'+esc(ui.prefill||ui.quizSujet||"")+'" placeholder="Ex : le théorème de Pythagore"></div>'+
   '<button class="btn" data-act="quiz-make"'+(sample?'':' disabled')+'>Commencer</button></div>';
  var tests=S.tests.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");}).slice(0,5);
  if(tests.length){h+='<div class="section-title"><h2>Mes derniers tests</h2></div><div class="card histo">'+tests.map(histoLine).join("")+'</div>';}
  return '<div class="wrap">'+h+'</div>';
}
function histoLine(t){return '<div><span>'+esc(t.sujet)+(t.exemple?'<span class="ex">exemple</span>':'')+'</span><span class="s">'+t.score+' / '+t.total+'</span></div>';}

/* ---------- PARENT ---------- */
/* ---------- NOTES ---------- */
function auDessus(x){return x&&x.sur>0&&x.note/x.sur>=.5;}
function hash(t){var h=0;t=String(t||"");for(var i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return Math.abs(h);}
function messageNote(x){
  var n=String(x.note).replace(".",","),ns=n+" sur "+x.sur,m=x.matiere,p=S.reglages.prenom||"Ethan";
  var top=x.note/x.sur>=.8;
  var bravo=top?["Excellent "+p+" ! "+ns+" en "+m+". Tu peux être très fier de toi.","Waouh, "+ns+" en "+m+" ! Ton travail paie vraiment."]
    :["Bravo "+p+" ! "+ns+" en "+m+", c'est au-dessus de la moyenne.","Super travail en "+m+" ! Tes efforts paient, continue comme ça.","Bien joué ! "+ns+" en "+m+". Tu as réussi."];
  var courage=["Ce n'est qu'une note, pas ce que tu vaux. On révise ce chapitre ensemble et la prochaine sera meilleure.",
    "Courage "+p+" ! Tout le monde a des notes difficiles. Chaque erreur t'aide à apprendre.",
    "Pas grave ! Tu as essayé, c'est déjà bien. Une carte mentale va t'aider pour la prochaine fois."];
  var arr=auDessus(x)?bravo:courage;return arr[hash(x.cree)%arr.length];
}
function noteForm(){
  if(!ui.noteOpen)return '<button class="btn big ghost" data-act="note-open">'+ICON.plus+'Ajouter une note</button>';
  return '<div class="card"><h2>Nouvelle note</h2>'+
   '<div><span class="lbl">Quelle matière ?</span><div class="matieres">'+MATIERES.map(function(m){
      return '<button class="mbtn" style="--mc:'+m.c+'" aria-pressed="'+(ui.noteM===m.k)+'" data-act="note-m" data-m="'+esc(m.k)+'">'+esc(m.k)+'</button>';}).join("")+'</div></div>'+
   '<div class="row" style="flex-wrap:nowrap"><div style="flex:1"><label class="lbl" for="noteVal">La note</label><input type="text" inputmode="decimal" id="noteVal" value="'+esc(ui.noteVal||"")+'" placeholder="12"></div>'+
   '<div style="flex:1"><label class="lbl" for="noteSur">Sur</label><select id="noteSur">'+[20,10,5,40,100].map(function(v){return '<option'+(+ui.noteSur===v?" selected":"")+'>'+v+'</option>';}).join("")+'</select></div></div>'+
   '<div><label class="lbl" for="noteChap">Le chapitre (si tu sais)</label><input type="text" id="noteChap" value="'+esc(ui.noteChap||"")+'" placeholder="Ex : les fractions"></div>'+
   (ui.noteErr?'<p class="err">'+esc(ui.noteErr)+'</p>':'')+
   '<div class="row"><button class="btn" data-act="note-save">Enregistrer</button><button class="btn line" data-act="note-close">Annuler</button></div></div>';
}
function messageCard(x){
  var ok=auDessus(x),msg=messageNote(x),ch=x.chapitre?x.matiere+" : "+x.chapitre:x.matiere;
  return '<div class="card '+(ok?"bravo":"courage")+'"><strong>'+(ok?"Bravo !":"Courage !")+'</strong><p>'+esc(msg)+'</p>'+
   '<div class="row" style="justify-content:center">'+sayBtn(msg,"Écouter")+
   (ok?'<span class="hint">+3 étoiles</span>':'<button class="btn small" data-act="go-carte" data-sujet="'+esc(ch)+'">Faire une carte mentale</button><button class="btn small ghost" data-act="go-test" data-sujet="'+esc(ch)+'">M\'entraîner</button>')+
   '</div></div>';
}
function vNotes(){
  var notes=S.notes.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");});
  var h='';
  var last=ui.noteJust?notes.filter(function(x){return x.cree===ui.noteJust;})[0]:notes[0];
  if(last)h+=messageCard(last);
  h+=noteForm();
  if(notes.length){
    var par={};notes.forEach(function(x){(par[x.matiere]=par[x.matiere]||[]).push(x.note/x.sur*20);});
    h+='<div class="section-title"><h2>Mes moyennes</h2></div><div class="card histo">'+Object.keys(par).map(function(m){
      var v=par[m].reduce(function(a,b){return a+b;},0)/par[m].length;
      return '<div><span><span class="chip" style="--mc:'+mcolor(m)+'">'+esc(m)+'</span></span><span class="s">'+v.toFixed(1).replace(".",",")+' / 20</span></div>';}).join("")+'</div>';
    h+='<div class="section-title"><h2>Mes notes</h2><span class="count">'+notes.length+'</span></div><div class="card histo">'+notes.slice(0,12).map(function(x){
      return '<div><span>'+esc(x.matiere)+(x.chapitre?' · '+esc(x.chapitre):'')+'<br><span class="hint">'+esc(fmtWhen(x.cree).split(" à ")[0])+'</span></span><span class="s"><span class="niveau '+(auDessus(x)?"n3":"n2")+'" style="padding:2px 10px">'+esc(String(x.note).replace(".",","))+' / '+x.sur+'</span></span></div>';}).join("")+'</div>';
  }else h+='<p class="hint">Quand tu as une note, ajoute-la ici.</p>';
  h+='<p class="hint">Les notes de Pronote arrivent toutes seules. Tu peux aussi en ajouter une à la main.</p>';
  return '<div class="wrap">'+h+'</div>';
}

function alertesCard(){
  var on=ui.alertes;
  return '<div class="card"><h2>Alertes sur ce téléphone</h2>'+
    (on?'<p><b>Activées.</b> Tu seras prévenu 30 min après la fin des cours s\'il n\'a pas commencé, 30 min plus tard s\'il n\'a toujours pas commencé, et quand il a tout fini.</p>'
      :'<p>Active les alertes pour être prévenu sur ce téléphone.</p><button class="btn" data-act="alertes">Activer les alertes</button>')+
    (ui.alertesErr?'<p class="err">'+esc(ui.alertesErr)+'</p>':'')+'</div>';
}
function pronoteCard(){
  var st=ui.pronote,h='<div class="card"><h2>Pronote</h2>';
  if(st&&st.lie&&!ui.pronoteRelier){
    h+='<p><b>Relié.</b> Dernière mise à jour : '+esc(st.derniere_synchro?fmtWhen(st.derniere_synchro):"pas encore")+'.</p>'+
      (st.erreur?'<p class="err">La dernière mise à jour n\'a pas marché. Si ça dure, relie Pronote à nouveau.</p>':'')+
      '<div class="row"><button class="btn" data-act="pronote-synchro"'+(ui.pronoteBusy?" disabled":"")+'>'+(ui.pronoteBusy?"Mise à jour…":"Mettre à jour maintenant")+'</button>'+
      '<button class="btn line" data-act="pronote-relier">Relier à nouveau</button></div>';
  }else{
    h+='<p>Les devoirs, les notes, les cours des profs et l\'emploi du temps arriveront tout seuls.</p>'+
      '<ol class="etapes"><li>Sur un ordinateur, ouvre le Pronote d\'Ethan (par Paris Classe Numérique).</li>'+
      '<li>En haut de la page, clique sur l\'icône du <b>QR code</b>.</li>'+
      '<li>Choisis un code à 4 chiffres. Un QR code s\'affiche.</li>'+
      '<li>Écris ce code ici, puis scanne le QR code avec ce téléphone.</li></ol>'+
      '<div><label class="lbl" for="pnPin">Le code à 4 chiffres</label><input type="text" inputmode="numeric" maxlength="4" id="pnPin" value="'+esc(ui.pnPin||"")+'" placeholder="1234"></div>'+
      '<button class="btn" data-act="pronote-scan"'+(ui.pronoteBusy?" disabled":"")+'>'+ICON.photo+(ui.pronoteBusy?"Liaison en cours…":"Scanner le QR code")+'</button>';
  }
  if(ui.pronoteMsg)h+='<p class="'+(ui.pronoteOk?"note":"err")+'">'+esc(ui.pronoteMsg)+'</p>';
  return h+'</div>';
}
function enfantCard(){
  var a=S.membres&&S.membres.some(function(m){return m.role==="enfant";}),p=S.reglages.prenom||"Ethan";
  var h='<div class="card"><h2>Le compte de '+esc(p)+'</h2>';
  if(ui.codeEnfant)h+='<div class="note"><p>Sur le téléphone de '+esc(p)+', ouvre DysOrga, touche « Je suis '+esc(p)+' » et écris :</p>'+
    '<p>Identifiant : <b class="code">'+esc(ui.codeEnfant.identifiant)+'</b></p><p>Code : <b class="code">'+esc(ui.codeEnfant.code)+'</b></p>'+
    '<p class="hint">Note-les : le code ne sera plus affiché ensuite.</p></div>';
  h+=(a?'<p class="hint">Son compte existe. Un nouveau code remplace l\'ancien.</p><button class="btn line" data-act="compte-enfant">Nouveau code</button>'
       :'<p>Crée son compte pour qu\'il se connecte sur son téléphone, sans adresse e-mail.</p><button class="btn" data-act="compte-enfant">Créer son compte</button>');
  return h+'</div>';
}
function rafraichirParent(){
  pronoteStatut().then(function(st){ui.pronote=st;render();});
  alertesActives().then(function(on){ui.alertes=on;render();});
  supa.from("membres").select("role, prenom").then(function(r){S.membres=r.data||[];render();});
}

function vParent(){
  var demain=addDays(1),su=S.suivi||{};
  var dd=S.devoirs.filter(function(d){return d.pour===demain;}),ddFaits=dd.filter(function(d){return d.fait;}).length;
  var connecte=su.derniere_connexion&&dayKey(new Date(su.derniere_connexion))===dayKey();
  var heure=new Date().getHours();
  var kCo=connecte?"good":(heure>=18?"bad":"warn");
  var kDev=!dd.length?"":(ddFaits===dd.length?"good":(heure>=19?"bad":"warn"));
  var tests=S.tests.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");}).slice(0,6);
  var h='<div class="kpis">'+
   (function(){var f=finCours(),c=aCommence(),k=c?"good":(f&&fmtTime(new Date().toISOString())>=f?"warn":"");
     return '<div class="card kpi '+k+'"><span class="hint">Devoirs commencés</span><span class="v">'+(c?"Oui, à "+fmtTime(c):"Pas encore")+'</span><span class="hint">'+(f?"Fin des cours aujourd\'hui : "+f.replace(":","h"):"Pas cours aujourd\'hui (planning)")+'</span></div>';})()+
   '<div class="card kpi '+kCo+'"><span class="hint">Connexion aujourd\'hui</span><span class="v">'+(connecte?"Oui, à "+fmtTime(su.derniere_connexion):"Pas encore")+'</span><span class="hint">Dernière activité : '+esc(fmtWhen(su.derniere_activite))+'</span></div>'+
   '<div class="card kpi '+kDev+'"><span class="hint">Devoirs pour demain</span><span class="v">'+(dd.length?ddFaits+" / "+dd.length+" faits":"Aucun noté")+'</span><span class="hint">'+
     (dd.length&&ddFaits===dd.length&&su.devoirs_finis_le?"Fini "+esc(fmtWhen(su.devoirs_finis_le)):"")+'</span></div>'+
   '<div class="card kpi"><span class="hint">Cartes mentales</span><span class="v">'+S.cartes.length+'</span><span class="hint">Tests faits : '+S.tests.length+'</span></div></div>';
  h+=alertesCard()+pronoteCard();
  h+='<div class="note"><b>Règles de l\'assistant :</b> il ne donne jamais la réponse d\'un exercice et ne fait pas le travail à la place d\'Ethan. Il refuse ce qui n\'est pas de la révision. L\'appli n\'a aucun lien vers internet et pas de discussion libre.</div>';
  var notes=S.notes.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");}).slice(0,6);
  if(notes.length)h+='<div class="section-title"><h2>Dernières notes</h2></div><div class="card histo">'+notes.map(function(x){
    return '<div><span>'+esc(x.matiere)+(x.chapitre?' · '+esc(x.chapitre):'')+'<br><span class="hint">'+esc(fmtWhen(x.cree))+'</span></span><span class="s"><span class="niveau '+(auDessus(x)?"n3":"n2")+'" style="padding:2px 10px">'+esc(String(x.note).replace(".",","))+' / '+x.sur+'</span></span></div>';}).join("")+'</div>';
  if(tests.length)h+='<div class="section-title"><h2>Résultats des mini-tests</h2></div><div class="card histo">'+tests.map(function(t){
    var n=niveau(t.score,t.total);return '<div><span>'+esc(t.sujet)+(t.exemple?'<span class="ex">exemple</span>':'')+'<br><span class="hint">'+esc(fmtWhen(t.cree))+'</span></span><span class="s"><span class="niveau '+n[0]+'" style="padding:2px 10px">'+t.score+' / '+t.total+'</span></span></div>';}).join("")+'</div>';
  h+=addForm();
  var pl=S.reglages.planning||{};
  h+='<div class="card"><h2>Planning et rappels</h2><p class="hint">Quand Pronote est relié, l\'emploi du temps est lu tout seul. Sinon, indique l\'heure de fin des cours chaque jour (laisse vide s\'il n\'a pas cours). Tu reçois un rappel 30 min après s\'il n\'a pas commencé, puis un autre 30 min plus tard.</p>'+
   '<div class="histo">'+JOURS.map(function(j){return '<div style="align-items:center"><label for="pl'+j[0]+'">'+j[1]+'</label><input type="time" id="pl'+j[0]+'" value="'+esc(pl[j[0]]||"")+'" style="max-width:150px"></div>';}).join("")+'</div>'+
   '<button class="btn" data-act="plan-save">Enregistrer le planning</button></div>';
  h+='<div class="card"><h2>Réglages</h2><div><label class="lbl" for="rPrenom">Prénom</label><input type="text" id="rPrenom" value="'+esc(S.reglages.prenom||"")+'"></div>'+
   '<div><label class="lbl" for="rClasse">Classe</label><select id="rClasse">'+["","6e","5e","4e","3e","CM2","Seconde"].map(function(c){return '<option value="'+c+'"'+(S.reglages.classe===c?" selected":"")+'>'+(c||"Choisir")+'</option>';}).join("")+'</select></div>'+
   '<p class="hint">La classe sert à adapter le niveau des cartes et des tests.</p><button class="btn" data-act="reg-save">Enregistrer</button>'+
   '</div>';
  h+=enfantCard();
  h+='<button class="btn big line" data-act="deconnexion">Me déconnecter</button>';
  return '<div class="wrap">'+h+'</div>';
}

/* ---------- actions ---------- */
document.addEventListener("click",function(e){
  var t=e.target.closest("[data-act],nav.tabs button");if(!t)return;
  if(t.dataset.tab){tab=t.dataset.tab;ls("cartable.tab",tab);ui.prefill="";render();window.scrollTo(0,0);return;}
  var a=t.dataset.act,id=t.dataset.id;
  if(a==="toggle")toggleDevoir(id);
  else if(a==="add-open"){ui.addOpen=true;ui.addM="";ui.addTxt="";ui.addQ=addDays(1);render();}
  else if(a==="add-close"){ui.addOpen=false;render();}
  else if(a==="add-m"){ui.addTxt=$("#addTxt").value;ui.addM=t.dataset.m;render();}
  else if(a==="add-q"){ui.addTxt=$("#addTxt").value;ui.addQ=t.dataset.q;render();}
  else if(a==="add-save"){var txt=$("#addTxt").value.trim(),q=$("#addDate").value||ui.addQ;
    if(!txt){$("#addTxt").focus();return;}
    Store.add("devoirs",{matiere:ui.addM||"Autre",texte:txt,pour:q,fait:false});ui.addOpen=false;render();}
  else if(a==="note-open"){ui.noteOpen=true;ui.noteM="";ui.noteVal="";ui.noteSur=20;ui.noteChap="";ui.noteErr="";render();}
  else if(a==="note-close"){ui.noteOpen=false;render();}
  else if(a==="note-m"){keepNote();ui.noteM=t.dataset.m;render();}
  else if(a==="note-save"){keepNote();var nv=parseFloat(String(ui.noteVal).replace(",",".")),sur=+ui.noteSur||20;
    if(!ui.noteM){ui.noteErr="Choisis la matière.";render();return;}
    if(isNaN(nv)||nv<0||nv>sur){ui.noteErr="Écris une note entre 0 et "+sur+".";render();return;}
    var obj={matiere:ui.noteM,note:nv,sur:sur,chapitre:(ui.noteChap||"").trim()};
    Store.add("notes",obj);ui.noteJust=obj.cree;ui.noteOpen=false;
    if(device==="enfant")Store.setDoc("suivi",{derniere_activite:new Date().toISOString()});
    render();window.scrollTo(0,0);speak(messageNote(obj));}
  else if(a==="go-carte"){tab="cartes";ui.map=null;ui.prefill=t.dataset.sujet;render();window.scrollTo(0,0);}
  else if(a==="go-test"){tab="tests";ui.quiz=null;ui.prefill=t.dataset.sujet;render();window.scrollTo(0,0);}
  else if(a==="photo-del"){var k=+t.dataset.i,p=ui.photos.splice(k,1)[0];if(p)try{URL.revokeObjectURL(p.url);}catch(_){}render();}
  else if(a==="map-make"){ui.prefill="";makeMap();}
  else if(a==="map-open"){ui.map=S.cartes.filter(function(c){return c.id===id;})[0]||null;render();window.scrollTo(0,0);}
  else if(a==="map-close"){ui.map=null;render();}
  else if(a==="map-test"){var m=ui.map;ui.map=null;makeQuiz(m.titre||m.sujet,m);}
  else if(a==="quiz-make"){var s=$("#quizSujet").value;ui.prefill="";makeQuiz(s);}
  else if(a==="quiz-sujet"){var lst=ui.sujets&&ui.sujets[t.dataset.mode],o=lst&&lst[+t.dataset.i];
    if(o){var cc=o.carteId?S.cartes.filter(function(x){return x.id===o.carteId;})[0]:null;makeQuiz(o.titre,cc,t.dataset.mode==="old");}}
  else if(a==="quiz-carte"){var c=S.cartes.filter(function(x){return x.id===id;})[0];if(c)makeQuiz(c.titre||c.sujet,c);}
  else if(a==="quiz-ans"){var z=ui.quiz;if(z.solved)return;var i=+t.dataset.i,ok=i===z.qs[z.i].bonne;
    if(z.rep.length===z.i)z.rep.push(ok);
    if(ok)z.solved=true;else z.tried.push(i);
    speak(ok?"Bravo, tu as trouvé !":"Pas encore. Regarde l'indice.");render();}
  else if(a==="quiz-next"){var z2=ui.quiz;z2.i++;z2.tried=[];z2.solved=false;
    if(z2.i>=z2.qs.length){var sc=z2.rep.filter(Boolean).length;Store.add("tests",{sujet:z2.sujet,score:sc,total:z2.qs.length});
      if(device==="enfant")Store.setDoc("suivi",{derniere_activite:new Date().toISOString()});}
    render();window.scrollTo(0,0);}
  else if(a==="quiz-again"){var su=ui.quiz.sujet;ui.quiz=null;ui.quizSujet=su;render();}
  else if(a==="quiz-close"){ui.quiz=null;render();}
  else if(a==="reg-save"){Store.setDoc("reglages",{prenom:$("#rPrenom").value.trim()||"Ethan",classe:$("#rClasse").value});}
  else if(a==="theme-open")themeOpen();
  else if(a==="org-start"){ui.org={type:t.dataset.type};render();}
  else if(a==="org-close"){ui.org=null;render();}
  else if(a==="org-next"){var og=ui.org;og.i++;render();if(og.i<og.etapes.length)speak(og.etapes[og.i].texte);else speak("Bravo ! Tu peux reprendre une photo pour que je vérifie.");}
  else if(a==="commence"){Store.setDoc("suivi",{debut_devoirs:new Date().toISOString(),derniere_activite:new Date().toISOString()});speak("C'est parti ! Commence par le premier devoir.");}
  else if(a==="plan-save"){var pl2={};JOURS.forEach(function(j){var v=$("#pl"+j[0]).value;if(v)pl2[j[0]]=v;});Store.setDoc("reglages",{planning:pl2});ui.planOk=true;}
  else if(a==="theme-close"){ui.themeOpen=false;clearInterval(themeTick);renderTheme();}
  else if(a==="theme-c"){if(themeReste()<=0)return;Store.setDoc("reglages",{couleur:t.dataset.c});applyTheme();renderTheme();}
  else if(a==="fond-off"){if(themeReste()<=0)return;Store.setDoc("reglages",{avec_fond:false});applyTheme();renderTheme();}
  else if(a==="photo-cam"){ouvrirCamera("photo","Prends ta leçon en photo, bien à plat.").then(function(b){if(b)addPhotos([b]);});}
  else if(a==="org-cam"){ouvrirCamera("photo",ui.org&&ui.org.type==="bureau"?"Prends tout ton bureau, de haut.":"Prends ton cahier ouvert, bien à plat.").then(function(b){if(b)orgPhoto(b);});}
  else if(a==="doc-carte"){ui.prefill="";makeMap(id);}
  else if(a==="alertes"){ui.alertesErr="";activerAlertes().then(function(){ui.alertes=true;render();}).catch(function(e){
    ui.alertesErr=e&&e.code==="refuse"?"Les notifications sont bloquées. Autorise-les pour DysOrga dans les réglages du téléphone.":"Ce téléphone ne permet pas les alertes. Installe DysOrga sur l'écran d'accueil avec Chrome.";render();});}
  else if(a==="pronote-relier"){ui.pronoteRelier=true;ui.pronoteMsg="";render();}
  else if(a==="pronote-scan"){var pin=($("#pnPin").value||"").trim();ui.pnPin=pin;
    if(!/^\d{4}$/.test(pin)){ui.pronoteOk=false;ui.pronoteMsg="Écris d'abord le code à 4 chiffres choisi sur Pronote.";render();return;}
    ouvrirCamera("qr","Vise le QR code affiché par Pronote.").then(function(txt){
      if(!txt)return;var qr;try{qr=JSON.parse(txt);}catch(_){}
      if(!qr||!qr.jeton||!qr.url){ui.pronoteOk=false;ui.pronoteMsg="Ce n'est pas le QR code de Pronote. Réessaie.";render();return;}
      ui.pronoteBusy=true;ui.pronoteMsg="";render();
      pronoteLier(qr,pin).then(function(r){ui.pronoteBusy=false;ui.pronoteRelier=false;ui.pronoteOk=true;
        ui.pronoteMsg="C'est relié ! "+(r.devoirs||0)+" devoir(s) récupéré(s).";rafraichirParent();recharger();})
      .catch(function(){ui.pronoteBusy=false;ui.pronoteOk=false;ui.pronoteMsg="La liaison n'a pas marché. Le QR code ne dure que quelques minutes : génère-en un nouveau et réessaie.";render();});});}
  else if(a==="pronote-synchro"){ui.pronoteBusy=true;ui.pronoteMsg="";render();
    pronoteSynchro().then(function(){ui.pronoteBusy=false;ui.pronoteOk=true;ui.pronoteMsg="À jour.";rafraichirParent();recharger();})
    .catch(function(){ui.pronoteBusy=false;ui.pronoteOk=false;ui.pronoteMsg="La mise à jour n'a pas marché. Réessaie plus tard.";rafraichirParent();});}
  else if(a==="compte-enfant"){creerCompteEnfant(S.reglages.prenom||"Ethan").then(function(r){ui.codeEnfant=r;rafraichirParent();})
    .catch(function(){showSync("La création du compte n'a pas marché. Réessaie.");});}
  else if(a==="deconnexion"){deconnexion().then(function(){location.reload();});}
});
document.addEventListener("input",function(e){if(e.target.id==="mapSujet"||e.target.id==="quizSujet"){ui.prefill="";ui[e.target.id]=e.target.value;}if(e.target.id==="mapLecon")ui.mapLecon=e.target.value;});
document.addEventListener("change",function(e){if(e.target.id==="fondFile"&&e.target.files&&e.target.files[0])setFond(e.target.files[0]);if(e.target.id==="mapImg"&&device==="parent"&&e.target.files&&e.target.files.length)addPhotos(e.target.files);});

function keepNote(){var v=$("#noteVal"),s2=$("#noteSur"),c=$("#noteChap");if(v)ui.noteVal=v.value;if(s2)ui.noteSur=s2.value;if(c)ui.noteChap=c.value;}
function markConnexion(){
  if(device!=="enfant")return;
  var last=S.suivi&&S.suivi.derniere_connexion;
  if(!last||dayKey(new Date(last))!==dayKey())Store.setDoc("suivi",{derniere_connexion:new Date().toISOString()});
}

/* ---------- connexion ---------- */
function vConnexion(){
  var m=ui.login||"",h='<div class="wrap login"><h1>DysOrga</h1>';
  if(!m)h+='<p>Qui es-tu ?</p><button class="btn big" data-login="enfant">Je suis l\'élève</button><button class="btn big ghost" data-login="parent">Je suis le parent</button>';
  else if(m==="enfant")h+='<div class="card"><h2>Connexion élève</h2>'+
    '<div><label class="lbl" for="lgId">Identifiant</label><input type="text" id="lgId" autocomplete="username" autocapitalize="none" placeholder="ethan-1a2b"></div>'+
    '<div><label class="lbl" for="lgCode">Code</label><input type="text" inputmode="numeric" id="lgCode" autocomplete="current-password" placeholder="6 chiffres"></div>'+
    '<button class="btn big" data-login="go-enfant">Entrer</button><button class="btn line" data-login="">Retour</button></div>';
  else h+='<div class="card"><h2>Espace parent</h2>'+
    '<div><label class="lbl" for="lgMail">Adresse e-mail</label><input type="text" inputmode="email" id="lgMail" autocomplete="email" autocapitalize="none"></div>'+
    '<div><label class="lbl" for="lgPass">Mot de passe</label><input type="password" id="lgPass" autocomplete="current-password"></div>'+
    '<button class="btn big" data-login="go-parent">Me connecter</button><button class="btn ghost" data-login="new-parent">Créer mon compte</button><button class="btn line" data-login="">Retour</button></div>';
  if(ui.loginMsg)h+='<p class="'+(ui.loginOk?"note":"err")+'">'+esc(ui.loginMsg)+'</p>';
  return h+'</div>';
}
document.addEventListener("click",function(e){
  var b=e.target.closest("[data-login]");if(!b)return;var a=b.dataset.login;ui.loginMsg="";
  if(a===""||a==="enfant"||a==="parent"){ui.login=a;$("#view").innerHTML=vConnexion();return;}
  var p;
  if(a==="go-enfant")p=connexionEnfant($("#lgId").value,$("#lgCode").value);
  else if(a==="go-parent")p=connexionParent($("#lgMail").value.trim(),$("#lgPass").value);
  else p=inscriptionParent($("#lgMail").value.trim(),$("#lgPass").value).then(function(ok){
    if(!ok){ui.loginOk=true;throw {message:"Compte créé. Ouvre l'e-mail reçu pour le confirmer, puis connecte-toi."};}});
  b.disabled=true;
  p.then(demarrer).catch(function(err){ui.loginMsg=(err&&err.message&&ui.loginOk)?err.message:"Identifiant ou code incorrect. Réessaie.";$("#view").innerHTML=vConnexion();ui.loginOk=false;});
});

function recharger(){return toutCharger(S).then(function(){
  return supa.from("emploi_du_temps").select("jour, fin").gte("jour",dayKey()).then(function(r){S.edt=r.data||[];render();});});}

function demarrer(){
  return utilisateur().then(function(u){
    if(!u){document.body.classList.add("sans-nav");$("#view").innerHTML=vConnexion();return;}
    return monProfil().then(function(p){
      profil=p;device=p.role;document.body.classList.remove("sans-nav");
      if(device==="parent"&&tab==="devoirs"&&!ls("cartable.tab"))tab="parent";
      return recharger().then(function(){
        ecouter(S,render);
        if(device==="parent")rafraichirParent();else markConnexion();
        render();
      });
    });
  }).catch(function(e){console.warn(e);showSync("Impossible de se connecter au serveur. Vérifie internet.");});
}
document.addEventListener("visibilitychange",function(){if(!document.hidden&&profil){recharger();if(device==="enfant")markConnexion();}});
if("serviceWorker" in navigator)navigator.serviceWorker.register(import.meta.env.BASE_URL+"sw.js",{type:"module"}).catch(function(){});
demarrer();
