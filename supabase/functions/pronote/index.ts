// Liaison et synchronisation Pronote (bibliothèque non officielle « pawnote »).
// - "lier" : le parent scanne le QR code de connexion mobile affiché par Pronote, avec son code PIN.
// - "synchro" : récupère devoirs, notes, cours des profs et fin des cours de la semaine.
// - "synchro-toutes" : appelé par le planificateur pour toutes les familles.
import * as pronote from "npm:pawnote@1.6.2";
import { admin, cors, estCron, json, maintenantParis, membreConnecte } from "../_shared/commun.ts";

const MATIERES: Array<[RegExp, string]> = [
  [/fran[cç]ais/i, "Français"],
  [/math/i, "Maths"],
  [/hist|g[ée]o|emc/i, "Histoire-Géo"],
  [/svt|vie.*terre|sciences de la vie/i, "SVT"],
  [/anglais/i, "Anglais"],
  [/physique|chimie/i, "Physique-Chimie"],
];
function matiere(nom: string): string {
  for (const [re, m] of MATIERES) if (re.test(nom)) return m;
  return nom.charAt(0).toUpperCase() + nom.slice(1).toLowerCase();
}

function texte(html?: string): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n").trim();
}

// Requêtes vers Pronote : on suit les redirections de la page d'accueil (certains serveurs
// en renvoient une que pawnote ne suit pas) et on garde une trace pour expliquer un échec.
type Requete = { url: URL; method?: string; headers?: Record<string, string>; content?: string; redirect?: "follow" | "manual" };
function creerSession() {
  const trace: string[] = [];
  const fetcher = async (r: Requete) => {
    const init = { headers: r.headers ?? {}, method: r.method ?? "GET", body: r.content };
    let res = await fetch(r.url.href, { ...init, redirect: r.redirect ?? "follow" });
    if (r.redirect === "manual" && init.method === "GET" && (res.status === 0 || (res.status >= 300 && res.status < 400))) {
      const vers = res.headers.get("location");
      trace.push(`${res.status} ${r.url.host}${r.url.pathname} -> ${vers ? new URL(vers, r.url).href.split("?")[0] : "?"}`);
      res = await fetch(r.url.href, { ...init, redirect: "follow" });
    }
    if (!res.ok) trace.push(`${res.status} ${r.url.host}${r.url.pathname}`);
    return { status: res.status, content: await res.text(), headers: res.headers };
  };
  return { session: pronote.createSessionHandle(fetcher as Parameters<typeof pronote.createSessionHandle>[0]), trace };
}

const jourParis = (d: Date) => maintenantParis(d).jour;
const heureParis = (d: Date) => maintenantParis(d).heure;

async function connecter(famille: string) {
  const db = admin();
  const { data: c } = await db.from("pronote_comptes").select("*").eq("famille_id", famille).maybeSingle();
  if (!c) throw new Error("non_lie");
  const { session } = creerSession();
  const refresh = await pronote.loginToken(session, {
    url: c.url, kind: c.kind, username: c.username, token: c.token,
    deviceUUID: c.device_uuid, navigatorIdentifier: c.navigator_identifier ?? undefined,
  });
  // Le jeton change à chaque connexion : on garde toujours le dernier.
  await db.from("pronote_comptes").update({ token: refresh.token, navigator_identifier: refresh.navigatorIdentifier }).eq("famille_id", famille);
  return session;
}

async function synchroniser(famille: string, session: pronote.SessionHandle) {
  const db = admin();
  const auj = new Date();
  const debut = new Date(auj.getTime() - 2 * 864e5), fin = new Date(auj.getTime() + 15 * 864e5);

  // Devoirs : on ne repasse jamais « fait » à faux si Ethan l'a coché dans DysOrga.
  const devoirs = await pronote.assignmentsFromIntervals(session, debut, fin);
  const { data: existants } = await db.from("devoirs").select("pronote_id, fait").eq("famille_id", famille).eq("source", "pronote");
  const faits = new Set((existants ?? []).filter((d) => d.fait).map((d) => d.pronote_id));
  if (devoirs.length) {
    await db.from("devoirs").upsert(devoirs.map((a) => ({
      famille_id: famille, source: "pronote", pronote_id: a.id,
      matiere: matiere(a.subject.name), texte: texte(a.description) || "Travail à faire",
      pour: jourParis(a.deadline), fait: a.done || faits.has(a.id),
    })), { onConflict: "famille_id,pronote_id" });
  }

  // Cours et documents des profs (3 dernières semaines).
  const ressources = await pronote.resourcesFromIntervals(session, new Date(auj.getTime() - 21 * 864e5), new Date(auj.getTime() + 864e5));
  const docs = ressources.flatMap((r) => r.contents.map((c) => ({
    famille_id: famille, pronote_id: `${r.id}:${c.id}`, matiere: matiere(r.subject.name),
    titre: c.title || r.subject.name, contenu: texte(c.description),
    fichiers: c.files.map((f) => ({ nom: f.name, lien: f.kind === pronote.AttachmentKind.Link })),
    date: jourParis(r.startDate),
  }))).filter((d) => d.contenu || d.fichiers.length);
  if (docs.length) await db.from("documents").upsert(docs, { onConflict: "famille_id,pronote_id" });

  // Notes de la période en cours.
  const onglet = session.userResource.tabs.get(pronote.TabLocation.Grades);
  const periode = onglet?.defaultPeriod ?? onglet?.periods.find((p) => p.startDate <= auj && auj <= p.endDate);
  if (periode) {
    const apercu = await pronote.gradesOverview(session, periode);
    const notes = apercu.grades
      .filter((g) => g.value.kind === pronote.GradeKind.Grade && g.outOf.kind === pronote.GradeKind.Grade)
      .map((g) => ({
        famille_id: famille, source: "pronote", pronote_id: g.id, matiere: matiere(g.subject.name),
        note: g.value.points, sur: g.outOf.points, chapitre: g.comment ?? "", cree: g.date.toISOString(),
      }));
    if (notes.length) await db.from("notes").upsert(notes, { onConflict: "famille_id,pronote_id" });
  }

  // Fin des cours de chaque jour, pour les rappels.
  const edt = await pronote.timetableFromIntervals(session, auj, new Date(auj.getTime() + 7 * 864e5));
  pronote.parseTimetable(session, edt, { withCanceledClasses: false, withPlannedClasses: true });
  const finParJour = new Map<string, string>();
  for (const c of edt.classes) {
    if (c.is === "lesson" && c.canceled) continue;
    const j = jourParis(c.endDate), h = heureParis(c.endDate);
    if (!finParJour.has(j) || h > finParJour.get(j)!) finParJour.set(j, h);
  }
  if (finParJour.size) {
    await db.from("emploi_du_temps").upsert([...finParJour].map(([jour, fin]) => ({ famille_id: famille, jour, fin })), { onConflict: "famille_id,jour" });
  }

  await db.from("pronote_comptes").update({ derniere_synchro: new Date().toISOString(), erreur: null }).eq("famille_id", famille);
  return { devoirs: devoirs.length, documents: docs.length };
}

