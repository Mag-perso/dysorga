// Assistant de DysOrga : cartes mentales, mini-tests et conseils pour le bureau.
// Les règles fixées par le parent sont écrites ici, côté serveur : l'appli de l'enfant
// ne peut ni les voir ni les changer.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { admin, cors, json, maintenantParis, membreConnecte } from "../_shared/commun.ts";

const MODELE = "claude-opus-5-5";
const PLAFOND_JOUR = Number(Deno.env.get("PLAFOND_ASSISTANT_JOUR") ?? "60");

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

type Image = { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };

function regles(prenom: string, classe: string) {
  return `Tu aides ${prenom}, élève de ${classe}, à faire ses devoirs seul. Il a un TDA (trouble de l'attention), une dyspraxie, une dyscalculie et une dysorthographie.

Comment écrire :
- En français, phrases très courtes, mots simples, peu de texte.
- Pas de double négation, pas de question piège.
- Pour les maths : petites étapes, un exemple concret avec de petits nombres.
- Ton bienveillant. Jamais de reproche, jamais de moquerie.

Règles absolues, fixées par son parent :
1. Tu ne donnes JAMAIS la réponse d'un exercice ou d'un devoir, et tu ne fais jamais le travail à sa place. Si on te donne un exercice, tu expliques la leçon et la méthode avec un AUTRE exemple, jamais avec les données de l'exercice.
2. Tu ne mets aucun lien, aucune adresse de site, et tu ne l'envoies jamais chercher sur internet.
3. Tu ne lui demandes jamais de ranger ou d'éloigner son téléphone : il s'en sert pour cette appli. Tu peux seulement proposer le mode « Ne pas déranger ».
4. Si la demande n'a rien à voir avec l'école (leçons, devoirs, révisions, organisation du bureau ou des cahiers), ou demande de faire le devoir à sa place : statut "refus", avec une phrase gentille qui propose de réviser la leçon.
5. Si une photo ne montre pas ce qui est demandé (visage, grimace, objet sans rapport, photo floue, coupée ou prise à côté) : statut "recadrage", avec 2 phrases douces qui l'invitent à se reconcentrer et à reprendre la bonne photo.`;
}

const MESSAGE = { type: "string" };
const SCHEMAS: Record<string, Record<string, unknown>> = {
  carte: {
    type: "object", additionalProperties: false,
    required: ["statut", "message", "titre", "branches", "astuce"],
    properties: {
      statut: { type: "string", enum: ["ok", "refus", "recadrage"] },
      message: MESSAGE,
      titre: { type: "string" },
      branches: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["titre", "emoji", "idees"],
          properties: { titre: { type: "string" }, emoji: { type: "string" }, idees: { type: "array", items: { type: "string" } } },
        },
      },
      astuce: { type: "string" },
    },
  },
  test: {
    type: "object", additionalProperties: false,
    required: ["statut", "message", "questions"],
    properties: {
      statut: { type: "string", enum: ["ok", "refus"] },
      message: MESSAGE,
      questions: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["q", "choix", "bonne", "indice", "explication"],
          properties: {
            q: { type: "string" }, choix: { type: "array", items: { type: "string" } }, bonne: { type: "integer" },
            indice: { type: "string" }, explication: { type: "string" },
          },
        },
      },
    },
  },
  bureau: {
    type: "object", additionalProperties: false,
    required: ["statut", "message", "bravo", "etapes", "parfait"],
    properties: {
      statut: { type: "string", enum: ["ok", "refus", "recadrage"] },
      message: MESSAGE,
      bravo: { type: "string" },
      etapes: {
        type: "array",
        items: { type: "object", additionalProperties: false, required: ["emoji", "texte"], properties: { emoji: { type: "string" }, texte: { type: "string" } } },
      },
      parfait: { type: "string" },
    },
  },
};

