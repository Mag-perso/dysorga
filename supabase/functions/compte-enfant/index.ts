// Le parent crée (ou recrée) le compte de son enfant. L'enfant se connecte ensuite
// avec un identifiant court et un code à 6 chiffres, sans adresse e-mail.
import { admin, cors, json, membreConnecte } from "../_shared/commun.ts";

function code6() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1000000).padStart(6, "0");
}

function slug(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "") || "enfant";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const membre = await membreConnecte(req);
  if (!membre || membre.role !== "parent") return json({ erreur: "reserve_parent" }, 403);

  const { prenom = "Ethan" } = await req.json().catch(() => ({}));
  const db = admin();
  const identifiant = `${slug(prenom)}-${membre.famille_id.slice(0, 4)}`;
  const email = `${identifiant}@enfant.dysorga.app`;
  const code = code6();

  const { data: deja } = await db.from("membres").select("user_id").eq("famille_id", membre.famille_id).eq("role", "enfant").maybeSingle();
  if (deja) {
    const { error } = await db.auth.admin.updateUserById(deja.user_id, { password: code });
    if (error) return json({ erreur: "maj_impossible" }, 500);
    await db.from("membres").update({ prenom }).eq("user_id", deja.user_id);
  } else {
    const { data, error } = await db.auth.admin.createUser({ email, password: code, email_confirm: true });
    if (error || !data.user) return json({ erreur: "creation_impossible" }, 500);
    await db.from("membres").insert({ user_id: data.user.id, famille_id: membre.famille_id, role: "enfant", prenom });
  }
  await db.from("reglages").update({ prenom }).eq("famille_id", membre.famille_id);
  return json({ identifiant, code });
});
