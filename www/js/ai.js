// Mode IA optionnel : si l'élève renseigne sa clé API Anthropic, la génération
// et la correction passent par Claude (meilleure qualité que le générateur local).
import { get } from "./store.js";
import { TEACHERS } from "./teachers.js";

export const hasAI = () => !!get().settings.apiKey && !!globalThis.Anthropic;

function client() {
  const { apiKey } = get().settings;
  return new globalThis.Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

// Appel avec repli serveur automatique en cas de refus ; si l'option n'est pas
// acceptée (ancien compte, modèle différent), on retente sans.
async function call(params) {
  const c = client();
  const base = { model: get().settings.model || "claude-opus-5-5", max_tokens: 16000, ...params };
  let msg;
  try {
    msg = await c.beta.messages.stream({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }).finalMessage();
  } catch (e) {
    if (!(e instanceof globalThis.Anthropic.BadRequestError)) throw friendly(e);
    try {
      msg = await c.messages.stream(base).finalMessage();
    } catch (e2) {
      throw friendly(e2);
    }
  }
  if (msg.stop_reason === "refusal") throw new Error("Claude a refusé de traiter ce contenu.");
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

function friendly(e) {
  const A = globalThis.Anthropic;
  if (e instanceof A.AuthenticationError) return new Error("Clé API invalide. Vérifie-la dans Profil.");
  if (e instanceof A.RateLimitError) return new Error("Trop de requêtes, réessaie dans un instant.");
  if (e instanceof A.APIConnectionError) return new Error("Pas de connexion Internet.");
  return new Error(e.message || String(e));
}

function parseJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(text.slice(start, end + 1));
}

function teacherLine() {
  const t = TEACHERS[get().settings.teacher] || TEACHERS.aucun;
  return t.prompt;
}

const PACK_SCHEMA = `{
  "summary": "résumé en 3-4 phrases",
  "fiche": [{"title": "titre de partie", "points": ["point clé clair et court"]}],
  "keywords": [{"term": "mot-clé", "def": "définition simple et exacte"}],
  "syntaxes": [{"label": "nom", "code": "formule, syntaxe ou code exact", "note": "quand/comment l'utiliser"}],
  "retenir": ["phrase essentielle à retenir"],
  "dates": ["date ou chiffre clé avec son contexte"],
  "quiz": [
    {"type": "qcm", "q": "question", "options": ["A","B","C","D"], "answer": 0, "explain": "explication de la bonne réponse et de l'erreur fréquente"},
    {"type": "vf", "q": "affirmation", "answer": true, "explain": "..."},
    {"type": "trou", "q": "phrase avec _____", "options": ["..."], "answer": 0, "explain": "..."}
  ],
  "exam": [{"q": "question ouverte type contrôle", "expected": ["notion attendue"], "model": "réponse modèle complète", "notion": "notion évaluée"}],
  "mnemonics": ["moyen mnémotechnique"],
  "podcast": "script oral de 3 à 5 minutes, ton naturel, à lire à voix haute"
}`;

export async function generatePackAI(title, text) {
  const out = await call({
    system: `Tu es un professeur qui prépare des supports de révision pour un élève. ${teacherLine()} Réponds uniquement avec un objet JSON valide, sans texte autour.`,
    messages: [
      {
        role: "user",
        content: `Voici le cours « ${title} ». Prépare un kit de révision complet au format JSON suivant :\n${PACK_SCHEMA}\n\nContraintes : 8 à 20 mots-clés, 15 à 25 questions de quiz variées (qcm, vf, trou), 5 à 8 questions d'examen blanc progressives (de la restitution à la réflexion), toutes les formules/syntaxes présentes. Reste fidèle au cours, n'invente rien de faux. Langue : celle du cours.\n\n<cours>\n${text}\n</cours>`,
      },
    ],
  });
  const p = parseJSON(out);
  let n = 0;
  const id = () => "a" + Date.now().toString(36) + (n++).toString(36);
  return {
    source: "ai",
    createdAt: Date.now(),
    summary: p.summary || "",
    fiche: p.fiche || [],
    keywords: (p.keywords || []).map((k) => ({ id: id(), term: k.term, def: k.def })),
    syntaxes: p.syntaxes || [],
    retenir: p.retenir || [],
    dates: p.dates || [],
    mnemonics: p.mnemonics || [],
    quiz: (p.quiz || []).map((q) => ({ id: id(), ...q })),
    exam: (p.exam || []).map((q) => ({ id: id(), ...q })),
    podcast: p.podcast || "",
  };
}

// Correction d'un examen blanc complet, avec diagnostic de ce qui n'est pas compris.
export async function gradeExamAI(course, items) {
  const out = await call({
    system: `Tu corriges un examen blanc comme un vrai professeur. ${teacherLine()} Réponds uniquement en JSON.`,
    messages: [
      {
        role: "user",
        content: `Cours :\n<cours>\n${course.text.slice(0, 60000)}\n</cours>\n\nRéponses de l'élève :\n${JSON.stringify(items.map((i) => ({ question: i.q, attendu: i.model, reponse: i.answer })))}\n\nRetourne : {"results":[{"score":0 à 1,"feedback":"commentaire précis","missing":["notion manquante ou mal comprise"]}],"global":"bilan général","notUnderstood":["notion non comprise"],"advice":["conseil concret de méthode"]}`,
      },
    ],
  });
  return parseJSON(out);
}

export async function askTeacher(course, history) {
  return call({
    system: `Tu es le professeur particulier de l'élève. ${teacherLine()} Appuie-toi sur le cours ci-dessous, explique simplement, vérifie la compréhension par une petite question à la fin.\n<cours>\n${(course?.text || "").slice(0, 60000)}\n</cours>`,
    messages: history,
  });
}

// Extraction du texte d'une photo de cours ou d'un PDF scanné.
export async function extractFromFile(base64, mediaType) {
  const block =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
  return call({
    messages: [{ role: "user", content: [block, { type: "text", text: "Retranscris fidèlement tout le texte de ce cours (titres, définitions, formules), en gardant la structure avec des titres sur leur propre ligne. Ne commente pas, donne seulement le texte." }] }],
  });
}

export async function feynmanAI(course, explanation) {
  const out = await call({
    system: `Tu évalues une explication avec la technique Feynman. ${teacherLine()} Réponds uniquement en JSON.`,
    messages: [{ role: "user", content: `Cours :\n<cours>\n${course.text.slice(0, 60000)}\n</cours>\n\nExplication de l'élève :\n${explanation}\n\nRetourne {"score":0 à 1,"good":["ce qui est bien compris"],"gaps":["trou ou erreur"],"simpler":"comment l'expliquer plus simplement"}` }],
  });
  return parseJSON(out);
}