function consigne(kind: string, p: Record<string, any>, nbImages: number, doc?: string): string {
  if (kind === "carte") {
    return `Fabrique une carte mentale pour réviser${p.sujet ? ` : « ${p.sujet} »` : ""}.` +
      (doc ? `\nVoici le cours mis en ligne par le professeur (base-toi dessus en priorité) :\n${doc}` : "") +
      (p.lecon ? `\nVoici la leçon de l'élève :\n${String(p.lecon).slice(0, 12000)}` : "") +
      (nbImages ? `\nLes ${nbImages} photo(s) jointe(s) sont les pages de sa leçon, dans l'ordre. Base la carte sur leur contenu. Si une partie est illisible, n'invente pas.` : "") +
      `\nEntre 3 et 5 branches, 2 à 4 idées par branche. Chaque idée est un mot-clé ou une expression très courte. Un seul emoji par branche. L'astuce est un moyen simple de retenir. Si le statut n'est pas "ok", laisse titre, branches et astuce vides.`;
  }
  if (kind === "test") {
    return `Prépare un mini-test de 5 questions pour vérifier s'il a compris : « ${p.sujet} ».` +
      (p.carte ? `\nBase-toi sur la carte mentale qu'il a révisée :\n${p.carte}` : "") +
      (p.revision ? "\nC'est la révision d'un ancien chapitre : vise l'essentiel à retenir." : "") +
      `\nDu plus facile au plus difficile, comme une interrogation en classe. 3 choix par question, un seul juste ("bonne" = son numéro à partir de 0). Ce sont des questions de leçon, jamais les exercices du devoir. L'indice aide à trouver sans jamais dire la bonne réponse. L'explication, montrée seulement quand il a trouvé, dit pourquoi c'est juste en une phrase. Si le statut n'est pas "ok", laisse questions vide.`;
  }
  const quoi = p.type === "bureau"
    ? "La photo montre le bureau où il fait ses devoirs. Regarde ce qui gêne : objets qui distraient (jeux, jouets, console, télé), désordre, manque de place, affaires qui manquent (trousse, cahier du jour, agenda), lumière."
    : "La photo montre ses cahiers. Regarde l'organisation : feuilles pas collées ou volantes, pages mal rangées, titres et dates manquants, cahier abîmé.";
  return quoi + (p.verification ? "\nC'est une photo de vérification, après qu'il a rangé." : "") +
    "\nDonne des consignes concrètes, une action par étape, dans l'ordre. Maximum 5 étapes, une phrase courte qui commence par un verbe. Commence par un petit compliment sincère (bravo). Si tout est déjà bien, aucune étape et un message de félicitations dans parfait.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const membre = await membreConnecte(req);
  if (!membre) return json({ erreur: "non_connecte" }, 401);

  const p = await req.json().catch(() => ({}));
  const kind = String(p.kind ?? "");
  if (!SCHEMAS[kind]) return json({ erreur: "demande_inconnue" }, 400);
  const images: Image[] = Array.isArray(p.images) ? p.images.slice(0, 5) : [];
  if ((kind === "bureau") && !images.length) return json({ erreur: "photo_manquante" }, 400);

  const db = admin();
  const { jour } = maintenantParis();
  const { data: u } = await db.from("usage_assistant").select("n").eq("famille_id", membre.famille_id).eq("jour", jour).maybeSingle();
  if ((u?.n ?? 0) >= PLAFOND_JOUR) return json({ erreur: "plafond" }, 429);
  await db.from("usage_assistant").upsert({ famille_id: membre.famille_id, jour, n: (u?.n ?? 0) + 1 });

  const { data: r } = await db.from("reglages").select("prenom, classe").eq("famille_id", membre.famille_id).maybeSingle();
  let doc: string | undefined;
  if (kind === "carte" && p.documentId) {
    const { data: d } = await db.from("documents").select("titre, contenu").eq("id", p.documentId).eq("famille_id", membre.famille_id).maybeSingle();
    if (d) doc = `${d.titre}\n${d.contenu}`.slice(0, 15000);
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.media_type, data: im.data } })),
    { type: "text", text: consigne(kind, p, images.length, doc) },
  ];

  try {
    const response = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: regles(r?.prenom ?? "Ethan", r?.classe ?? "4e"),
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMAS[kind] } },
      messages: [{ role: "user", content }],
    } as any);
    if (response.stop_reason === "refusal") return json({ statut: "refus", message: "Je ne peux pas t'aider là-dessus. On révise ta leçon ?" });
    const texte = response.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    return json(JSON.parse(texte));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ erreur: "occupe" }, 429);
    if (e instanceof Anthropic.APIError) return json({ erreur: "assistant", detail: e.status }, 502);
    return json({ erreur: "assistant" }, 500);
  }
});
