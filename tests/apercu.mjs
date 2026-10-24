// Affiche ce que le générateur hors-ligne produit pour chaque cours de tests/cours.
// Usage : node tests/apercu.mjs [fichier]
import { readFileSync, readdirSync } from "node:fs";
import { generatePack } from "../www/js/nlp.js";

const files = process.argv[2] ? [process.argv[2]] : readdirSync("tests/cours").map((f) => "tests/cours/" + f);
for (const f of files) {
  const p = generatePack(readFileSync(f, "utf8"), f);
  console.log("\n=================", f);
  console.log("RÉSUMÉ:", p.summary);
  console.log("--- FICHE");
  for (const s of p.fiche) console.log("## " + (s.title || "—") + "\n" + s.points.map((x) => `  • [${x.k}] ${x.term && x.k !== "def" ? x.term + " ⇒ " : ""}${x.t.replace(/\n/g, " ⏎ ")}${x.sub ? "\n" + x.sub.map((y) => "      – " + y).join("\n") : ""}`).join("\n"));
  console.log("--- DATES\n  " + p.dates.join("\n  "));
  console.log("--- À RETENIR\n  " + p.retenir.join("\n  "));
  console.log("--- CARTES");
  for (const k of p.keywords) console.log(`  (${k.kind}) [${k.term}] → ${k.def.replace(/\n/g, " ⏎ ")}`);
  console.log("--- SYNTAXES");
  for (const s of p.syntaxes) console.log(`  ${s.label}: ${s.code.replace(/\n/g, " ⏎ ")}`);
  console.log("--- QUIZ");
  for (const q of p.quiz) console.log(`  (${q.type}) ${q.q}` + (q.options ? `\n      ${q.options.map((o, i) => (i === q.answer ? "✔" : "·") + o).join(" | ")}` : ` → ${q.answer}`));
  console.log("--- EXAMEN");
  for (const q of p.exam) console.log(`  ${q.q}  [${q.expected.join(", ")}]`);
}
