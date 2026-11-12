// DysOrga : l'écran de l'appli (enfant et parent). Devoirs, planning, notes et vie scolaire, lus dans Pronote.
import "./styles.css";
import { supa, utilisateur, connexionParent, inscriptionParent, connexionEnfant, deconnexion, monProfil, toutCharger, ecouter, creerStore,
  pronoteLier, pronoteSynchro, pronoteStatut, pronoteDevoirFait, creerCompteEnfant, activerAlertes, alertesActives } from "./api.js";
import { ouvrirCamera, lireQrImage } from "./camera.js";

var MATIERES=[
  {k:"Français",c:"var(--m-fr)"},{k:"Maths",c:"var(--m-ma)"},{k:"Histoire-Géo",c:"var(--m-hg)"},
  {k:"SVT",c:"var(--m-sv)"},{k:"Anglais",c:"var(--m-an)"},{k:"Physique-Chimie",c:"var(--m-ph)"},{k:"Autre",c:"var(--m-au)"}];
function mcolor(m){for(var i=0;i<MATIERES.length;i++)if(MATIERES[i].k===m)return MATIERES[i].c;return "var(--m-au)";}
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
function speak(text){if(!canSpeak)return;try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(text);u.lang="fr-FR";u.rate=1.1;
  var v=speechSynthesis.getVoices().filter(function(x){return /^fr/i.test(x.lang);})[0];if(v)u.voice=v;speechSynthesis.speak(u);}catch(e){}}
function sayBtn(text,label){if(!canSpeak)return "";return '<button class="say" data-say="'+esc(text)+'" aria-label="'+esc(label||"Écouter")+'" title="Écouter">'+ICON.speak+'</button>';}
document.addEventListener("click",function(e){var b=e.target.closest("[data-say]");if(b){e.preventDefault();speak(b.getAttribute("data-say"));}});


/* ---------- données (Supabase) ---------- */
var S={devoirs:[],notes:[],cours:[],observations:[],edt:[],suivi:{},reglages:{prenom:"Ethan",classe:"4e"}};
var device="enfant", profil=null;
var Store=creerStore(S,function(){render();},dbErr);
function dbErr(e){showSync("La sauvegarde n'a pas marché. Vérifie ta connexion internet et réessaie.");console.warn(e);}
function showSync(t){var n=$("#syncNote");n.textContent=t;n.hidden=!t;}

/* ---------- étoiles ---------- */
function stars(){var n=0;S.devoirs.forEach(function(d){if(d.fait)n+=1;});S.notes.forEach(function(x){if(auDessus(x))n+=3;});return n;}

/* ---------- état de l'écran ---------- */
var ONGLETS=["devoirs","planning","notes","observations","parent"];
var tab=ls("cartable.tab");if(ONGLETS.indexOf(tab)<0)tab="devoirs";
var ui={addOpen:false,addM:"",addQ:addDays(1)};

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
  v.innerHTML=tab==="devoirs"?vDevoirs():tab==="planning"?vPlanning():tab==="notes"?vNotes():tab==="observations"?vObservations():vParent();
}

