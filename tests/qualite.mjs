// Vérifie automatiquement la cohérence de ce que génère le moteur hors-ligne.
// Usage : node tests/qualite.mjs   (code de sortie 1 en cas de problème)
import { readFileSync, readdirSync } from "node:fs";
import { generatePack, structure } from "../www/js/nlp.js";

const files = [...readdirSync("tests/cours").map((f) => "tests/cours/" + f), "www/samples/photosynthese.txt"];
const MOTS_VIDES = /^(il|elle|se|le|la|les|de|du|des|un|une|et|ou|est|sont|forme|point|même|mots?|lien|chose|partie|cours)$/i;
let errors = 0;
const fail = (f, msg) => {
  errors++;
  console.log(`✘ ${f} : ${msg}`);
};

for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (let run = 0; run < 5; run++) {
    const p = generatePack(text, f);
    if (!p.fiche.length) fail(f, "fiche vide");
    for (const s of p.fiche) for (const pt of s.points) if (!pt.t && !pt.sub?.length) fail(f, `point de fiche vide dans « ${s.title} »`);
    for (const c of p.keywords) {
      if (!c.term?.trim() || !c.def?.trim()) fail(f, `carte incomplète : ${JSON.stringify(c)}`);
      if (c.kind === "def" && c.term.split(/\s+/).length > 7) fail(f, `terme trop long : « ${c.term} »`);
      if (c.kind === "def" && /^(tous|toutes|il|elle|on|ce|cette)\b/i.test(c.term)) fail(f, `terme non pertinent : « ${c.term} »`);
      if (c.kind === "cloze" && (MOTS_VIDES.test(c.answer) || c.answer.length < 3)) fail(f, `trou sur un mot vide : « ${c.answer} »`);
      if (c.kind === "cloze" && !c.term.includes("_____")) fail(f, `phrase à trous sans trou : « ${c.term} »`);
    }
    for (const q of p.quiz) {
      if (q.options) {
        if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) fail(f, `options en double : ${q.q}`);
        if (!(q.answer >= 0 && q.answer < q.options.length)) fail(f, `bonne réponse absente : ${q.q}`);
        if (q.options.length < 3) fail(f, `pas assez de choix : ${q.q}`);
      }
      if (q.type === "vf" && q.answer === false && q.explain.includes(`« ${q.q} »`)) fail(f, `« faux » identique au cours : ${q.q}`);
      if (q.type === "vf" && !/[.!?]$/.test(q.q)) fail(f, `affirmation incomplète : ${q.q}`);
    }
    for (const e of p.exam) if (!e.model?.trim()) fail(f, `question d'examen sans corrigé : ${e.q}`);
  }
}

// Texte de photo / PDF : les retours à la ligne au milieu des phrases doivent être recollés.
const ocr = structure("I. Définition\nLa cellule est l'unité de base de tous les êtres\nvivants. Tous les organismes sont constitués d'une\nou de plusieurs cellules.");
const sent = ocr.sections[0].sentences;
if (sent[0] !== "La cellule est l'unité de base de tous les êtres vivants.") fail("reflow", JSON.stringify(sent));

console.log(errors ? `\n${errors} problème(s)` : `✔ ${files.length} cours vérifiés, aucun problème`);
process.exit(errors ? 1 : 0);
