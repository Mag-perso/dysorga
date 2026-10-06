import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Client avec tous les droits : réservé au serveur, jamais envoyé à l'appli. */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export type Membre = { user_id: string; famille_id: string; role: "parent" | "enfant"; prenom: string };

/** Retrouve la personne connectée et sa famille à partir de l'en-tête Authorization. */
export async function membreConnecte(req: Request): Promise<Membre | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const db = admin();
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return null;
  const { data } = await db.from("membres").select("user_id, famille_id, role, prenom").eq("user_id", u.user.id).maybeSingle();
  return (data as Membre) ?? null;
}

/** Appels planifiés (pg_cron) : authentifiés par un secret partagé. */
export function estCron(req: Request): boolean {
  const s = Deno.env.get("CRON_SECRET");
  return !!s && req.headers.get("x-cron-secret") === s;
}

/** Date et heure à Paris, quel que soit le fuseau du serveur. */
export function maintenantParis(d = new Date()) {
  const p = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const jours: Record<string, number> = { "lun.": 1, "mar.": 2, "mer.": 3, "jeu.": 4, "ven.": 5, "sam.": 6, "dim.": 0 };
  return {
    jour: `${g("year")}-${g("month")}-${g("day")}`,
    heure: `${g("hour")}:${g("minute")}`,
    joursemaine: jours[g("weekday")] ?? d.getDay(),
  };
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}
