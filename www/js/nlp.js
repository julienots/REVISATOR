// Générateur local (hors-ligne) : analyse le texte d'un cours pour produire
// fiche, mots-clés, syntaxes, quiz, examen blanc et script de podcast.
// Aucune IA requise : heuristiques sur la structure et la fréquence des mots.

const STOP = new Set(
  (
    "a à au aux avec ce ces cet cette ceci cela ça dans de des du elle elles en et eux il ils je la le les leur leurs lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y être est sont était étaient sera seront été avoir ont avait avaient aura auront eu fait faire font plus moins très tout tous toute toutes autre autres comme donc alors aussi ainsi car si sans sous entre vers chez lors dont puis peu peut peuvent doit doivent deux trois quand comment pourquoi chaque celui celle ceux celles certains certaines quelque quelques encore déjà bien après avant depuis pendant selon tandis afin cela leurs ici là non oui c'est n'est qu'il qu'elle l'on d'un d'une lequel laquelle lesquels lesquelles partir grâce cours partie exemple ensemble manière façon permet permettent utilise utilisent nécessite déroule produit chose même mettre faut fait doit avant après celui " +
    "the of and to in is are was were be been for on with as by at from that this these those it its an or not but which can will has have had their there they them into than also such may more most other some any each been being about over only"
  )
    .split(/\s+/)
    .filter(Boolean)
);

export const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'");

const stem = (w) => norm(w).replace(/(ements?|ations?|ment|ions?|eurs?|euses?|ites?|iques?|aux|es|s|e|x)$/, "").slice(0, 7);

const words = (s) => (s.match(/[\p{L}][\p{L}\p{N}'’-]*/gu) || []).map((w) => w.replace(/^[ldjmtsnc]['’]/i, ""));

const contentWords = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(norm(w)));

let counter = 0;
const id = () => "g" + Date.now().toString(36) + (counter++).toString(36);

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s) => s.replace(/\s+/g, " ").trim();

// ---------- Découpage ----------

