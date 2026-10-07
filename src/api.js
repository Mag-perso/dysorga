// Tout ce qui parle au serveur (Supabase) : connexion, données, assistant, Pronote, alertes.
import { createClient } from "@supabase/supabase-js";

export const supa = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const DOMAINE_ENFANT = "enfant.dysorga.app";
const LISTES = ["devoirs", "cartes", "tests", "notes", "documents"];

/* ---------- connexion ---------- */
export async function utilisateur() {
  const { data } = await supa.auth.getSession();
  return data.session?.user ?? null;
}

export async function connexionParent(email, motDePasse) {
  const { error } = await supa.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw error;
}

export async function inscriptionParent(email, motDePasse) {
  const { data, error } = await supa.auth.signUp({ email, password: motDePasse });
  if (error) throw error;
  return !!data.session; // false : il faut d'abord confirmer l'adresse e-mail
}

export async function connexionEnfant(identifiant, code) {
  const email = `${identifiant.trim().toLowerCase()}@${DOMAINE_ENFANT}`;
  const { error } = await supa.auth.signInWithPassword({ email, password: code.trim() });
  if (error) throw error;
}

export const deconnexion = () => supa.auth.signOut();

export async function monProfil(prenomParent) {
  const me = await utilisateur();
  if (!me) return null;
  let { data } = await supa.from("membres").select("*").eq("user_id", me.id).maybeSingle();
  if (!data) {
    // Premier passage d'un parent : on crée sa famille.
    const { error } = await supa.rpc("creer_ma_famille", { p_prenom: prenomParent ?? "" });
    if (error) throw error;
    ({ data } = await supa.from("membres").select("*").eq("user_id", me.id).maybeSingle());
  }
  return data;
}

/* ---------- données ---------- */
export async function toutCharger(S) {
  const tri = { devoirs: "pour", cartes: "cree", tests: "cree", notes: "cree", documents: "date" };
  await Promise.all(LISTES.map(async (t) => {
    const { data } = await supa.from(t).select("*").order(tri[t], { ascending: false }).limit(300);
    S[t] = data ?? [];
  }));
  const [{ data: su }, { data: re }] = await Promise.all([
    supa.from("suivi").select("*").maybeSingle(),
    supa.from("reglages").select("*").maybeSingle(),
  ]);
  S.suivi = su ?? {};
  S.reglages = Object.assign(S.reglages, re ?? {});
}

/** Met l'écran à jour quand l'autre téléphone (ou Pronote) change quelque chose. */
export function ecouter(S, quandCaChange) {
  const canal = supa.channel("famille");
  for (const t of [...LISTES, "suivi", "reglages"]) {
    canal.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) => {
      if (t === "suivi" || t === "reglages") {
        if (p.new) S[t] = Object.assign(S[t], p.new);
      } else if (p.eventType === "DELETE") {
        S[t] = S[t].filter((x) => x.id !== p.old.id);
      } else {
        const i = S[t].findIndex((x) => x.id === p.new.id);
        if (i >= 0) S[t][i] = p.new; else S[t].unshift(p.new);
      }
      quandCaChange();
    });
  }
  canal.subscribe();
}

export function creerStore(S, rendre, erreur) {
  return {
    async add(t, obj) {
      const { data, error } = await supa.from(t).insert(obj).select().single();
      if (error) return erreur(error);
      if (!S[t].some((x) => x.id === data.id)) S[t].unshift(data);
      rendre();
      return data;
    },
    async upd(t, id, patch) {
      const x = S[t].find((y) => y.id === id);
      if (x) Object.assign(x, patch);
      rendre();
      const { error } = await supa.from(t).update(patch).eq("id", id);
      if (error) erreur(error);
    },
    async del(t, id) {
      S[t] = S[t].filter((x) => x.id !== id);
      rendre();
      const { error } = await supa.from(t).delete().eq("id", id);
      if (error) erreur(error);
    },
    /** suivi ou reglages : une seule ligne par famille. */
    async setDoc(cle, patch) {
      Object.assign(S[cle], patch);
      rendre();
      const { error } = await supa.from(cle).update(patch).eq("famille_id", S[cle].famille_id);
      if (error) erreur(error);
    },
  };
}

/* ---------- assistant ---------- */
async function enBase64(blob) {
  // On réduit la photo avant l'envoi : plus rapide, et suffisant pour lire une leçon.
  const img = await createImageBitmap(blob);
  const max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
  cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
  return { media_type: "image/jpeg", data: cv.toDataURL("image/jpeg", 0.8).split(",")[1] };
}

export async function demander(kind, infos, photos = []) {
  const images = await Promise.all(photos.map(enBase64));
  const { data, error } = await supa.functions.invoke("assistant", { body: { kind, ...infos, images } });
  if (error) {
    let code = "erreur";
    try { code = (await error.context.json()).erreur ?? code; } catch { /* pas de détail */ }
    throw { code };
  }
  return data;
}

/* ---------- Pronote ---------- */
export async function pronoteLier(qr, pin, pinSecurite) {
  const { data, error } = await supa.functions.invoke("pronote", { body: { action: "lier", qr, pin, pinSecurite } });
  if (error) {
    let info = { erreur: "liaison_impossible" };
    try { info = await error.context.json(); } catch { /* pas de détail */ }
    throw info;
  }
  return data;
}
export async function pronoteSynchro() {
  const { data, error } = await supa.functions.invoke("pronote", { body: { action: "synchro" } });
  if (error) throw error;
  return data;
}
/** Coche (ou décoche) le devoir dans Pronote aussi. Sans gravité si Pronote ne répond pas. */
export async function pronoteDevoirFait(id, fait) {
  const { error } = await supa.functions.invoke("pronote", { body: { action: "devoir-fait", id, fait } });
  if (error) throw error;
}
export async function pronoteStatut() {
  const { data } = await supa.rpc("pronote_statut");
  return (data && data[0]) || null;
}

/* ---------- compte de l'enfant ---------- */
export async function creerCompteEnfant(prenom) {
  const { data, error } = await supa.functions.invoke("compte-enfant", { body: { prenom } });
  if (error) throw error;
  return data;
}

/* ---------- alertes sur le téléphone du parent ---------- */
function cleVapid(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function clePublique() {
  const { data, error } = await supa.functions.invoke("config");
  if (error || !data?.vapid) throw { code: "non_supporte" };
  return data.vapid;
}

export async function activerAlertes() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw { code: "non_supporte" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw { code: "refuse" };
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleVapid(await clePublique()) }));
  const j = sub.toJSON();
  const { error } = await supa.from("push_abonnements").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: "endpoint" });
  if (error) throw error;
}

export async function alertesActives() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}