/* ---------- DEVOIRS ---------- */
function devoirCard(d){
  var c=mcolor(d.matiere),fait=!!d.fait;
  return '<div class="card devoir'+(fait?" fait":"")+'" style="--mc:'+c+'">'+
   '<button class="check" data-act="toggle" data-id="'+esc(d.id)+'" aria-label="'+(fait?"Pas encore fait":"C\'est fait")+'">'+ICON.check+'</button>'+
   '<div class="body"><div class="row"><span class="chip">'+esc(d.matiere)+'</span><span class="hint">pour '+esc(fmtDay(d.pour))+'</span></div>'+
   '<p class="txt">'+esc(d.texte)+'</p>'+
   '<div class="row">'+sayBtn(d.matiere+". "+d.texte,"Écouter le devoir")+'</div></div></div>';
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
function vDevoirs(){
  var demain=addDays(1);
  var todo=S.devoirs.filter(function(d){return !d.fait;}).sort(function(a,b){return (a.pour||"").localeCompare(b.pour||"");});
  var proches=todo.filter(function(d){return d.pour<=demain;}), plus=todo.filter(function(d){return d.pour>demain;});
  var faits=S.devoirs.filter(function(d){return d.fait&&d.pour>=dayKey();}).sort(function(a,b){return (a.pour||"").localeCompare(b.pour||"");});
  var pourDemain=S.devoirs.filter(function(d){return d.pour===demain;});
  var h='';
  if(device==="enfant"&&!aCommence()&&todo.length)h+='<button class="btn big" data-act="commence">Je commence mes devoirs</button>';
  if(pourDemain.length&&proches.length===0)h+='<div class="card bravo"><strong>Bravo, tout est fini pour demain !</strong><p>Tu peux te reposer.</p></div>';
  h+='<div class="section-title"><h2>À faire pour demain</h2><span class="count">'+proches.length+' restant'+(proches.length>1?"s":"")+'</span></div>';
  h+=proches.length?proches.map(devoirCard).join(""):'<p class="hint">Rien pour demain.</p>';
  if(plus.length){h+='<div class="section-title"><h2>Plus tard</h2><span class="count">'+plus.length+'</span></div>'+plus.map(devoirCard).join("");}
  if(device==="parent")h+=addForm();
  if(faits.length){h+='<div class="section-title"><h2>Déjà fait</h2></div>'+faits.map(devoirCard).join("");}
  return '<div class="wrap">'+h+'</div>';
}
// Ethan coche lui-même : c'est fait. La coche part aussi dans Pronote.
function toggleDevoir(id){
  var d=S.devoirs.filter(function(x){return x.id===id;})[0];if(!d)return;
  var fait=!d.fait,maintenant=new Date().toISOString();
  Store.upd("devoirs",id,{fait:fait,fait_le:fait?maintenant:null});
  if(d.source==="pronote")pronoteDevoirFait(id,fait).catch(function(){});
  if(device==="enfant"){
    var patch={derniere_activite:maintenant};
    if(fait){var demain=addDays(1);
      if(!S.devoirs.some(function(x){return x.pour<=demain&&x.pour>=dayKey()&&!x.fait;}))patch.devoirs_finis_le=maintenant;
      speak("C'est noté, bravo !");}
    Store.setDoc("suivi",patch);
  }
}

/* ---------- PLANNING (emploi du temps de Pronote) ---------- */
function hm(t){return String(t||"").slice(0,5).replace(":","h");}
function vPlanning(){
  var auj=dayKey(),parJour={};
  S.cours.filter(function(c){return c.jour>=auj;}).sort(function(a,b){return (a.jour+a.debut).localeCompare(b.jour+b.debut);})
    .forEach(function(c){(parJour[c.jour]=parJour[c.jour]||[]).push(c);});
  var jours=Object.keys(parJour).sort(),h='';
  if(!jours.length)h+='<div class="card"><h2>Pas encore de planning</h2><p class="hint">L\'emploi du temps arrive tout seul depuis Pronote.</p></div>';
  jours.forEach(function(j){
    var t=fmtDay(j);
    h+='<div class="section-title"><h2>'+esc(t.charAt(0).toUpperCase()+t.slice(1))+'</h2><span class="count">'+esc(hm(parJour[j][0].debut))+' → '+esc(hm(parJour[j][parJour[j].length-1].fin))+'</span></div>';
    h+='<div class="card histo">'+parJour[j].map(function(c){
      var info=[c.salle,c.prof].filter(Boolean).join(" · ");
      return '<div class="cours'+(c.annule?" annule":"")+'"><span><span class="chip" style="--mc:'+mcolor(c.matiere)+'">'+esc(c.matiere)+'</span>'+
        (c.annule?' <b class="err-txt">Annulé</b>':'')+(info?'<br><span class="hint">'+esc(info)+'</span>':'')+'</span>'+
        '<span class="s">'+esc(hm(c.debut))+' – '+esc(hm(c.fin))+'</span></div>';}).join("")+'</div>';
  });
  return '<div class="wrap">'+h+'</div>';
}

/* ---------- OBSERVATIONS (vie scolaire de Pronote) ---------- */
var GENRES={encouragement:["👍","Encouragement","bravo"],observation:["📝","Observation",""],carnet:["📒","Carnet",""],
  retard:["⏰","Retard","courage"],absence:["🚪","Absence",""],punition:["⚠️","Punition","courage"]};
function vObservations(){
  var obs=S.observations.slice().sort(function(a,b){return (b.date||"").localeCompare(a.date||"");}),h='';
  if(!obs.length)h+='<div class="card"><h2>Rien pour l\'instant</h2><p class="hint">Les observations, encouragements, retards et absences de Pronote arrivent ici tout seuls.</p></div>';
  h+=obs.map(function(o){
    var g=GENRES[o.genre]||["📝",o.genre,""],t=fmtDay(o.date),lire=g[1]+". "+o.titre+(o.detail?". "+o.detail:"");
    return '<div class="card '+g[2]+'"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><strong>'+g[0]+' '+esc(g[1])+'</strong><span class="hint">'+esc(t)+'</span></div>'+
      '<p>'+esc(o.titre)+(o.matiere?' <span class="chip" style="--mc:'+mcolor(o.matiere)+'">'+esc(o.matiere)+'</span>':'')+'</p>'+
      (o.detail?'<p class="hint">'+esc(o.detail)+'</p>':'')+'<div class="row">'+sayBtn(lire,"Écouter")+'</div></div>';}).join("");
  return '<div class="wrap">'+h+'</div>';
}

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
    "Pas grave ! Tu as essayé, c'est déjà bien. La prochaine fois sera meilleure."];
  var arr=auDessus(x)?bravo:courage;return arr[hash(x.cree)%arr.length];
}
function messageCard(x){
  var ok=auDessus(x),msg=messageNote(x);
  return '<div class="card '+(ok?"bravo":"courage")+'"><strong>'+(ok?"Bravo !":"Courage !")+'</strong><p>'+esc(msg)+'</p>'+
   '<div class="row" style="justify-content:center">'+sayBtn(msg,"Écouter")+
   (ok?'<span class="hint">+3 étoiles</span>':'')+
   '</div></div>';
}
function vNotes(){
  var notes=S.notes.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");});
  var h='';
  var last=ui.noteJust?notes.filter(function(x){return x.cree===ui.noteJust;})[0]:notes[0];
  if(last)h+=messageCard(last);
  if(notes.length){
    var par={};notes.forEach(function(x){(par[x.matiere]=par[x.matiere]||[]).push(x.note/x.sur*20);});
    h+='<div class="section-title"><h2>Mes moyennes</h2></div><div class="card histo">'+Object.keys(par).map(function(m){
      var v=par[m].reduce(function(a,b){return a+b;},0)/par[m].length;
      return '<div><span><span class="chip" style="--mc:'+mcolor(m)+'">'+esc(m)+'</span></span><span class="s">'+v.toFixed(1).replace(".",",")+' / 20</span></div>';}).join("")+'</div>';
    h+='<div class="section-title"><h2>Mes notes</h2><span class="count">'+notes.length+'</span></div><div class="card histo">'+notes.slice(0,12).map(function(x){
      return '<div><span>'+esc(x.matiere)+(x.chapitre?' · '+esc(x.chapitre):'')+'<br><span class="hint">'+esc(fmtWhen(x.cree).split(" à ")[0])+'</span></span><span class="s"><span class="niveau '+(auDessus(x)?"n3":"n2")+'" style="padding:2px 10px">'+esc(String(x.note).replace(".",","))+' / '+x.sur+'</span></span></div>';}).join("")+'</div>';
  }else h+='<p class="hint">Pas encore de note.</p>';
  h+='<p class="hint">Les notes de Pronote arrivent toutes seules.</p>';
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
    h+='<p>Les devoirs, les notes, le planning et les observations arriveront tout seuls.</p>'+
      '<ol class="etapes"><li>Ouvre le Pronote d\'Ethan (par Paris Classe Numérique), sur un ordinateur ou sur ce téléphone.</li>'+
      '<li>En haut de la page, touche l\'icône du <b>QR code</b>.</li>'+
      '<li>Choisis un code à 4 chiffres. Un QR code s\'affiche.</li>'+
      '<li>Écris ce code ici. Sur un ordinateur, scanne le QR code. Sur ce téléphone, fais une capture d\'écran du QR code, puis reviens ici et choisis-la.</li></ol>'+
      '<div><label class="lbl" for="pnPin">Le code à 4 chiffres</label><input type="text" inputmode="numeric" maxlength="4" id="pnPin" value="'+esc(ui.pnPin||"")+'" placeholder="1234"></div>'+
      (ui.pnSecuDemande?'<div><label class="lbl" for="pnSecu">Ton code de sécurité Pronote (celui de la double authentification)</label><input type="text" inputmode="numeric" maxlength="4" id="pnSecu" value="'+esc(ui.pnSecu||"")+'" placeholder="4 chiffres"></div>':'')+
      '<button class="btn" data-act="pronote-scan"'+(ui.pronoteBusy?" disabled":"")+'>'+ICON.photo+(ui.pronoteBusy?"Liaison en cours…":"Scanner le QR code")+'</button>'+
      '<label class="btn line" for="pnQrImg">Choisir la capture d\'écran</label><input type="file" id="pnQrImg" accept="image/*" hidden>';
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
  var h='<div class="kpis">'+
   (function(){var f=finCours(),c=aCommence(),k=c?"good":(f&&fmtTime(new Date().toISOString())>=f?"warn":"");
     return '<div class="card kpi '+k+'"><span class="hint">Devoirs commencés</span><span class="v">'+(c?"Oui, à "+fmtTime(c):"Pas encore")+'</span><span class="hint">'+(f?"Fin des cours aujourd\'hui : "+f.replace(":","h"):"Pas cours aujourd\'hui (planning)")+'</span></div>';})()+
   '<div class="card kpi '+kCo+'"><span class="hint">Connexion aujourd\'hui</span><span class="v">'+(connecte?"Oui, à "+fmtTime(su.derniere_connexion):"Pas encore")+'</span><span class="hint">Dernière activité : '+esc(fmtWhen(su.derniere_activite))+'</span></div>'+
   '<div class="card kpi '+kDev+'"><span class="hint">Devoirs pour demain</span><span class="v">'+(dd.length?ddFaits+" / "+dd.length+" faits":"Aucun noté")+'</span><span class="hint">'+
     (dd.length&&ddFaits===dd.length&&su.devoirs_finis_le?"Fini "+esc(fmtWhen(su.devoirs_finis_le)):"")+'</span></div>'+'</div>';
  h+=alertesCard()+pronoteCard();
  var aVenir=S.devoirs.filter(function(d){return d.pour>=dayKey();}).sort(function(a,b){return (a.pour||"").localeCompare(b.pour||"");});
  if(aVenir.length)h+='<div class="section-title"><h2>Devoirs à venir</h2><span class="count">'+aVenir.filter(function(d){return !d.fait;}).length+' à faire</span></div><div class="card histo">'+aVenir.map(function(d){
    return '<div><span>'+esc(d.matiere)+' · '+esc(d.texte.length>90?d.texte.slice(0,90)+"…":d.texte)+'<br><span class="hint">pour '+esc(fmtDay(d.pour))+'</span></span><span class="s">'+(d.fait?"Fait ✓":"À faire")+'</span></div>';}).join("")+'</div>';
  var notes=S.notes.slice().sort(function(a,b){return (b.cree||"").localeCompare(a.cree||"");}).slice(0,6);
  if(notes.length)h+='<div class="section-title"><h2>Dernières notes</h2></div><div class="card histo">'+notes.map(function(x){
    return '<div><span>'+esc(x.matiere)+(x.chapitre?' · '+esc(x.chapitre):'')+'<br><span class="hint">'+esc(fmtWhen(x.cree))+'</span></span><span class="s"><span class="niveau '+(auDessus(x)?"n3":"n2")+'" style="padding:2px 10px">'+esc(String(x.note).replace(".",","))+' / '+x.sur+'</span></span></div>';}).join("")+'</div>';
  h+=addForm();
  var pl=S.reglages.planning||{},edt=S.edt.slice().sort(function(a,b){return a.jour.localeCompare(b.jour);});
  var saisie='<div class="histo">'+JOURS.map(function(j){return '<div style="align-items:center"><label for="pl'+j[0]+'">'+j[1]+'</label><input type="time" id="pl'+j[0]+'" value="'+esc(pl[j[0]]||"")+'" style="max-width:150px"></div>';}).join("")+'</div>'+
   '<button class="btn" data-act="plan-save">Enregistrer le planning</button>';
  h+='<div class="card"><h2>Planning et rappels</h2>'+(edt.length
   ?'<p class="hint">Fin des cours lue dans Pronote. Tu reçois un rappel 30 min après s\'il n\'a pas commencé, puis un autre 30 min plus tard.</p>'+
    '<div class="histo">'+edt.map(function(e){var t=fmtDay(e.jour);return '<div><span>'+esc(t.charAt(0).toUpperCase()+t.slice(1))+'</span><span class="s">'+esc(e.fin.slice(0,5).replace(":","h"))+'</span></div>';}).join("")+'</div>'+
    '<details style="margin-top:10px"><summary class="hint">Horaires de secours (si Pronote ne répond plus)</summary>'+saisie+'</details>'
   :'<p class="hint">Quand Pronote est relié, l\'emploi du temps est lu tout seul. Sinon, indique l\'heure de fin des cours chaque jour (laisse vide s\'il n\'a pas cours). Tu reçois un rappel 30 min après s\'il n\'a pas commencé, puis un autre 30 min plus tard.</p>'+saisie)+'</div>';
  h+='<div class="card"><h2>Réglages</h2><div><label class="lbl" for="rPrenom">Prénom</label><input type="text" id="rPrenom" value="'+esc(S.reglages.prenom||"")+'"></div>'+
   '<div><label class="lbl" for="rClasse">Classe</label><select id="rClasse">'+["","6e","5e","4e","3e","CM2","Seconde"].map(function(c){return '<option value="'+c+'"'+(S.reglages.classe===c?" selected":"")+'>'+(c||"Choisir")+'</option>';}).join("")+'</select></div>'+
   '<button class="btn" data-act="reg-save">Enregistrer</button>'+
   '</div>';
  h+=enfantCard();
  h+='<button class="btn big line" data-act="deconnexion">Me déconnecter</button>';
  return '<div class="wrap">'+h+'</div>';
}

