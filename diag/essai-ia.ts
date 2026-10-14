// Essai du ton de l'assistant sur des questions inventées (aucune donnée d'Ethan).
try { (Deno as any).serve = () => {}; } catch { Object.defineProperty(Deno, "serve", { value: () => {} }); }
const { regles, consigne } = await import("../app/supabase/functions/assistant/index.ts");
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
const client = new Anthropic();
const schema = { type: "object", additionalProperties: false, required: ["statut", "message"], properties: { statut: { type: "string", enum: ["ok", "refus", "maman", "recadrage"] }, message: { type: "string" } } };
async function tour(matiere: string, historique: { qui: string; texte: string }[], question: string) {
  const r = await client.messages.create({
    model: "claude-sonnet-5-5", max_tokens: 4000, system: regles("Ethan", "4e"),
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: consigne("question", { matiere, historique, question }, 0) }],
  } as any);
  return JSON.parse(r.content.map((b: any) => (b.type === "text" ? b.text : "")).join(""));
}
for (const [matiere, questions] of [
  ["Maths", ["je comprend pas lexo 3 il fau calculer 3/4 + 1/2", "ben faut ajouter les chiffre ?"]],
  ["Français", ["cé quoi un complément du nom", "le chat de ma soeur ?"]],
  ["Histoire-Géo", ["pk ya eu la revolution francaise"]],
] as [string, string[]][]) {
  const h: { qui: string; texte: string }[] = [];
  console.log(`\n=== ${matiere}`);
  for (const q of questions) {
    const r = await tour(matiere, h, q);
    console.log(`Élève : ${q}\nIA (${r.statut}, ${r.message.split(/\s+/).length} mots) : ${r.message}`);
    h.push({ qui: "moi", texte: q }, { qui: "elle", texte: r.message });
  }
}
