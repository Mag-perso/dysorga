// Ethan écrit à son parent (ou l'inverse) : on enregistre le message et on prévient l'autre téléphone.
import { admin, cors, json, membreConnecte } from "../_shared/commun.ts";
import { envoyer } from "../_shared/push.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const membre = await membreConnecte(req);
  if (!membre) return json({ erreur: "non_connecte" }, 401);

  const { texte } = await req.json().catch(() => ({}));
  const t = String(texte ?? "").trim().slice(0, 1000);
  if (!t) return json({ erreur: "vide" }, 400);

  const db = admin();
  const { data, error } = await db.from("messages").insert({ famille_id: membre.famille_id, de: membre.role, texte: t }).select().single();
  if (error) return json({ erreur: "envoi_impossible" }, 500);

  const autre = membre.role === "enfant" ? "parent" : "enfant";
  const titre = membre.role === "enfant" ? `Message de ${membre.prenom || "votre enfant"}` : "Message de maman";
  try {
    await envoyer(membre.famille_id, autre, titre, t.length > 140 ? t.slice(0, 140) + "…" : t, "messages");
  } catch (e) {
    console.warn("notification impossible", e instanceof Error ? e.message : e);
  }
  return json(data);
});