/* ---------- actions ---------- */
document.addEventListener("click",function(e){
  var t=e.target.closest("[data-act],nav.tabs button");if(!t)return;
  if(t.dataset.tab){tab=t.dataset.tab;ls("cartable.tab",tab);render();window.scrollTo(0,0);return;}
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
  else if(a==="reg-save"){Store.setDoc("reglages",{prenom:$("#rPrenom").value.trim()||"Ethan",classe:$("#rClasse").value});}
  else if(a==="theme-open")themeOpen();
  else if(a==="commence"){Store.setDoc("suivi",{debut_devoirs:new Date().toISOString(),derniere_activite:new Date().toISOString()});speak("C'est parti ! Commence par le premier devoir.");}
  else if(a==="plan-save"){var pl2={};JOURS.forEach(function(j){var v=$("#pl"+j[0]).value;if(v)pl2[j[0]]=v;});Store.setDoc("reglages",{planning:pl2});ui.planOk=true;}
  else if(a==="theme-close"){ui.themeOpen=false;clearInterval(themeTick);renderTheme();}
  else if(a==="theme-c"){if(themeReste()<=0)return;Store.setDoc("reglages",{couleur:t.dataset.c});applyTheme();renderTheme();}
  else if(a==="fond-off"){if(themeReste()<=0)return;Store.setDoc("reglages",{avec_fond:false});applyTheme();renderTheme();}
  else if(a==="alertes"){ui.alertesErr="";activerAlertes().then(function(){ui.alertes=true;render();}).catch(function(e){
    ui.alertesErr=e&&e.code==="refuse"?"Les notifications sont bloquées. Autorise-les pour DysOrga dans les réglages du téléphone.":"Ce téléphone ne permet pas les alertes. Installe DysOrga sur l'écran d'accueil avec Chrome.";render();});}
  else if(a==="pronote-relier"){ui.pronoteRelier=true;ui.pronoteMsg="";render();}
  else if(a==="pronote-scan"){if(!pinPronote())return;
    ouvrirCamera("qr","Vise le QR code affiché par Pronote.").then(lierPronote);}
  else if(a==="pronote-synchro"){ui.pronoteBusy=true;ui.pronoteMsg="";render();
    pronoteSynchro().then(function(){ui.pronoteBusy=false;ui.pronoteOk=true;ui.pronoteMsg="À jour.";rafraichirParent();recharger();})
    .catch(function(){ui.pronoteBusy=false;ui.pronoteOk=false;ui.pronoteMsg="La mise à jour n'a pas marché. Réessaie plus tard.";rafraichirParent();});}
  else if(a==="compte-enfant"){creerCompteEnfant(S.reglages.prenom||"Ethan").then(function(r){ui.codeEnfant=r;rafraichirParent();})
    .catch(function(){showSync("La création du compte n'a pas marché. Réessaie.");});}
  else if(a==="deconnexion"){deconnexion().then(function(){location.reload();});}
});
document.addEventListener("change",function(e){if(e.target.id==="fondFile"&&e.target.files&&e.target.files[0])setFond(e.target.files[0]);
  if(e.target.id==="pnQrImg"&&device==="parent"&&e.target.files&&e.target.files[0]){var f=e.target.files[0];e.target.value="";
    if(!pinPronote())return;
    lireQrImage(f).then(function(txt){if(txt)return lierPronote(txt);
      ui.pronoteOk=false;ui.pronoteMsg="Je ne trouve pas de QR code sur cette image. Fais une capture où le QR code se voit en entier.";render();});}});