const CODE_RE = /(^\s*(def |function |for |while |if |else|return |class |import |from |#include|public |private |SELECT |INSERT |UPDATE |CREATE |print\(|console\.|let |const |var |int |float |double |<\/?[a-z]+[ >]))|[{};]\s*$|=>|==|!=|<=|>=|\+=|:=/i;
const FORMULA_RE = /([→⇒↔⇌]|\w\s*\+\s*\w|[A-Za-zαβγδΔπθλμσΩω]\s*[=≈≤≥<>]\s*[^=]|[√∑∫∂²³^]|\b(sin|cos|tan|log|ln|exp|lim)\s*\(|\d\s*[×x*/÷]\s*\d)/;

function isHeading(line, next) {
  const l = line.trim();
  if (!l) return false;
  if (/^#{1,6}\s/.test(l)) return true;
  if (/^([IVX]+|[A-Z]|\d+(\.\d+)*)[.)\-–]\s+\S/.test(l) && l.length < 80 && !/[.!?]$/.test(l)) return true;
  if (l.length < 60 && l === l.toUpperCase() && /[A-Z]{2}/.test(l) && !FORMULA_RE.test(l) && !CODE_RE.test(l)) return true;
  if (l.length < 55 && !/[.;,!?:]$/.test(l) && next !== undefined && next.trim().length > l.length && !CODE_RE.test(l) && !FORMULA_RE.test(l) && l.split(" ").length <= 8) return true;
  return false;
}

const stripHeading = (l) => l.trim().replace(/^#{1,6}\s*/, "").replace(/^([IVX]+|[A-Z]|\d+(\.\d+)*)[.)\-–]\s+/, "").replace(/[:：]$/, "");

function splitSentences(text) {
  return text
    .replace(/\s*\n\s*[-•*▪►✓]\s*/g, "\n")
    .split(/(?<=[.!?…])\s+(?=[«"A-ZÀ-ÖØ-Þ0-9])|\n+/)
    .map(clean)
    .filter((s) => s.length > 3);
}

export function parse(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections = [];
  let cur = { title: "Introduction", lines: [] };
  for (let i = 0; i < lines.length; i++) {
    const nextNonEmpty = lines.slice(i + 1).find((x) => x.trim());
    if (isHeading(lines[i], nextNonEmpty)) {
      if (cur.lines.join("").trim()) sections.push(cur);
      cur = { title: cap(stripHeading(lines[i])), lines: [] };
    } else cur.lines.push(lines[i]);
  }
  if (cur.lines.join("").trim()) sections.push(cur);
  for (const s of sections) {
    s.raw = s.lines.join("\n");
    s.sentences = splitSentences(s.raw);
  }
  return sections;
}

// ---------- Extraction ----------

const DEF_VERBS = "est|sont|désigne|désignent|correspond à|correspondent à|signifie|signifient|représente|représentent|se définit comme|se définissent comme|consiste à|consistent à|is|are|refers to|means";

function extractDefinitions(sections) {
  const defs = [];
  const seen = new Set();
  const push = (term, def, src) => {
    term = clean(term).replace(/^(le|la|les|l'|un|une|des|the|a|an)\s+/i, "").replace(/[«»"*_]/g, "");
    def = clean(def).replace(/[«»*_]/g, "");
    if (term.length < 2 || term.length > 50 || def.length < 8 || term.split(" ").length > 6) return;
    if (/^(il|elle|ils|elles|on|cela|ce|c'|ceci|this|it|they)\b/i.test(term)) return;
    const k = norm(term);
    if (seen.has(k)) return;
    seen.add(k);
    defs.push({ term: cap(term), def: cap(def.replace(/[.;]$/, "")), src: src || "" });
  };
  for (const sec of sections) {
    for (const raw of sec.raw.split("\n")) {
      const line = raw.trim().replace(/^[-•*▪►✓]\s*/, "");
      const m = line.match(/^([^:=—–]{2,50}?)\s*(?::|—|–|\s-\s)\s+(.{8,})$/);
      if (m && !CODE_RE.test(line) && !/^https?/.test(m[1])) push(m[1], m[2], line);
    }
    for (const s of sec.sentences) {
      let m = s.match(new RegExp(`^(?:On\\s+(?:appelle|nomme|définit|qualifie de)\\s+)(.{2,50}?)\\s+(?:(?:le|la|les|l'|un|une|tout|toute)\\s+)?(.{8,})$`, "i"));
      if (m) {
        push(m[1], m[2], s);
        continue;
      }
      m = s.match(new RegExp(`^((?:(?:Le|La|Les|L'|Un|Une|The|A|An)\\s*)?[^,;:]{2,50}?)\\s+(${DEF_VERBS})\\s+(.{8,})$`, "i"));
      if (m) {
        const verb = m[2].toLowerCase();
        const body = /^(est|sont|is|are)$/.test(verb) ? m[3] : `${m[2]} ${m[3]}`;
        push(m[1], body, s);
      }
      m = s.match(/(.{2,40}?)\s*\(([^)]{8,80})\)/);
      if (m && /[A-ZÀ-Ö]{2,}/.test(m[1].split(" ").pop())) push(m[1].split(" ").pop(), m[2], s);
    }
  }
  return defs;
}

function extractKeywords(sections, defs, n = 18) {
  const tf = new Map();
  const display = new Map();
  const nouns = new Set();
  const add = (w, weight) => {
    const k = stem(w);
    if (k.length < 3) return;
    tf.set(k, (tf.get(k) || 0) + weight);
    if (!display.has(k) || w.length < display.get(k).length) display.set(k, w);
  };
  for (const sec of sections) {
    for (const w of contentWords(sec.title)) add(w, 3);
    for (const s of sec.sentences) {
      for (const w of contentWords(s)) add(w, /^[A-ZÀ-Ö]/.test(w) && s.indexOf(w) > 0 ? 1.6 : 1);
      // Les mots précédés d'un déterminant sont probablement des noms : on les favorise.
      for (const m of s.matchAll(/\b(?:le|la|les|l'|l’|du|des|un|une|au|aux|ce|cette|ces)\s*([\p{L}][\p{L}\p{N}-]{3,})/giu)) if (!STOP.has(norm(m[1]))) nouns.add(stem(m[1]));
      for (const w of words(s)) if (/\d/.test(w) || /^[A-Z]{2,}/.test(w)) nouns.add(stem(w));
    }
  }
  const defTerms = new Set(defs.map((d) => stem(d.term.split(" ")[0])));
  return [...tf.entries()]
    .filter(([k]) => !defTerms.has(k) && nouns.has(k))
    .map(([k, v]) => [display.get(k), v * Math.min(display.get(k).length, 10) / 6])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function sentenceFor(term, sections) {
  // Phrase la plus « définitoire » : courte et où le terme apparaît tôt.
  const t = stem(term);
  let best = null;
  for (const sec of sections)
    for (const s of sec.sentences) {
      if (s.length < 30 || s.length > 260) continue;
      const ws = words(s);
      const pos = ws.findIndex((w) => stem(w) === t);
      if (pos < 0) continue;
      const score = pos * 3 + s.length / 25;
      if (!best || score < best.score) best = { s, score };
    }
  return best ? best.s : "";
}

function extractSyntaxes(sections) {
  const out = [];
  for (const sec of sections) {
    const lines = sec.raw.split("\n");
    let block = [];
    const flush = () => {
      if (block.length) {
        const code = block.join("\n").trim();
        const isCode = CODE_RE.test(code);
        out.push({ label: sec.title, code, note: isCode ? "Syntaxe / code" : "Formule" });
      }
      block = [];
    };
    for (const l of lines) {
      const t = l.trim();
      if (t && (CODE_RE.test(t) || (FORMULA_RE.test(t) && t.length < 120)) && !/^[-•*]\s/.test(t) && t.split(" ").length < 20) block.push(l.replace(/^\s{0,4}/, ""));
      else flush();
    }
    flush();
  }
  return out.slice(0, 30);
}

function scoreSentences(sections, keywords) {
  const ks = new Set(keywords.map(stem));
  const scored = [];
  sections.forEach((sec, si) =>
    sec.sentences.forEach((s, i) => {
      if (s.length < 25 || s.length > 320 || CODE_RE.test(s)) return;
      const cw = contentWords(s);
      const hit = cw.filter((w) => ks.has(stem(w))).length;
      let score = hit / Math.sqrt(cw.length + 1) + (i === 0 ? 0.4 : 0);
      if (/(important|retenir|essentiel|principal|fondamental|clé|conclusion|donc|ainsi|permet)/i.test(s)) score += 0.6;
      if (/\b(1[0-9]{3}|20[0-9]{2})\b/.test(s)) score += 0.3;
      scored.push({ s, score, si });
    })
  );
  return scored.sort((a, b) => b.score - a.score);
}

// ---------- Questions ----------

function falsify(sentence, keywords) {
  const num = sentence.match(/\b\d+([,.]\d+)?\b/);
  if (num) {
    const n = parseFloat(num[0].replace(",", "."));
    const delta = n > 1000 ? Math.ceil(Math.random() * 30) + 5 : Math.max(1, Math.round(n * 0.5));
    return sentence.replace(num[0], String(Math.random() < 0.5 ? n + delta : Math.max(0, n - delta)).replace(".", ","));
  }
  const present = keywords.filter((k) => new RegExp(`\\b${escapeRe(k)}\\b`, "i").test(sentence));
  const absent = keywords.filter((k) => !present.includes(k));
  if (present.length && absent.length) {
    const swapped = sentence.replace(new RegExp(`\\b${escapeRe(present[0])}\\b`, "i"), absent[Math.floor(Math.random() * absent.length)].toLowerCase());
    // Élision : « la atmosphère » → « l'atmosphère »
    return swapped.replace(/\b([LlDd])[ae] ([aeiouyhéèêàâîôûAEIOUYHÉ])/g, "$1'$2");
  }
  const neg = sentence.replace(/\b(est|sont|peut|peuvent|permet|permettent|a|ont)\b/, (v) => `ne ${v} pas`).replace(/\bne (a|est|ont)\b/, "n'$1");
  return neg !== sentence ? neg : null;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildQuiz(defs, keywords, ranked, sections) {
  const quiz = [];
  const defTexts = defs.map((d) => d.def);
  for (const d of defs) {
    const wrongDefs = shuffle(defTexts.filter((x) => x !== d.def)).slice(0, 3);
    if (wrongDefs.length >= 2) {
      const options = shuffle([d.def, ...wrongDefs]);
      quiz.push({ id: id(), type: "qcm", q: `Que désigne « ${d.term} » ?`, options, answer: options.indexOf(d.def), explain: `${d.term} : ${d.def}.` });
    }
    const wrongTerms = shuffle(defs.filter((x) => x !== d).map((x) => x.term)).slice(0, 3);
    if (wrongTerms.length >= 2) {
      const options = shuffle([d.term, ...wrongTerms]);
      quiz.push({ id: id(), type: "qcm", q: `Quel terme correspond à : « ${d.def} » ?`, options, answer: options.indexOf(d.term), explain: `C'est la définition de ${d.term}.` });
    }
  }
  const pool = [...new Set([...keywords, ...defs.map((d) => d.term)])];
  for (const { s } of ranked.slice(0, 14)) {
    const k = pool.find((t) => new RegExp(`\\b${escapeRe(t)}\\b`, "i").test(s) && t.length > 3);
    if (!k) continue;
    const others = shuffle(pool.filter((x) => norm(x) !== norm(k))).slice(0, 3);
    if (others.length < 2) continue;
    const options = shuffle([k, ...others]);
    quiz.push({ id: id(), type: "trou", q: s.replace(new RegExp(`\\b${escapeRe(k)}\\b`, "i"), "_____"), options, answer: options.indexOf(k), explain: s });
  }
  for (const { s } of ranked.slice(0, 10)) {
    const truth = Math.random() < 0.5;
    if (truth) quiz.push({ id: id(), type: "vf", q: s, answer: true, explain: "Vrai : c'est écrit tel quel dans le cours." });
    else {
      const f = falsify(s, pool);
      if (f && f !== s) quiz.push({ id: id(), type: "vf", q: f, answer: false, explain: `Faux. Le cours dit : « ${s} »` });
    }
  }
  return shuffle(quiz);
}

function buildExam(defs, sections, ranked) {
  const exam = [];
  for (const d of shuffle(defs).slice(0, 4)) {
    exam.push({ id: id(), q: `Définis « ${d.term} » avec tes propres mots.`, expected: contentWords(d.def).slice(0, 8), model: `${d.term} : ${d.def}.`, notion: d.term });
  }
  for (const sec of sections.filter((s) => s.sentences.length >= 2).slice(0, 4)) {
    const best = ranked.filter((r) => sections[r.si] === sec).slice(0, 3).map((r) => r.s);
    if (!best.length) continue;
    const kw = [...new Set(best.flatMap(contentWords))].sort((a, b) => b.length - a.length).slice(0, 8);
    exam.push({ id: id(), q: `Explique ce que tu as retenu de la partie « ${sec.title} ».`, expected: kw, model: best.join(" "), notion: sec.title });
  }
  for (const { s } of ranked) {
    let m = s.match(/^(.{15,}?)\s*,?\s+(?:car|parce que|parce qu'|puisque|because)\s+(.{8,})$/i);
    if (m) {
      exam.push({ id: id(), q: `Pourquoi : « ${m[1].replace(/[,.]$/, "")} » ? Justifie ta réponse.`, expected: contentWords(m[2]).slice(0, 8), model: s, notion: "Raisonnement" });
      break;
    }
    m = s.match(/^(.{15,}?)\s*,?\s+(?:donc|c'est pourquoi|par conséquent|so)\s+(.{8,})$/i);
    if (m) {
      exam.push({ id: id(), q: `Quelle est la conséquence de : « ${m[1].replace(/[,.]$/, "")} » ? Explique.`, expected: contentWords(m[2]).slice(0, 8), model: s, notion: "Raisonnement" });
      break;
    }
  }
  return exam;
}

// ---------- Point d'entrée ----------

export function generatePack(text, title = "ce cours") {
  const sections = parse(text);
  const defs = extractDefinitions(sections);
  const keywords = extractKeywords(sections, defs);
  const ranked = scoreSentences(sections, [...keywords, ...defs.map((d) => d.term)]);
  const syntaxes = extractSyntaxes(sections);

  const kwCards = [
    ...defs.map((d) => ({ id: id(), term: d.term, def: d.def })),
    ...keywords
      .slice(0, Math.max(4, 14 - defs.length))
      .map((k) => ({ id: id(), term: cap(k), def: sentenceFor(k, sections) }))
      .filter((k) => k.def),
  ];

  const fiche = sections.map((sec, si) => ({
    title: sec.title,
    points: ranked
      .filter((r) => r.si === si)
      .slice(0, 4)
      .map((r) => r.s),
  })).filter((s) => s.points.length);

  const retenir = ranked.slice(0, 6).map((r) => r.s);
  const dates = [...new Set(sections.flatMap((s) => s.sentences).filter((s) => /\b(1[0-9]{3}|20[0-9]{2})\b/.test(s)))].slice(0, 8);
  const quiz = buildQuiz(defs, keywords, ranked, sections);
  const exam = buildExam(defs, sections, ranked);

  const summary = ranked.slice(0, 3).map((r) => r.s).join(" ");
  const podcast = buildPodcast(title, fiche, kwCards, retenir);

  return { source: "local", createdAt: Date.now(), summary, fiche, keywords: kwCards, syntaxes, retenir, dates, quiz, exam, podcast };
}

function buildPodcast(title, fiche, cards, retenir) {
  const parts = [`Bienvenue dans ce podcast de révision consacré à ${title}. Installe-toi, on va reprendre l'essentiel ensemble.`];
  for (const s of fiche) {
    parts.push(`Partie : ${s.title}.`);
    parts.push(s.points.join(" "));
  }
  if (cards.length) {
    parts.push("Passons au vocabulaire à connaître.");
    for (const c of cards.slice(0, 10)) parts.push(`${c.term}. ${c.def}.`);
  }
  if (retenir.length) {
    parts.push("Pour finir, voici ce qu'il faut absolument retenir.");
    parts.push(retenir.slice(0, 4).join(" "));
  }
  parts.push("C'est terminé ! Lance maintenant un quiz pour vérifier que tout est bien acquis.");
  return parts.join("\n\n");
}

// ---------- Correction d'une réponse libre ----------
export function gradeOpen(answer, expected) {
  const got = new Set(contentWords(answer).map(stem));
  const exp = [...new Set(expected.map((w) => stem(w)))].filter((w) => w.length >= 3);
  if (!exp.length) return { ratio: answer.trim().length > 20 ? 1 : 0, missing: [] };
  const hits = exp.filter((e) => [...got].some((g) => g.startsWith(e.slice(0, 5)) || e.startsWith(g.slice(0, 5))));
  const missing = expected.filter((w) => !hits.includes(stem(w)));
  const lengthPenalty = answer.trim().split(/\s+/).length < 4 ? 0.5 : 1;
  return { ratio: Math.min(1, (hits.length / exp.length) * 1.4 * lengthPenalty), missing: [...new Set(missing)].slice(0, 6) };
}

// Compare une explication « façon Feynman » aux notions clés du cours.
export function feynmanCheck(explanation, pack) {
  const terms = pack.keywords.map((k) => k.term);
  const got = contentWords(explanation).map(stem);
  const covered = terms.filter((t) => contentWords(t).some((w) => got.some((g) => g.startsWith(stem(w).slice(0, 5)))));
  const missing = terms.filter((t) => !covered.includes(t));
  const wordsCount = explanation.trim().split(/\s+/).filter(Boolean).length;
  const avgLen = wordsCount ? explanation.replace(/\s+/g, "").length / wordsCount : 0;
  return { covered, missing, ratio: terms.length ? covered.length / terms.length : 0, simple: avgLen < 6.5 };
}