function erreurLiaison(e: unknown, trace: string[] = [], url = "") {
  const nom = e instanceof Error ? e.name : "";
  const code = nom === "BadCredentialsError" ? "qr_expire" : nom === "AccountDisabledError" ? "compte_desactive"
    : nom === "SuspendedIPError" || nom === "RateLimitedError" ? "trop_essais" : "liaison_impossible";
  const quoi = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const ou = url ? ` | ${String(url).split("?")[0]}` : "";
  return { erreur: code, detail: `${quoi}${ou}${trace.length ? " | " + trace.join(" ; ") : ""}`.slice(0, 400) };
}

async function synchroFamille(famille: string) {
  try {
    return await synchroniser(famille, await connecter(famille));
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : "erreur";
    await admin().from("pronote_comptes").update({ erreur: msg.slice(0, 300) }).eq("famille_id", famille);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const p = await req.json().catch(() => ({}));

  if (p.action === "synchro-toutes") {
    if (!estCron(req)) return json({ erreur: "interdit" }, 403);
    const { data } = await admin().from("pronote_comptes").select("famille_id");
    const resultats = [];
    for (const { famille_id } of data ?? []) {
      resultats.push(await synchroFamille(famille_id).then(() => "ok", () => "erreur"));
    }
    return json({ resultats });
  }

  const membre = await membreConnecte(req);
  if (!membre) return json({ erreur: "non_connecte" }, 401);

  if (p.action === "lier") {
    if (membre.role !== "parent") return json({ erreur: "reserve_parent" }, 403);
    if (!p.qr?.jeton || !p.qr?.url || !/^\d{4}$/.test(String(p.pin ?? ""))) return json({ erreur: "qr_invalide" }, 400);
    const deviceUUID = crypto.randomUUID();
    const { session, trace } = creerSession();
    let r: pronote.RefreshInformation;
    try {
      r = await pronote.loginQrCode(session, { deviceUUID, pin: String(p.pin), qr: p.qr });
    } catch (e) {
      if (!(e instanceof pronote.SecurityError)) return json(erreurLiaison(e, trace, p.qr.url), 400);
      // Double authentification demandée par le collège : on déclare DysOrga comme appareil de confiance.
      const h = e.handle;
      if (h.shouldCustomPassword || h.shouldCustomDoubleAuth) return json({ erreur: "premiere_connexion" }, 400);
      const pinSecu = String(p.pinSecurite ?? "");
      if (h.shouldEnterPIN && !/^\d{4}$/.test(pinSecu)) return json({ erreur: "pin_securite" }, 400);
      try {
        if (h.shouldEnterPIN && !(await pronote.securityCheckPIN(session, pinSecu))) return json({ erreur: "pin_securite_faux" }, 400);
        if (h.shouldEnterSource) await pronote.securitySource(session, "DysOrga");
        await pronote.securitySave(session, h, {
          ...(h.shouldEnterPIN ? { pin: pinSecu } : {}),
          ...(h.shouldEnterSource ? { deviceName: "DysOrga" } : {}),
        });
        r = await pronote.finishLoginManually(session, h.context.authentication, h.context.identity, h.context.initialUsername);
      } catch (e2) {
        return json(erreurLiaison(e2, trace, p.qr.url), 400);
      }
    }
    await admin().from("pronote_comptes").upsert({
      famille_id: membre.famille_id, url: r.url, username: r.username, token: r.token, kind: r.kind,
      device_uuid: deviceUUID, navigator_identifier: r.navigatorIdentifier, erreur: null,
    });
    // La liaison est faite : si la première synchro échoue, elle sera refaite par le planificateur.
    try {
      return json({ ok: true, ...(await synchroniser(membre.famille_id, session)) });
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : "erreur";
      await admin().from("pronote_comptes").update({ erreur: msg.slice(0, 300) }).eq("famille_id", membre.famille_id);
      return json({ ok: true, devoirs: 0, synchro: msg.slice(0, 200) });
    }
  }

  if (p.action === "synchro") {
    try {
      return json({ ok: true, ...(await synchroFamille(membre.famille_id)) });
    } catch (e) {
      return json({ erreur: "synchro_impossible", detail: e instanceof Error ? e.message : "" }, 502);
    }
  }

  return json({ erreur: "action_inconnue" }, 400);
});