function pinPronote(){var pin=($("#pnPin").value||"").trim();ui.pnPin=pin;
  if(/^\d{4}$/.test(pin))return pin;
  ui.pronoteOk=false;ui.pronoteMsg="Écris d'abord le code à 4 chiffres choisi sur Pronote.";render();return null;}
function lierPronote(txt){var pin=ui.pnPin;
      if(!txt)return;var qr;try{qr=JSON.parse(txt);}catch(_){}
      if(!qr||!qr.jeton||!qr.url){ui.pronoteOk=false;ui.pronoteMsg="Ce n'est pas le QR code de Pronote. Réessaie.";render();return;}
      ui.pronoteBusy=true;ui.pronoteMsg="";render();
      var secu=$("#pnSecu");if(secu)ui.pnSecu=secu.value.trim();
      pronoteLier(qr,pin,ui.pnSecu||undefined).then(function(r){ui.pronoteBusy=false;ui.pronoteRelier=false;ui.pronoteOk=true;ui.pnSecuDemande=false;
        ui.pronoteMsg=r.synchro?"C'est relié ! Les devoirs arriveront à la prochaine mise à jour.":"C'est relié ! "+(r.devoirs||0)+" devoir(s) récupéré(s).";rafraichirParent();recharger();})
      .catch(function(e){ui.pronoteBusy=false;ui.pronoteOk=false;ui.pronoteMsg=msgPronote(e);render();});}
