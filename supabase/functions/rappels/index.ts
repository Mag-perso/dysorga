// Appelé toutes les 5 minutes par le planificateur.
// Envoie au parent : un rappel 30 min après la fin des cours si l'enfant n'a pas commencé,
// un deuxième 30 min plus tard, et un message quand tous les devoirs du lendemain sont faits.
import { envoyer } from "../_shared/push.ts";
import { admin, cors, estCron, json, maintenantParis, minutes } from "../_shared/commun.ts";

const DELAI_1 = 30, DELAI_2 = 60;

const hh = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!estCron(req)) return json({ erreur: "interdit" }, 403);

  const db = admin();
  const now = maintenantParis();
  const mNow = minutes(now.heure);
  const demain = maintenantParis(new Date(Date.now() + 864e5)).jour;

  const { data: familles } = await db.from("reglages").select("famille_id, prenom, planning");
  const envoyes: string[] = [];

  for (const f of familles ?? []) {
    const { data: deja } = await db.from("rappels_envoyes").select("numero").eq("famille_id", f.famille_id).eq("jour", now.jour);
    const fait = new Set((deja ?? []).map((d) => d.numero));
    const { data: suivi } = await db.from("suivi").select("*").eq("famille_id", f.famille_id).maybeSingle();
    const prenom = f.prenom || "Votre enfant";

    // Fin des cours : d'abord l'emploi du temps Pronote, sinon le planning saisi par le parent.
    const { data: edt } = await db.from("emploi_du_temps").select("fin").eq("famille_id", f.famille_id).eq("jour", now.jour).maybeSingle();
    const finTxt: string | undefined = edt?.fin?.slice(0, 5) ?? (f.planning ?? {})[String(now.joursemaine)];

    const aujourdhui = (iso?: string | null) => !!iso && maintenantParis(new Date(iso)).jour === now.jour;

    // « A fini » : tous les devoirs pour demain sont faits.
    if (!fait.has(0) && aujourdhui(suivi?.devoirs_finis_le)) {
      const { count } = await db.from("devoirs").select("id", { count: "exact", head: true }).eq("famille_id", f.famille_id).eq("pour", demain).eq("fait", false);
      if (!count) {
        await envoyer(f.famille_id, "parent", `${prenom} a fini ses devoirs`, `Tout est fait pour demain (à ${maintenantParis(new Date(suivi!.devoirs_finis_le)).heure.replace(":", "h")}).`);
        await db.from("rappels_envoyes").insert({ famille_id: f.famille_id, jour: now.jour, numero: 0 });
        envoyes.push(`${f.famille_id}:0`);
      }
    }

    if (!finTxt) continue;
    const mFin = minutes(finTxt);
    const commence = aujourdhui(suivi?.debut_devoirs) ||
      (aujourdhui(suivi?.derniere_activite) && minutes(maintenantParis(new Date(suivi!.derniere_activite)).heure) >= mFin);
    if (commence) continue;

    const pasConnecte = !aujourdhui(suivi?.derniere_connexion);
    const etat = pasConnecte ? "ne s'est pas encore connecté à DysOrga" : "n'a pas encore commencé ses devoirs";
    for (const [numero, delai] of [[1, DELAI_1], [2, DELAI_2]] as const) {
      if (fait.has(numero) || mNow < mFin + delai) continue;
      if (numero === 1 && mNow >= mFin + DELAI_2) continue; // trop tard pour le premier : on passe au second
      await envoyer(f.famille_id, "parent",
        numero === 1 ? `Rappel devoirs : ${prenom}` : `Toujours pas commencé : ${prenom}`,
        `${prenom} ${etat}. Fin des cours à ${hh(mFin)}.`);
      await db.from("rappels_envoyes").insert({ famille_id: f.famille_id, jour: now.jour, numero });
      envoyes.push(`${f.famille_id}:${numero}`);
    }
  }
  return json({ envoyes });
});
