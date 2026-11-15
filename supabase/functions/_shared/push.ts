// Notifications sur les téléphones de la famille (parent, ou enfant s'il les a activées).
import webpush from "npm:web-push@3.6.7";
import { admin } from "./commun.ts";

webpush.setVapidDetails(
  Deno.env.get("VAPID_CONTACT") ?? "mailto:contact@dysorga.app",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

export async function envoyer(famille: string, role: "parent" | "enfant", titre: string, corps: string, ouvrir?: string) {
  const db = admin();
  const { data: membres } = await db.from("membres").select("user_id").eq("famille_id", famille).eq("role", role);
  const ids = (membres ?? []).map((p) => p.user_id);
  if (!ids.length) return 0;
  const { data: abos } = await db.from("push_abonnements").select("*").in("user_id", ids);
  let n = 0;
  for (const a of abos ?? []) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify({ titre, corps, ouvrir }));
      n++;
    } catch (e: any) {
      // Abonnement expiré (téléphone changé, notifications coupées) : on l'oublie.
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_abonnements").delete().eq("id", a.id);
    }
  }
  return n;
}