function msgPronote(e){var c=e&&e.erreur,refais=" Génère un nouveau QR code et réessaie.";
  if(c==="pin_securite"){ui.pnSecuDemande=true;return "Le collège demande ton code de sécurité Pronote. Écris-le dans la nouvelle case."+refais;}
  if(c==="pin_securite_faux"){ui.pnSecuDemande=true;return "Le code de sécurité Pronote n'est pas le bon."+refais;}
  if(c==="pin_faux")return "Le code à 4 chiffres n'est pas celui choisi sur Pronote pour ce QR code. Génère un nouveau QR code et tape bien le même code ici.";
  if(c==="qr_expire")return "Ton code à 4 chiffres est bon, mais Pronote a refusé le QR code."+refais+(e.detail?" (Détail pour Claude : "+e.detail+")":"");
  if(c==="premiere_connexion")return "Pronote demande d'abord de régler la sécurité du compte. Connecte-toi une fois sur le site Pronote et suis ce qu'il demande, puis réessaie.";
  if(c==="trop_essais")return "Pronote a bloqué les essais pour un moment. Attends une heure avant de réessayer.";
  if(c==="compte_desactive")return "Ce compte Pronote est désactivé. Vérifie avec le collège.";
  return "La liaison n'a pas marché."+refais+(e&&e.detail?" (Détail pour Claude : "+e.detail+")":"");}
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
if("serviceWorker" in navigator){
  // Nouvelle version publiée : on recharge l'appli dès qu'elle est prête (sauf pendant une photo ou une liaison).
  var dejaControle=!!navigator.serviceWorker.controller,aRecharger=false;
  var rechargerSiLibre=function(){if(!aRecharger||document.querySelector(".camera")||ui.pronoteBusy)return;location.reload();};
  navigator.serviceWorker.addEventListener("controllerchange",function(){if(!dejaControle){dejaControle=true;return;}aRecharger=true;rechargerSiLibre();});
  navigator.serviceWorker.register(import.meta.env.BASE_URL+"sw.js",{type:"module"}).then(function(reg){
    document.addEventListener("visibilitychange",function(){if(document.hidden)return;reg.update().catch(function(){});rechargerSiLibre();});
  }).catch(function(){});
}
demarrer();
