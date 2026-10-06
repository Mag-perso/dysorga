// Réglages publics dont l'appli a besoin (rien de secret ici).
import { cors, json } from "../_shared/commun.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return json({ vapid: Deno.env.get("VAPID_PUBLIC_KEY") ?? "" });
});
