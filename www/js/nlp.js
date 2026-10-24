// Générateur local (hors-ligne) : analyse le texte d'un cours pour produire
// fiche, cartes, syntaxes, quiz, examen blanc et script de podcast.
// Aucune IA : on reconstruit la structure du cours (titres, paragraphes, listes,
// formules, code), puis on n'en tire que des questions dont la réponse est sûre.

export const PACK_VERSION = 2;

const BASIC_STOP = new Set(
  (
    "a à au aux avec ce ces cet cette ceci cela ça dans de des du elle elles en et eux il ils je la le les leur leurs lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous y être est sont était étaient sera seront été avoir ont avait avaient aura auront eu fait faire font plus moins très tout tous toute toutes autre autres comme donc alors aussi ainsi car si sans sous entre vers chez lors dont puis peu peut peuvent doit doivent deux trois quand comment pourquoi chaque celui celle ceux celles certains certaines quelque quelques encore déjà bien après avant depuis pendant selon tandis afin cela leurs ici là non oui c'est n'est qu'il qu'elle l'on d'un d'une lequel laquelle lesquels lesquelles partir grâce même faut fait doit celui " +
    "the of and to in is are was were be been for on with as by at from that this these those it its an or not but which can will has have had their there they them into than also such may more most other some any each been being about over only"
  )
    .split(/\s+/)
    .filter(Boolean)
);
// Mots trop génériques pour être des notions clés (mais utiles pour comprendre une question).
const STOP = new Set([
  ...BASIC_STOP,
  ..."cours partie exemple ensemble manière façon permet permettent utilise utilisent nécessite déroule produit chose mettre forme point lien mots mot type cas fois nombre nombres élément éléments chapitre leçon début fin moment personne personnes gens chose choses idée partie parties exemple exemples fois question réponse".split(" "),
]);

export const norm = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'");

const stem = (w) => norm(w).replace(/(ements?|ations?|ment|ions?|eurs?|euses?|ites?|iques?|aux|es|s|e|x)$/, "").slice(0, 7);

const words = (s) => (s.match(/[\p{L}][\p{L}\p{N}'’-]*/gu) || []).map((w) => w.replace(/^[ldjmtsnc]['’]/i, ""));
const contentWords = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(norm(w)));
const qaWords = (s) => words(s).filter((w) => w.length > 2 && !BASIC_STOP.has(norm(w)));

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

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clean = (s) => s.replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniqBy = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const endsSentence = (s) => /[.!?…]["»)]?$/.test(s.trim());
const stripEnd = (s) => s.trim().replace(/[\s.;:,]+$/, "");
// « Le coefficient directeur se calcule avec la formule » → « Coefficient directeur »
const formulaLabel = (s) =>
  cap(
    stripEnd(s)
      .replace(/\s*(?:se calcul(?:e|ent)|s'écrit|s’écrit|s'obtient|s’obtient|est donnée? par|sont données? par|vaut|est égale? à|se note|est défini(?:e)? par)\b.*$/i, "")
      .replace(/\s*(?:avec|par|selon) la (?:formule|relation)\b.*$/i, "")
      .replace(/^(?:(?:le|la|les|un|une)\s+|l['’])/i, "")
      .trim()
  );

// ---------- Reconnaissance des types de lignes ----------

const CODE_RE = /^\s*(def |function |for |while |if .*:|elif |else\s*:|else\s*\{|return\b|class |import |from \S+ import|#include|public |private |SELECT |INSERT |UPDATE |CREATE |print\(|console\.|let |const |var |int |float |double |System\.|<\/?[a-z][a-z0-9]*[ >])|[{}]\s*$|=>|==|!=|\+=|:=|\w+\(.*\)\s*;\s*$/i;
const FORMULA_RE = /([→⇒↔⇌]|[A-Za-zαβγδΔπθλμσΩω\d)]\s*[=≈≤≥]\s*\S|[√∑∫∂²³]|\b(sin|cos|tan|log|ln|exp|lim)\s*\(|\d\s*[×*/÷]\s*\d)/;
const BULLET_RE = /^\s*([-–—•*▪►✓➢→◦]|\d{1,2}[)]|[a-h][)])\s+/;
const HEADING_PREFIX_RE = /^\s*(#{1,6}\s+|(chapitre|partie|leçon|lecon|thème|theme|séquence|sequence|unité|chapter|part|unit)\b\s*[\dIVX]*\s*[:.\-–]?\s*|([IVX]{1,5}|\d{1,2}(\.\d{1,2})*|[A-H])\s*[.)\-–]\s+)/i;

function isCodeLine(l) {
  return CODE_RE.test(l) && !/^[A-ZÀ-Ö][a-zà-ÿ]+ [a-zà-ÿ]+ [a-zà-ÿ]+ .*\.$/.test(l.trim());
}

// Une ligne « formule » : contient une relation mathématique et presque pas de prose.
function isFormulaLine(l) {
  const t = l.trim();
  if (!FORMULA_RE.test(t) || t.length > 120) return false;
  const rhs = t.includes(" : ") ? t.slice(t.indexOf(" : ") + 3) : t;
  const prose = (rhs.match(/\p{L}{4,}/gu) || []).length;
  return prose <= 2 && !endsSentence(rhs.replace(/\)$/, "")) ? true : prose <= 1;
}

function isAllCaps(l) {
  const letters = l.replace(/[^\p{L}]/gu, "");
  return letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function headingLike(l) {
  const t = l.trim();
  if (!t || t.length > 90) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (BULLET_RE.test(t) && !/^\s*\d{1,2}[)]\s+\S{1,40}$/.test(t)) return false;
  if (isFormulaLine(t) || isCodeLine(t)) return false;
  if (HEADING_PREFIX_RE.test(t) && !endsSentence(t) && t.split(/\s+/).length <= 12) return true;
  if (isAllCaps(t) && t.split(/\s+/).length <= 12) return true;
  return false;
}

// Titre « nu » : ligne courte, sans ponctuation finale, suivie d'un texte.
function bareHeading(t) {
  return t.length <= 60 && t.split(/\s+/).length <= 8 && /^[\p{Lu}\d«"]/u.test(t) && !/[.!?;,:]$/.test(t) && !/\s:\s/.test(t) && !isFormulaLine(t) && !isCodeLine(t);
}

function cleanHeading(t, fullText) {
  let h = t
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(chapitre|partie|leçon|lecon|thème|theme|séquence|sequence|unité|chapter|part|unit)\s*[\dIVX]*\s*[:.\-–]\s*(?=\S)/i, "")
    .replace(/^([IVX]{1,5}|\d{1,2}(\.\d{1,2})*|[A-H])\s*[.)\-–]\s+/, "")
    .replace(/[:：]\s*$/, "");
  if (isAllCaps(h)) {
    // Remet en minuscules en gardant les noms propres qui apparaissent avec une majuscule ailleurs.
    h = h.toLowerCase().replace(/\p{L}[\p{L}'-]*/gu, (w) => {
      const m = fullText.match(new RegExp(`(?<=[\\s'’(])(${escapeRe(w.charAt(0).toUpperCase() + w.slice(1))})\\b`, "u"));
      return m ? m[1] : w;
    });
  }
  return cap(h.trim());
}

// ---------- Découpage en phrases ----------

const ABBR = ["M", "MM", "Mme", "Mlle", "Dr", "Pr", "St", "Ste", "etc", "ex", "cf", "p", "pp", "env", "av", "apr", "J.-C", "n°", "vol", "fig", "art", "chap", "éd", "min", "max", "approx", "vs", "Mr", "Mrs", "e.g", "i.e"];
const ABBR_RE = new RegExp(`\\b(${ABBR.map(escapeRe).join("|")})\\.(?=\\s)`, "g");

function splitSentences(text) {
  const protectedText = text
    .replace(ABBR_RE, "$1\u0001")
    .replace(/(?<=^|\s)([A-Z])\.(?=\s+\p{Lu}\p{Ll})/gu, "$1\u0001"); // initiales : « J. Dupont » (pas « 2 °C. »)
  return protectedText
    .split(/(?<=[.!?…]["»)]?)\s+(?=[«"“(\p{Lu}\d-])/u)
    .map((s) => clean(s.replace(/\u0001/g, ".")))
    .filter((s) => s.length > 2);
}

// ---------- Structure du cours ----------
// sections : [{ title, blocks: [{ type: "p", sentences } | { type: "list", intro, items } |
//                               { type: "code", intro, code } | { type: "formula", label, intro, text }] }]

function reflow(raw) {
  const lines = raw
    .replace(/\r/g, "")
    .replace(/\t/g, "    ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .split("\n");
  const prose = lines.filter((l) => l.trim() && !BULLET_RE.test(l) && !headingLike(l)).map((l) => l.trim().length);
  const sorted = prose.slice().sort((a, b) => a - b);
  const typical = sorted.length >= 3 ? sorted[Math.floor(sorted.length * 0.75)] : 999;

  const out = [];
  for (const line of lines) {
    const t = line.trim();
    const prev = out[out.length - 1];
    if (t && prev && prev.text.trim()) {
      const p = prev.text.trim();
      const join =
        !BULLET_RE.test(t) &&
        !/^#{1,6}\s/.test(t) &&
        !(HEADING_PREFIX_RE.test(t) && !/^\p{Ll}/u.test(t)) &&
        !(isCodeLine(t) || isCodeLine(p)) &&
        !isFormulaLine(t) &&
        !isFormulaLine(p) &&
        !headingLike(p) &&
        !/[.!?:;…]["»)]?$/.test(p) &&
        (/^[\p{Ll}(«),;]/u.test(t) || /\b(le|la|les|l'|un|une|des|du|de|d'|à|au|aux|en|et|ou|par|pour|sur|dans|avec|qui|que|est|sont)$/i.test(p) || (!BULLET_RE.test(p) && !/\)$/.test(p) && typical >= 30 && typical < 999 && p.length >= typical * 0.7 && !bareHeading(p)));
      if (join) {
        prev.text = p.endsWith("-") && /^\p{Ll}/u.test(t) ? p.slice(0, -1) + t : p + " " + t;
        continue;
      }
    }
    out.push({ text: line });
  }
  return out.map((o) => o.text);
}

export function structure(text) {
  const lines = reflow(text);
  const nonEmpty = lines.map((l, i) => [l, i]).filter(([l]) => l.trim());
  const sections = [];
  let docTitle = "";
  let cur = { title: "", blocks: [] };
  let para = null;

  const pushSentences = (txt) => {
    if (!para) {
      para = { type: "p", sentences: [] };
      cur.blocks.push(para);
    }
    para.sentences.push(...splitSentences(txt));
  };
  // Une phrase qui finit par « : » juste avant une liste, un code ou une formule en devient l'introduction.
  const takeIntro = () => {
    const last = cur.blocks[cur.blocks.length - 1];
    if (last?.type === "p" && last.sentences.length && /:$/.test(last.sentences[last.sentences.length - 1])) {
      const s = last.sentences.pop();
      if (!last.sentences.length) cur.blocks.pop();
      return s;
    }
    return null;
  };

  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const t = line.trim();
    if (!t) {
      para = null;
      continue;
    }
    const idx = nonEmpty.findIndex(([, i]) => i === k);
    const prevLine = idx > 0 ? nonEmpty[idx - 1][0].trim() : "";
    const nextLine = nonEmpty[idx + 1]?.[0].trim() || "";
    const blankBefore = k === 0 || !lines[k - 1].trim();

    const heading = headingLike(t) || (bareHeading(t) && nextLine && (blankBefore || !prevLine || endsSentence(prevLine) || headingLike(prevLine)) && !BULLET_RE.test(nextLine) && (nextLine.length > t.length || headingLike(nextLine) || blankBefore));
    if (heading && !(cur.blocks.length === 0 && !sections.length && !docTitle && idx === 0 && false)) {
      if (idx === 0 && !docTitle) {
        docTitle = cleanHeading(t, text);
        para = null;
        continue;
      }
      if (cur.blocks.length || cur.title) sections.push(cur);
      cur = { title: cleanHeading(t, text), blocks: [] };
      para = null;
      continue;
    }

    if (BULLET_RE.test(t)) {
      const item = clean(t.replace(BULLET_RE, ""));
      const last = cur.blocks[cur.blocks.length - 1];
      if (last?.type === "list" && !para) last.items.push(item);
      else {
        const intro = takeIntro();
        cur.blocks.push({ type: "list", intro, items: [item] });
      }
      para = null;
      continue;
    }

    if (isCodeLine(t) || (/^\s{2,}\S/.test(line) && cur.blocks[cur.blocks.length - 1]?.type === "code")) {
      const last = cur.blocks[cur.blocks.length - 1];
      if (last?.type === "code" && !para) last.code += "\n" + line;
      else {
        const intro = takeIntro();
        cur.blocks.push({ type: "code", intro, code: line });
      }
      para = null;
      continue;
    }

    if (isFormulaLine(t)) {
      const m = t.match(/^([^=:]{2,50}?)\s+:\s+(.+)$/);
      const intro = m ? null : takeIntro();
      cur.blocks.push({ type: "formula", label: m ? cap(m[1].trim()) : null, intro, text: m ? m[2].trim() : t });
      para = null;
      continue;
    }

    pushSentences(t);
  }
  if (cur.blocks.length || cur.title) sections.push(cur);
  // Code : on retire seulement l'indentation commune, pour garder la structure (Python !).
  for (const sec of sections)
    for (const b of sec.blocks)
      if (b.type === "code") {
        const ls = b.code.split("\n");
        const ind = Math.min(...ls.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
        b.code = ls.map((l) => l.slice(ind)).join("\n");
      }

  // Cours sans titres mais en plusieurs paragraphes : chaque paragraphe devient une partie.
  if (sections.length === 1 && !sections[0].title) {
    const paras = sections[0].blocks;
    const ps = paras.filter((b) => b.type === "p");
    if (ps.length >= 2 && ps.reduce((a, b) => a + b.sentences.length, 0) / ps.length >= 2.5) {
      sections.length = 0;
      let s = null;
      for (const b of paras) {
        if (b.type === "p" || !s) {
          s = { title: "", blocks: [] };
          sections.push(s);
        }
        s.blocks.push(b);
      }
    }
  }
  for (const s of sections) {
    s.sentences = s.blocks.flatMap((b) => (b.type === "p" ? b.sentences : b.type === "list" ? [b.intro, ...b.items].filter(Boolean) : []));
    // Paragraphe sans titre mais daté : on le titre par sa période (« 1789 », « 1792 – 1799 »).
    if (!s.title) {
      const ds = s.sentences.map(findDate).filter(Boolean);
      const years = ds.flatMap((d) => [d.year, d.end].filter(Boolean));
      if (years.length) {
        const a = Math.min(...years);
        const b = Math.max(...years);
        const months = [...new Set(ds.filter((d) => d.month && d.year === a).sort((x, y) => dateKey(x) - dateKey(y)).map((d) => d.month.toLowerCase()))];
        if (a !== b) s.title = `${a} – ${b}`;
        else if (months.length) s.title = cap(months.length > 1 ? `${months[0]} – ${months[months.length - 1]} ${a}` : `${months[0]} ${a}`);
        else s.title = String(a);
      }
    }
  }
  for (const s of sections) s.sentences = s.blocks.flatMap((b) => (b.type === "p" ? b.sentences : b.type === "list" ? [b.intro, ...b.items].filter(Boolean) : []));
  return { title: docTitle, sections: sections.filter((s) => s.blocks.length) };
}

// Compatibilité : liste des parties avec leurs phrases.
export function parse(text) {
  return structure(text).sections.map((s) => ({ title: s.title || "", sentences: s.sentences }));
}

// ---------- Lexique du cours ----------

const ARTICLE_RE = /(?<![\p{L}])(le|la|les|un|une|des|du|au|aux|l'|l’)(?:\s+|(?<=['’]))([\p{L}][\p{L}\p{N}-]{2,})/giu;
// Adjectifs placés avant le nom : ce ne sont pas des notions (« les mauvaises récoltes »).
const PRE_ADJ = new Set("grand grande grands grandes petit petite petits petites bon bonne bons bonnes mauvais mauvaise mauvaises nouveau nouvel nouvelle nouveaux nouvelles vieux vieille vieilles jeune jeunes premier première premiers premières dernier dernière derniers dernières seul seule seuls seules beau bel belle beaux belles gros grosse haut haute hauts hautes long longue meilleur meilleure meilleurs principal principale principaux principales nombreux nombreuses différents différentes divers diverses certain certaine véritable vrai vraie faux fausse ancien ancienne anciens anciennes simple simples double grave graves fort forte".split(" "));
const GENDER = { le: "m", un: "m", du: "m", au: "m", la: "f", une: "f", les: "p", des: "p", aux: "p", "l'": "v", "l’": "v" };

function buildLexicon(sents) {
  const nouns = new Map(); // norm(mot) → { word, count, genders:Set }
  const proper = new Map(); // nom propre → nombre d'occurrences
  for (const s of sents) {
    for (const m of s.matchAll(ARTICLE_RE)) {
      const w = m[2];
      // « qui la traverse », « on le mesure » : ici « la/le » est un pronom, pas un article.
      if (/\b(qui|que|qu'|ne|n'|se|on|il|elle|ils|elles|je|tu|nous|vous|y|pour|à|de)\s*$/i.test(s.slice(0, m.index)) && !/^l['’]/i.test(m[1]) && /^(le|la|les)$/i.test(m[1])) continue;
      if (STOP.has(norm(w)) || PRE_ADJ.has(w.toLowerCase()) || /^\d/.test(w)) continue;
      const k = norm(w);
      const e = nouns.get(k) || { word: w.toLowerCase() === w ? w : w, count: 0, genders: new Set() };
      e.count++;
      e.genders.add(GENDER[m[1].toLowerCase()]);
      nouns.set(k, e);
    }
    // Noms propres : suites de mots à majuscule hors début de phrase (« Louis XVI », « Napoléon Bonaparte »).
    const body = s.replace(/^\S+\s*/, " ");
    for (const m of body.matchAll(/(?<=[\s(«"'’-])(\p{Lu}[\p{L}-]+(?:\s+(?:de\s+|du\s+|d'|la\s+)?\p{Lu}[\p{L}-]+|\s+[IVX]{1,5}\b)*)/gu)) {
      const p = m[1].trim();
      if (p.length < 3 || STOP.has(norm(p)) || /^[IVX]+$/.test(p)) continue;
      proper.set(p, (proper.get(p) || 0) + 1);
    }
  }
  return { nouns, proper };
}

// ---------- Dates ----------

const MONTHS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const DATE_RE = new RegExp(`(?:(?:dans la nuit du|le|du|au|en|de|depuis|dès|vers|jusqu'en|à partir de)\\s+)?(?:(\\d{1,2}(?:er)?)\\s+(${MONTHS})\\s+)?((?:1[0-9]|20)\\d{2}|\\d{3})(?:\\s*(?:-|à|–)\\s*((?:1[0-9]|20)\\d{2}))?(?!\\s*%|\\d|\\s*(?:€|euros?|km|m|kg|g|°|ans|habitants|personnes|morts))`, "i");

function findDate(s) {
  const m = s.match(DATE_RE);
  if (!m) return null;
  const year = Number(m[3]);
  if (year < 300 || year > 2100) return null;
  // Une année « nue » doit être introduite par une préposition ou un jour/mois.
  if (!m[2] && !/^(dans|le|du|au|en|de|depuis|dès|vers|jusqu|à)/i.test(m[0])) return null;
  const label = clean([m[1], m[2], m[3]].filter(Boolean).join(" ") + (m[4] ? `-${m[4]}` : ""));
  return { full: m[0], label, year, month: m[2] || null, day: m[1] || null, end: m[4] ? Number(m[4]) : null };
}

const MONTH_ORDER = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const dateKey = (d) => d.year * 10000 + (MONTH_ORDER.indexOf(norm(d.month || "")) + 1) * 100 + (parseInt(d.day) || 0);

// Phrase sans sa date, pour en faire la question « Que se passe-t-il le … ? »
function withoutDate(s, d) {
  return cap(
    clean(
      s
        .replace(d.full, " ")
        .replace(/^\s*[,;:]\s*/, "")
        .replace(/\s+([,.;])/g, "$1")
        .replace(/,\s*,/g, ",")
    ).replace(/^,\s*/, "")
  );
}

// ---------- Définitions ----------

const DET = "(?:un|une|le|la|l'|l’|les|des|du|ce qui|ce que|celui|celle|ceux|l'ensemble|tout|toute|a|an|the)";
const DEF_PATTERNS = [
  // On appelle X ce qui / le …
  { re: new RegExp(`^on (?:appelle|nomme|définit|qualifie de)\\s+(.{2,60}?)\\s+((?:${DET})(?:\\s|(?<=['’])).{6,})$`, "i"), term: 1, def: 2 },
  // X est appelé(e) Y  → Y : X
  { re: /^(.{3,60}?)\s+(?:est|sont)\s+(?:appelée?s?|nommée?s?|dite?s?)\s+(.{2,60}?)\.?$/i, term: 2, def: 1, flip: true },
  // X est / sont + déterminant …
  { re: new RegExp(`^(.{2,60}?)\\s+(?:est|sont|is|are)\\s+(${DET}(?:\\s|(?<=['’])).{4,})$`, "i"), term: 1, def: 2 },
  // X est formé / constitué / composé de …
  { re: /^(.{2,60}?)\s+((?:est|sont)\s+(?:formée?s?|constituée?s?|composée?s?)\s+(?:de|d'|d’|par)\s*.{3,})$/i, term: 1, def: 2 },
  // X désigne / signifie / correspond à / représente / consiste à / se définit comme / permet de / sert à / s'utilise pour / indique / mesure …
  { re: /^(.{2,60}?)\s+((?:désigne|désignent|signifie|signifient|correspond à|correspondent à|représente|représentent|consiste à|consistent à|se définit comme|se définissent comme|permet de|permettent de|sert à|servent à|s'utilise pour|s’utilise pour|s'utilisent pour|indique|indiquent|exprime|expriment|caractérise|caractérisent|refers to|means)\s.{4,})$/i, term: 1, def: 2, keepVerb: true },
];

function goodTerm(term) {
  const t = term.trim();
  const w = t.split(/\s+/);
  if (t.length < 2 || t.length > 60 || w.length > 7) return false;
  if (/^(tous|toutes|tout|toute|chaque|certains|certaines|plusieurs|la plupart|beaucoup|il|elle|ils|elles|on|cela|ce|c'|ceci|cette|ces|celui|celle|this|it|they|there|si|quand|lorsque|dans|pour|par|en|au|à|avec|sur|le \d|la \d|exemple|par exemple|remarque|attention|exercice|chapitre|partie|leçon|note|nb|ps|ex|astuce|rappel|méthode)\b/i.test(norm(t))) return false;
  if (/^\d+$/.test(t) || /[.!?]/.test(t)) return false;
  if (/\b(est|sont|a|ont|était|sera|fut)\b/i.test(t)) return false;
  return true;
}

const tidyTerm = (t) => cap(clean(t).replace(/^(?:(?:le|la|les|un|une|des|the|a|an)\s+|l['’])/i, "").replace(/[«»"*_]/g, "").replace(/\s*,$/, ""));
const tidyDef = (d) => cap(clean(d).replace(/[«»*_]/g, "").replace(/^(est|sont)\s+(?=(formée?s?|constituée?s?|composée?s?)(\s|$))/i, "").replace(/[\s.;,]+$/, ""));

function extractDefinitions(st) {
  const defs = [];
  const seen = new Set();
  const push = (term, def, src, how) => {
    term = term.replace(/,\s*(lui|elle|eux|elles|quant à (lui|elle|eux))\s*,?\s*$/i, "");
    if (!goodTerm(term)) return;
    const subject = clean(term);
    term = tidyTerm(term);
    def = tidyDef(def);
    if (def.split(/\s+/).length < 2 || def.length > 260) return;
    if (norm(def).startsWith(norm(term))) return;
    const k = norm(term);
    if (seen.has(k)) return;
    seen.add(k);
    defs.push({ term, def, src, how, subject });
  };
  for (const sec of st.sections) {
    let lastFormula = null;
    for (const b of sec.blocks) {
      if (b.type === "list") {
        for (const it of b.items) {
          let m = it.match(/^(.{2,50}?)\s*(?::|—|–|=)\s+(.{4,})$/);
          if (m) push(m[1], m[2], it, "list");
          else if ((m = it.match(/^(.{2,50}?),\s+(?:qui|qu'|dont|où)\s*(.{4,})$/i))) push(m[1], m[2], it, "list");
          else if ((m = it.match(/^(.{2,40}?)\s*\(([^)]{4,80})\)\s*$/))) push(m[1], m[2], it, "list");
        }
      }
      if (b.type === "formula" && b.label) push(b.label, b.text, `${b.label} : ${b.text}`, "formula");
      if (b.type !== "p") continue;
      for (const s of b.sentences) {
        // « Terme : définition » (une ligne de lexique)
        let m = s.match(/^([^:=]{2,50}?)\s*:\s+(.{6,})$/);
        if (m && !/^\d/.test(m[2]) && !isFormulaLine(s) && !/,\s/.test(m[1])) {
          push(m[1], m[2], s, "colon");
          continue;
        }
        const inline = s.match(/\b[a-zA-Z]\([a-z]\)\s*=\s*[^,;.]+/);
        if (inline) lastFormula = inline[0].trim();
        const body = s.replace(/^(en (?:effet|fait)|ainsi|donc|alors|de plus|par ailleurs|d'abord|enfin),\s*/i, "");
        for (const p of DEF_PATTERNS) {
          m = body.match(p.re);
          if (!m) continue;
          let def = m[p.def];
          // « Le nombre a est appelé coefficient directeur » : on rappelle la formule dont on parle.
          if (p.flip) def = clean(m[p.def]) + (lastFormula && m[p.def].split(/\s+/).length <= 4 ? ` (dans ${lastFormula})` : "");
          push(m[p.term], def, s, p.flip ? "named" : "pattern");
          break;
        }
        // Sigle expliqué entre parenthèses : « ADN (acide désoxyribonucléique) »
        for (const mm of s.matchAll(/\b(\p{Lu}{2,6})\s*\(([^)]{6,80})\)/gu)) push(mm[1], mm[2], s, "acronym");
      }
    }
  }
  return defs;
}

// Groupe nominal sujet en début de phrase : « La phase claire se déroule… » → « La phase claire ».
const VERB_STOP = new Set("se s' s’ ne n' n’ est sont a ont peut peuvent doit doivent permet permettent produit produisent contient contiennent utilise utilisent forme forment devient deviennent reste restent représente représentent possède possèdent comprend comprennent était étaient fut furent va vont".split(" "));
function leadingSubject(s) {
  if (!/^(Le|La|Les|L['’]|Ce|Cet|Cette|Ces)\s*\S/.test(s)) return null;
  const out = [];
  for (const t of s.split(/\s+/)) {
    if (VERB_STOP.has(t.toLowerCase()) || /^(s|n)['’]/i.test(t)) return out.length >= 2 && out.length <= 5 ? out.join(" ") : null;
    if (/[,;:]$/.test(t)) {
      out.push(t.replace(/[,;:]$/, ""));
      return out.length >= 2 && out.length <= 5 ? out.join(" ") : null;
    }
    if (/[.!?]$/.test(t) || out.length >= 5) break;
    out.push(t);
  }
  // Pas de verbe repéré : déterminant + nom seulement (« Cette transition crée… » → « Cette transition »).
  const [det, noun] = s.split(/\s+/);
  if (!noun || !/^\p{Ll}/u.test(noun) || /[.,;:!?]$/.test(noun)) return null;
  return `${det} ${noun}`.replace(/^(L['’])\s+/, "$1");
}
// « Il est essentiel de… », « Il faut… » : « il » impersonnel, à ne pas remplacer.
const IMPERSONAL = /^il\s+(est|était|sera|semble|reste|paraît)\s+\S+\s+(de|d['’]|que|qu['’])|^il\s+(faut|fallait|y a|y avait|s['’]agit|suffit|existe|arrive|manque)\b/i;

// ---------- Importance des phrases ----------

function scoreSentence(s, i, notionStems) {
  const cw = contentWords(s);
  const hit = cw.filter((w) => notionStems.has(stem(w))).length;
  let score = hit / Math.sqrt(cw.length + 1) + (i === 0 ? 0.3 : 0);
  if (/(important|retenir|essentiel|principal|fondamental|clé|conclusion|il faut|toujours|jamais|attention|surtout)/i.test(s)) score += 0.6;
  if (/\b(donc|car|parce que|ainsi|c'est pourquoi|permet|entraîne|provoque|cause)\b/i.test(s)) score += 0.3;
  if (findDate(s)) score += 0.4;
  if (/\d/.test(s)) score += 0.15;
  if (/^(par exemple|exemple|ex\.)/i.test(s)) score -= 0.4;
  if (cw.length < 3) score -= 0.5;
  return score;
}

// ---------- Point d'entrée ----------

export function generatePack(text, title = "ce cours") {
  const st = structure(text);
  const allSents = st.sections.flatMap((s) => s.sentences);
  const defs = extractDefinitions(st);
  const lex = buildLexicon(allSents);
  const defTerms = new Set(defs.map((d) => norm(d.term)));

  // Notions clés : termes définis, noms propres récurrents, noms fréquents.
  const properList = [...lex.proper.entries()].filter(([p, n]) => n >= 1 && p.split(" ").length <= 4).sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const nounList = [...lex.nouns.values()].filter((e) => e.count >= 2 && e.word.length >= 4).sort((a, b) => b.count - a.count).map((e) => e.word);
  const notions = uniqBy([...defs.map((d) => d.term), ...properList.slice(0, 10), ...nounList.slice(0, 10).map(cap)], norm).slice(0, 24);
  const notionStems = new Set(notions.flatMap((n) => contentWords(n).map(stem)));

  // Phrases notées, en gardant leur position dans le cours.
  const ranked = [];
  const defBySrc = new Map(defs.map((d) => [d.src, d]));
  // « Il se forme avec have… » juste après la définition du present perfect → « Le present perfect se forme… »
  st.sections.forEach((sec, si) => {
    let subject = null;
    sec.sentences.forEach((orig, i) => {
      let s = orig;
      const d = defBySrc.get(orig);
      if (d && d.how === "pattern") subject = d.subject;
      else if (subject && /^(il|elle|ils|elles)\s/i.test(orig) && !IMPERSONAL.test(orig)) s = cap(subject) + orig.replace(/^\S+/, "");
      else subject = leadingSubject(orig);
      ranked.push({ s, orig, si, i, score: scoreSentence(orig, i, notionStems) });
    });
  });
  const byScore = ranked.slice().sort((a, b) => b.score - a.score);
  const dates = [];
  for (const r of ranked) {
    const d = findDate(r.s);
    if (!d) continue;
    const event = withoutDate(r.s, d);
    // « Elle adopte… » : on garde la phrase précédente comme contexte pour savoir qui est « elle ».
    const pronoun = /^(il|elle|ils|elles|cela|ce dernier|cette dernière)\b/i.test(event);
    const prev = pronoun ? ranked.find((x) => x.si === r.si && x.i === r.i - 1)?.s : null;
    dates.push({ ...d, s: r.s, event, context: prev || null, pronoun });
  }

  // ----- Fiche : suit le plan du cours, condense seulement les cours longs -----
  const total = ranked.length;
  const keepRatio = total <= 30 ? 1 : total <= 60 ? 0.7 : 0.5;
  const threshold = keepRatio === 1 ? -Infinity : byScore[Math.floor(total * keepRatio) - 1]?.score ?? -Infinity;
  const keep = (s, i) => keepRatio === 1 || i === 0 || defBySrc.has(s) || findDate(s) || ranked.find((r) => r.orig === s)?.score >= threshold;
  const lighten = (s) => s.replace(/^(en effet|par ailleurs|de plus|d'autre part|en outre),\s*/i, "").replace(/^\p{Ll}/u, (c) => c.toUpperCase());

  const fiche = st.sections
    .map((sec) => {
      const points = [];
      for (const b of sec.blocks) {
        if (b.type === "p") {
          b.sentences.forEach((s, i) => {
            if (!keep(s, i)) return;
            const d = defBySrc.get(s);
            if (d && (d.how === "colon" || d.how === "pattern")) points.push({ t: `${d.term} : ${d.def}`, term: d.term, k: "def" });
            else points.push({ t: lighten(s), k: findDate(s) ? "date" : "text" });
          });
        } else if (b.type === "list") points.push({ t: b.intro ? stripEnd(b.intro) + " :" : "", k: "list", sub: b.items });
        else if (b.type === "formula") points.push({ t: b.text, k: "formula", term: b.label || (b.intro ? formulaLabel(b.intro) : null) });
        else if (b.type === "code") points.push({ t: b.code, k: "code", term: b.intro ? stripEnd(b.intro) : null });
      }
      return { title: sec.title, points };
    })
    .filter((s) => s.points.length);

  // ----- Formules et syntaxes -----
  const syntaxes = [];
  for (const sec of st.sections)
    for (const b of sec.blocks) {
      if (b.type === "formula") syntaxes.push({ label: b.label || (b.intro ? formulaLabel(b.intro) : sec.title || "Formule"), code: b.text, note: "Formule" });
      if (b.type === "code") syntaxes.push({ label: b.intro ? stripEnd(b.intro) : sec.title || "Code", code: b.code, note: "Syntaxe / code" });
    }
  // Formules écrites dans une phrase (« … de la forme f(x) = ax + b, … »)
  for (const r of ranked) {
    const m = r.s.match(/(\b[a-zA-Z]\([a-z]\)\s*=\s*[^,;.]+|\b[A-Z][a-z]?\s*=\s*[A-Za-z0-9 ×*/+\-^²()]+)/);
    if (m && !syntaxes.some((x) => x.code.includes(m[1].trim()))) syntaxes.push({ label: st.sections[r.si].title || "Formule", code: m[1].trim(), note: r.s });
  }

  // ----- Cartes (flashcards) : uniquement des questions qui ont une vraie réponse -----
  const cards = [];
  const card = (front, back, kind, extra = {}) => cards.push({ id: id(), term: front, def: back, kind, ...extra });
  for (const d of defs) card(d.term, d.def, d.how === "formula" ? "formula" : "def");
  for (const sx of syntaxes.filter((x) => x.note === "Syntaxe / code" || (x.note === "Formule" && !defs.some((d) => d.def === x.code)))) {
    if (sx.note === "Formule") {
      if (/^(formule|définition|introduction)$/i.test(sx.label)) continue;
      card(`Formule : ${sx.label.charAt(0).toLowerCase() + sx.label.slice(1)}`, sx.code, "formula");
      continue;
    }
    const m = sx.label.match(/^(pour .{4,80}?),\s*(on .+)$/i);
    if (m) card(`${m[1]} ?`, `${cap(m[2])} :\n${sx.code}`, "code");
    else card(`${sx.label} ?`, sx.code, "code");
  }
  for (const sec of st.sections)
    for (const b of sec.blocks)
      if (b.type === "list" && b.intro && b.items.length >= 2) card(`${stripEnd(b.intro)} : … ?`, b.items.map((x) => "• " + x).join("\n"), "list");
  // Énumérations dans une phrase : « divisée en trois ordres : le clergé, la noblesse et le tiers état »
  for (const r of ranked) {
    const m = r.s.match(/^(.{10,120}?)\s*:\s+((?:[^,:]{2,40},\s+)+[^,:]{2,40}\s+(?:et|ou|and)\s+[^,:.]{2,40})\.?$/);
    if (m && !defBySrc.has(r.orig)) card(`${m[1]} : … ?`, m[2], "list");
  }
  // « Pour X, on écrit / utilise Y »
  for (const r of ranked) {
    const m = r.s.match(/^(pour .{6,80}?),\s*on (?:écrit|utilise|tape|fait|calcule|emploie)\s+(.{2,80}?)\.?$/i);
    if (m) card(`${m[1]} ?`, m[2], "code");
  }
  for (const d of uniqBy(dates, (x) => x.s).slice(0, 15)) {
    if (d.event.split(/\s+/).length < 3) continue;
    card(`Que se passe-t-il ${d.day ? "le " : "en "}${d.label} ?`, d.event + (d.context ? `\n\n(Juste avant : « ${d.context} »)` : ""), "date", { date: d.label });
  }
  // Phrases importantes sans carte : texte à trous sur une notion (jamais sur un mot vide).
  const covered = new Set(cards.flatMap((c) => [norm(c.def), norm(c.term)]));
  // Mots à cacher : notions définies, noms propres, puis noms précis (les plus rares d'abord),
  // sans jamais cacher le sujet général du cours.
  const topic = new Set(contentWords(st.title || title).map(stem));
  const nounsByRarity = [...lex.nouns.values()].filter((e) => e.word.length >= 5 && !topic.has(stem(e.word))).sort((a, b) => a.count - b.count || b.word.length - a.word.length).map((e) => e.word);
  const blankables = uniqBy([...defs.map((d) => d.term).filter((t) => t.length <= 30 && !contentWords(t).every((w) => topic.has(stem(w)))), ...properList, ...nounsByRarity], norm);
  let clozeCount = 0;
  for (const r of byScore) {
    if (clozeCount >= 10) break;
    if (defBySrc.has(r.orig) || findDate(r.s) || /\w\(/.test(r.s) || r.s.split(/\s+/).length < 6 || r.s.length > 220 || isFormulaLine(r.s) || !endsSentence(r.s)) continue;
    if ([...covered].some((c) => c.length > 20 && norm(r.s).includes(c))) continue;
    const target = blankables.find((b) => b.length >= 3 && (" " + r.s).match(new RegExp(`[\\s'’(]${escapeRe(b)}(?=$|[\\s,.;:)])`, "gi"))?.length === 1 && !new RegExp(`[\\s'’(]${escapeRe(b)}`, "i").test(r.s.replace(new RegExp(escapeRe(b), "i"), "")));
    if (!target) continue;
    const tre = new RegExp(`(^|[\\s'’(])(${escapeRe(target)})(?=$|[\\s,.;:)])`, "i");
    const answer = r.s.match(tre)?.[2] || target;
    const q = r.s.replace(tre, "$1_____");
    if (q === r.s) continue;
    card(q, `${answer}\n\n${r.s}`, "cloze", { answer, src: r.s });
    clozeCount++;
  }

  // ----- À retenir, résumé, dates -----
  const top = byScore.filter((r) => r.score > 0 && r.s.split(/\s+/).length >= 5 && endsSentence(r.s)).slice(0, Math.min(6, Math.max(3, Math.round(total / 6))));
  const inOrder = (arr) => arr.slice().sort((a, b) => a.si - b.si || a.i - b.i).map((r) => lighten(r.s));
  const retenir = inOrder(top);
  // Résumé en tête seulement pour les cours longs (sinon il répète la fiche).
  const summary = total > 30 ? inOrder(top.slice(0, 3)).join(" ") : "";
  const timeline = uniqBy(dates, (x) => x.s)
    .sort((a, b) => dateKey(a) - dateKey(b))
    .map((d) => `${d.label} — ${d.event}`)
    .slice(0, 15);

  const quiz = buildQuiz({ defs, cards, dates, ranked, byScore, lex, properList, nounList, st });
  const exam = buildExam({ defs, st, ranked, dates, cards });
  const podcast = buildPodcast(st.title || title, fiche, cards, retenir);
  const pack = {
    source: "local",
    version: PACK_VERSION,
    createdAt: Date.now(),
    title: st.title,
    summary,
    fiche,
    keywords: cards,
    notions,
    syntaxes: uniqBy(syntaxes, (x) => x.code),
    retenir,
    dates: timeline,
    quiz,
    exam,
    podcast,
  };
  pack.mnemonics = defs.length >= 3 ? [mnemonic({ pack })] : [];
  return pack;
}

// ---------- Quiz ----------

function numberVariants(n, raw) {
  const isInt = Number.isInteger(n);
  const out = new Set();
  const deltas = n >= 1000 ? [-10, -3, -1, 1, 4, 11, -25, 20] : n >= 100 ? [-20, -10, 10, 25, -5, 5] : [-2, -1, 1, 2, Math.round(n * 0.5) || 3, -Math.round(n * 0.3) || -3, n, 10];
  for (const d of shuffle(deltas)) {
    const v = isInt ? n + d : Math.round((n + d * 0.5) * 100) / 100;
    if (v > 0 && v !== n) out.add(String(v).replace(".", raw.includes(",") ? "," : "."));
    if (out.size >= 3) break;
  }
  return [...out];
}

// Paires de contraires pour fabriquer des affirmations fausses mais crédibles.
const ANTONYMS = [
  ["croissante", "décroissante"], ["croissant", "décroissant"], ["augmente", "diminue"], ["augmenter", "diminuer"], ["hausse", "baisse"],
  ["supérieur", "inférieur"], ["supérieure", "inférieure"], ["positif", "négatif"], ["positive", "négative"], ["avant", "après"],
  ["série", "dérivation"], ["unicellulaire", "pluricellulaire"], ["clair", "sombre"], ["claire", "sombre"], ["acide", "basique"],
  ["nord", "sud"], ["est", "ouest"], ["maximum", "minimum"], ["toujours", "jamais"], ["vrai", "faux"],
  ["animale", "végétale"], ["animal", "végétal"], ["interne", "externe"], ["entrée", "sortie"], ["absorbe", "libère"], ["absorbent", "libèrent"],
  ["proportionnelle", "inversement proportionnelle"], ["régulier", "irrégulier"], ["réguliers", "irréguliers"],
  ["monarchie", "république"], ["abolie", "rétablie"], ["majorité", "minorité"], ["chaud", "froid"], ["rapide", "lente"],
];

function falsify(s, ctx) {
  // 1. Contraire présent dans la phrase (« croissante » ↔ « décroissante »), accordé au bon genre.
  for (const [a, b] of shuffle(ANTONYMS)) {
    for (const [x] of [[a], [b]]) {
      const re = new RegExp(`(^|[\\s'’(])${escapeRe(x)}(?=$|[\\s,.;:)])`, "i");
      const m = s.match(re);
      if (!m || (x === "est" && !/\b(à l'est|l'est de|est de la)\b/i.test(s))) continue;
      const opposites = ANTONYMS.flatMap(([p, q]) => (p === x ? [q] : q === x ? [p] : []));
      const before = s.slice(0, m.index).split(/\s+/).slice(-4).join(" ").toLowerCase();
      const fem = /\b(la|une|cette)\b[^,]*$/.test(before);
      const y = opposites.find((o) => (fem ? /e$/.test(o) : !/e$/.test(o) || /(ble|ive|ique|ide|aire|re)$/.test(o))) || opposites[0];
      if (new RegExp(`[\\s'’(]${escapeRe(y)}(?=$|[\\s,.;:)])`, "i").test(s)) continue;
      return s.replace(re, `$1${y}`);
    }
  }
  // 2. Date ou nombre modifié.
  const d = findDate(s);
  if (d && d.end) return null;
  if (d) {
    const year = d.year + shuffle([-12, -5, -3, -2, 2, 3, 6, 11])[0];
    return s.replace(String(d.year), String(year));
  }
  const num = s.match(/(?<![\w.,])(\d+(?:[.,]\d+)?)(?![\w])/);
  if (num && !/\w\(/.test(s) && s.split(num[1]).length === 2) return s.replace(num[1], numberVariants(parseFloat(num[1].replace(",", ".")), num[1])[0]);
  // 3. Deux éléments d'une même liste échangés : « le noyau, qui délimite la cellule ».
  for (const sw of ctx.swaps) {
    const re = new RegExp(`(^|[\\s'’(])${escapeRe(sw[0])}(?=$|[\\s,.;:)])`, "i");
    if (re.test(s)) return s.replace(re, `$1${sw[1]}`);
  }
  return null;
}

function distractorsFor(target, sentence, ctx) {
  const before = sentence.slice(0, sentence.toLowerCase().indexOf(target.toLowerCase())).trim().split(/\s+/).pop()?.toLowerCase() || "";
  const g = GENDER[before] || (/[’']$/.test(before) ? "v" : null);
  const same = (w) => norm(w) !== norm(target) && !new RegExp(`[\\s'’(]${escapeRe(w)}[\\s,.;:)]`, "i").test(" " + sentence + " ");
  let pool;
  if (/^\d/.test(target)) return numberVariants(parseFloat(target.replace(",", ".")), target);
  const acronym = (w) => /^[A-Z0-9]{2,}$/.test(w);
  if (ctx.defs.some((d) => norm(d.term) === norm(target))) pool = ctx.defs.map((d) => d.term);
  else if (acronym(target)) pool = ctx.properList.filter(acronym);
  else if (ctx.properList.includes(target)) pool = ctx.properList.filter((p) => !acronym(p) && !norm(p).includes(norm(target)) && !norm(target).includes(norm(p)));
  else {
    pool = [...ctx.lex.nouns.values()]
      .filter((e) => e.word.length >= 4 && (!g || e.genders.has(g) || (g === "v" && /^[aeiouyhéèêàâîôû]/i.test(e.word))))
      .map((e) => e.word);
  }
  return shuffle(uniqBy(pool.filter(same), norm)).slice(0, 3);
}

function buildQuiz(ctx) {
  const { defs, cards, dates, byScore } = ctx;
  const quiz = [];
  const q = (o) => quiz.push({ id: id(), ...o });

  // Définitions : dans les deux sens, les mauvaises réponses sont d'autres définitions du cours.
  const realDefs = defs.filter((d) => d.how !== "formula");
  for (const d of realDefs) {
    const wrong = shuffle(realDefs.filter((x) => x !== d)).slice(0, 3);
    if (wrong.length >= 2) {
      const options = shuffle([d.def, ...wrong.map((x) => x.def)]);
      q({ type: "qcm", q: `Que signifie « ${d.term} » ?`, options, answer: options.indexOf(d.def), explain: `${d.term} : ${d.def}.` });
      const opts2 = shuffle([d.term, ...wrong.map((x) => x.term)]);
      q({ type: "qcm", q: `Quel terme correspond à cette définition : « ${d.def} » ?`, options: opts2, answer: opts2.indexOf(d.term), explain: `${d.term} : ${d.def}.` });
    }
  }
  // Formules
  const formulas = cards.filter((c) => c.kind === "formula");
  for (const f of formulas) {
    const wrong = shuffle(formulas.filter((x) => x !== f)).slice(0, 3);
    if (wrong.length >= 1) {
      const options = shuffle([f.def, ...wrong.map((x) => x.def)]);
      q({ type: "qcm", q: `${f.term.startsWith("Formule") ? f.term.replace(/^Formule : /, "Quelle est la formule : ") : `Quelle est la formule de « ${f.term} »`} ?`, options, answer: options.indexOf(f.def), explain: `${f.term.replace(/^Formule : /, "")} : ${f.def}` });
    }
  }
  // Dates : « À quelle date … ? »
  const uniqDates = uniqBy(dates, (d) => d.label);
  for (const d of uniqBy(dates, (x) => x.s).slice(0, 8)) {
    if (d.event.split(/\s+/).length < 3 || d.pronoun) continue;
    let others = uniqDates.filter((x) => x.label !== d.label && !!x.month === !!d.month).map((x) => x.label);
    if (others.length < 3) others = [...others, ...numberVariants(d.year, String(d.year)).map((y) => (d.month ? d.label.replace(String(d.year), y) : y))];
    const options = shuffle([d.label, ...shuffle(uniqBy(others, (x) => x)).slice(0, 3)]);
    q({ type: "qcm", q: `À quelle date ? « ${d.event} »`, options, answer: options.indexOf(d.label), explain: d.s });
  }
  // Listes : trouver l'intrus.
  const lists = cards.filter((c) => c.kind === "list");
  const allItems = lists.flatMap((l) => l.def.split(/\n|,\s+|\s+et\s+/).map((x) => x.replace(/^•\s*/, "").trim()));
  for (const l of lists) {
    const items = l.def.split(/\n|,\s+|\s+et\s+/).map((x) => x.replace(/^•\s*/, "").trim()).filter(Boolean);
    const intruders = allItems.filter((x) => !items.includes(x));
    const extra = intruders.length ? intruders : ctx.defs.map((d) => d.term).filter((t) => !items.some((i) => norm(i).includes(norm(t))));
    if (items.length >= 2 && extra.length) {
      const intrus = shuffle(extra)[0];
      const options = shuffle([...shuffle(items).slice(0, 3), intrus]);
      q({ type: "qcm", q: `Quel élément ne fait PAS partie de la réponse ? « ${l.term.replace(/ : … \?$/, "")} »`, options, answer: options.indexOf(intrus), explain: `${l.term.replace(/ : … \?$/, "")} : ${items.join(", ")}.` });
    }
  }
  // Textes à trous, avec des propositions de même nature que la bonne réponse.
  for (const c of cards.filter((x) => x.kind === "cloze")) {
    const others = distractorsFor(c.answer, c.src, ctx);
    if (others.length < 2) continue;
    const options = shuffle([c.answer, ...others]);
    q({ type: "trou", q: c.term, options, answer: options.indexOf(c.answer), explain: c.src });
  }
  // Vrai / faux : seulement des affirmations complètes, et des « faux » crédibles.
  const swaps = [];
  for (const l of ctx.st.sections.flatMap((s) => s.blocks).filter((b) => b.type === "list")) {
    const heads = l.items.map((it) => it.match(/^(.{2,40}?)(?:,\s+(?:qui|qu'|dont)|\s*:)/i)?.[1]).filter(Boolean);
    for (let i = 0; i + 1 < heads.length; i++) swaps.push([heads[i], heads[i + 1]], [heads[i + 1], heads[i]]);
  }
  // Un élément de liste « le noyau, qui contient l'ADN » devient « Le noyau contient l'ADN. »
  const statementize = (s) => {
    if (endsSentence(s)) return s;
    const m = s.match(/^(.{2,50}?),\s+qui\s+(.{4,})$/i);
    return m ? cap(`${m[1]} ${m[2]}`.replace(/[\s.;,]+$/, "")) + "." : null;
  };
  const statements = byScore
    .map((r) => ({ ...r, s: statementize(r.s) }))
    .filter((r) => r.s && r.s.split(/\s+/).length >= 4 && r.s.length <= 220 && !/:$/.test(r.s) && !/^(par exemple|exemple)/i.test(r.s) && !/^[^:]{2,50}\s:\s/.test(r.s))
    .slice(0, 14);
  statements.forEach((r, i) => {
    const f = i % 2 === 0 ? falsify(r.s, { swaps }) : null;
    if (f && f !== r.s) q({ type: "vf", q: cap(f), answer: false, explain: `Faux. Le cours dit : « ${r.s} »` });
    else q({ type: "vf", q: r.s, answer: true, explain: "Vrai : c'est ce que dit le cours." });
  });
  return shuffle(uniqBy(quiz, (x) => x.q));
}

// ---------- Examen blanc ----------

function keyWordsOf(text, max = 8) {
  return uniqBy(contentWords(text).filter((w) => w.length > 3 || /\d/.test(w)), norm).sort((a, b) => b.length - a.length).slice(0, max);
}

function buildExam({ defs, st, ranked, dates, cards }) {
  const exam = [];
  const e = (o) => exam.push({ id: id(), ...o });
  for (const d of shuffle(defs.filter((x) => x.how !== "formula" && keyWordsOf(x.def).length >= 2)).slice(0, 4)) e({ q: `Définis « ${d.term} ».`, expected: keyWordsOf(d.def), model: `${d.term} : ${d.def}.`, notion: d.term });
  for (const l of cards.filter((c) => c.kind === "list").slice(0, 2)) e({ q: `${l.term.replace(/ : … \?$/, "")} : cite-les.`, expected: keyWordsOf(l.def, 10), model: l.def, notion: l.term.replace(/ : … \?$/, "") });
  for (const f of cards.filter((c) => c.kind === "formula").slice(0, 2)) {
    const name = f.term.replace(/^Formule : /, "");
    const chem = /[→⇌]/.test(f.def);
    e({ q: chem ? `Écris l'équation : ${name}.` : `Donne la formule : ${name}. Précise ce que représente chaque lettre.`, expected: [...new Set(f.def.match(chem ? /[A-Z][A-Za-z0-9]*/g : /[A-Za-zΩ]+/g) || [])].slice(0, 6), model: f.def, notion: name });
  }
  for (const sec of st.sections.filter((s) => s.title && s.sentences.length >= 2).slice(0, 4)) {
    const best = ranked.filter((r) => st.sections[r.si] === sec).sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.i - b.i).map((r) => r.s);
    const generic = /^(définitions?|introduction|généralités|rappels?|conclusion|bilan|résumé|cours|notions?|vocabulaire)$/i.test(sec.title);
    e({ q: generic && st.title ? `${sec.title} : explique ce qu'il faut savoir sur « ${st.title} ».` : `Explique : « ${sec.title} ».`, expected: keyWordsOf(best.join(" "), 8), model: best.join(" "), notion: sec.title });
  }
  // Cours sans titres (paragraphes) : une question par paragraphe à partir de sa première phrase.
  if (!st.sections.some((s) => s.title) || st.sections.every((s) => /^\d|^\p{Lu}\p{Ll}+ (–|\d)/u.test(s.title))) {
    for (const sec of st.sections.filter((x) => x.sentences.length >= 3).slice(0, 4)) {
      const best = sec.sentences.slice(0, 3);
      const d = best.map(findDate).find(Boolean);
      const q = d ? `Que s'est-il passé ${d.month ? "le " : "en "}${d.label} ? Raconte les faits importants.` : `Résume ce que dit le cours à propos de : « ${keyWordsOf(best[0], 3).join(", ")} ».`;
      e({ q, expected: keyWordsOf(best.join(" "), 8), model: best.join(" "), notion: d ? d.label : keyWordsOf(best[0], 2).join(", ") });
    }
  }
  for (const r of ranked) {
    let m = r.s.match(/^(.{15,}?)\s*,?\s+(?:car|parce que|parce qu'|puisque|because)\s+(.{8,})$/i);
    if (m) {
      e({ q: `Pourquoi : « ${stripEnd(m[1])} » ? Justifie.`, expected: keyWordsOf(m[2]), model: r.s, notion: "Raisonnement" });
      break;
    }
    m = r.s.match(/^(.{15,}?)\s*,?\s+(?:donc|c'est pourquoi|par conséquent|so)\s+(.{8,})$/i);
    if (m) {
      e({ q: `Quelle est la conséquence de : « ${stripEnd(m[1])} » ?`, expected: keyWordsOf(m[2]), model: r.s, notion: "Raisonnement" });
      break;
    }
  }
  if (dates.length >= 3) {
    const sorted = uniqBy(dates, (x) => x.s).sort((a, b) => dateKey(a) - dateKey(b));
    e({ q: "Remets dans l'ordre chronologique les grands événements du cours, avec leurs dates.", expected: [...new Set(sorted.map((d) => String(d.year)))].slice(0, 8), model: sorted.map((d) => `${d.label} : ${d.event}`).join("\n"), notion: "Chronologie" });
  }
  return exam.slice(0, 9);
}

// ---------- Podcast ----------

const pointText = (p) => (typeof p === "string" ? p : [p.k === "formula" || p.k === "code" ? (p.term ? `${p.term} : ` : "") + p.t : p.t, ...(p.sub || []).map((x) => x + ".")].filter(Boolean).join(" "));

function buildPodcast(title, fiche, cards, retenir) {
  const parts = [`Bienvenue dans ce podcast de révision consacré à ${title}. Installe-toi, on reprend le cours dans l'ordre.`];
  fiche.forEach((s, i) => {
    parts.push(s.title ? `Partie ${i + 1} : ${s.title}.` : i === 0 ? "On commence." : "Ensuite.");
    parts.push(s.points.filter((p) => p.k !== "code").map(pointText).join(" "));
  });
  const defs = cards.filter((c) => c.kind === "def");
  if (defs.length) {
    parts.push("Révisons maintenant le vocabulaire. Essaie de donner la définition avant que je la dise.");
    for (const c of defs.slice(0, 10)) parts.push(`${c.term} ?… ${c.def}.`);
  }
  if (retenir.length) parts.push("Pour finir, ce qu'il faut absolument retenir. " + retenir.slice(0, 4).join(" "));
  parts.push("C'est terminé ! Lance maintenant un quiz pour vérifier que tout est acquis.");
  return parts.join("\n\n");
}

// ---------- Correction d'une réponse libre ----------
export function gradeOpen(answer, expected) {
  const got = new Set(contentWords(answer).map(stem));
  const digits = answer.match(/\d+/g) || [];
  const exp = uniqBy(expected, (w) => stem(w)).filter((w) => stem(w).length >= 3 || /\d/.test(w));
  if (!exp.length) return { ratio: answer.trim().length > 20 ? 1 : 0, missing: [] };
  const ok = (w) => (/^\d+$/.test(w) ? digits.includes(w) : [...got].some((g) => g.startsWith(stem(w).slice(0, 5)) || stem(w).startsWith(g.slice(0, 5))));
  const hits = exp.filter(ok);
  const missing = exp.filter((w) => !ok(w));
  const lengthPenalty = answer.trim().split(/\s+/).length < 3 ? 0.5 : 1;
  return { ratio: Math.min(1, (hits.length / exp.length) * 1.4 * lengthPenalty), missing: missing.slice(0, 6) };
}

// Compare une explication « façon Feynman » aux notions clés du cours.
export function feynmanCheck(explanation, pack) {
  const terms = pack.notions || pack.keywords.filter((k) => !k.kind || k.kind === "def").map((k) => k.term);
  const got = contentWords(explanation).map(stem);
  const covered = terms.filter((t) => contentWords(t).some((w) => got.some((g) => g.startsWith(stem(w).slice(0, 5)))));
  const missing = terms.filter((t) => !covered.includes(t));
  const wordsCount = explanation.trim().split(/\s+/).filter(Boolean).length;
  const avgLen = wordsCount ? explanation.replace(/\s+/g, "").length / wordsCount : 0;
  return { covered, missing, ratio: terms.length ? covered.length / terms.length : 0, simple: avgLen < 6.5 };
}

// ---------- Prof hors-ligne ----------
// Répond à une question de l'élève en cherchant les passages les plus proches dans le cours.

const QUESTION_RE = /\?\s*$|^(c'est quoi|qu'est[- ]ce|que |quel|quelle|quels|quelles|comment|pourquoi|quand|où|qui |combien|explique|définis|definis|donne|dis[- ]moi|peux[- ]tu|est[- ]ce|what|why|how|when|who)/i;
export const isQuestion = (s) => QUESTION_RE.test(norm(s).trim());

// Deux mots désignent-ils la même notion ? (pluriel, accord, dérivés proches)
function sameWord(a, b) {
  const x = norm(a).replace(/(es|s|x|e)$/, "");
  const y = norm(b).replace(/(es|s|x|e)$/, "");
  if (x === y) return true;
  const n = Math.min(x.length, y.length);
  if (n < 5) return false;
  const k = Math.max(5, n - 2);
  return x.slice(0, k) === y.slice(0, k);
}

const DEFINITIONAL = /(c'est quoi|c'?est quoi|qu'?est[- ]ce que|qu'?est[- ]ce qu|defini|que signifie|que veut dire|ca veut dire|c'?est qui|qui est|what is|meaning)/;
const IGNORE = /^(quand|lieu|quoi|expliqu|defini|signifi|veut|dire|pourquoi|comment|donne|cours|faut|quel|quelle|peux|est-ce|sais)/;

export function answerQuestion(question, course) {
  const pack = course.pack;
  const sections = parse(course.text);
  const nq = norm(question).replace(/\bc\s+est\b/g, "c'est");
  const qWords = qaWords(question).filter((w) => !IGNORE.test(norm(w)));
  if (!qWords.length) return null;
  const matches = (ws) => qWords.reduce((a, q) => a + (ws.some((w) => norm(w) === norm(q)) ? 1 : ws.some((w) => sameWord(q, w)) ? 0.8 : 0), 0);

  // 1. Terme défini dont tous les mots figurent dans la question : on donne sa définition.
  const card = pack.keywords
    .filter((k) => !k.kind || k.kind === "def" || k.kind === "formula")
    .map((k) => ({ k, words: contentWords(k.term) }))
    .filter((x) => x.words.length && x.words.every((w) => qWords.some((q) => sameWord(q, w))))
    .sort((a, b) => b.words.length - a.words.length)[0]?.k;
  const isDef = !!card;

  // 2. Passages du cours qui partagent le plus de mots avec la question.
  //    Une phrase qui commence par un pronom (« Elle produit… ») hérite du sujet de la précédente.
  const why = /pourquoi|comment|why|how/.test(nq);
  const scored = [];
  sections.forEach((sec) =>
    sec.sentences.forEach((s, i) => {
      const prev = i > 0 && /^(elle|il|ils|elles|cela|ceci|celle-ci|celui-ci|it|they|this)\b/i.test(s) ? sec.sentences[i - 1] : null;
      const hit = matches(qaWords(prev ? prev + " " + s : s));
      if (!hit) return;
      const score = hit / qWords.length + (why && /(car|parce|donc|permet|grâce|afin)/i.test(s) ? 0.3 : 0) - s.length / 2000;
      scored.push({ s: prev ? `${prev} ${s}` : s, sec: sec.title, score });
    })
  );
  scored.sort((a, b) => b.score - a.score);
  const passages = [];
  for (const x of scored) {
    if (passages.length >= 2 || x.score < 0.45) break;
    if (isDef && norm(x.s).includes(norm(card.def))) continue;
    if (passages.some((p) => p.s.includes(x.s) || x.s.includes(p.s))) continue;
    passages.push(x);
  }
  if (!card && !passages.length) return null;

  const def = isDef ? `« ${card.term} » : ${card.def.replace(/[.\s]+$/, "")}.` : null;
  const parts = [];
  if (def && (DEFINITIONAL.test(nq) || !passages.length)) {
    parts.push(def);
    if (passages.length) parts.push("Dans ton cours, on lit aussi :", ...passages.map((p) => "• " + p.s));
  } else {
    parts.push(passages[0].sec ? `D'après ton cours (partie « ${passages[0].sec} ») :` : "D'après ton cours :", ...passages.map((p) => "• " + p.s));
    if (def) parts.push("Rappel : " + def);
  }
  return { text: parts.join("\n"), term: card?.term || null };
}

// Version « plus simple » : phrases courtes d'une partie de la fiche, sans incises.
export function simplify(course) {
  const secs = course.pack.fiche.filter((s) => s.points.some((p) => typeof p === "string" || p.k === "text" || p.k === "def"));
  const sec = secs[Math.floor(Math.random() * secs.length)];
  if (!sec) return "Ton cours est déjà très court 🙂";
  const short = sec.points
    .filter((p) => typeof p === "string" || p.k === "text" || p.k === "def" || p.k === "date")
    .map((p) => pointText(p).replace(/\([^)]*\)/g, "").replace(/,[^,]{25,}?,/g, "").replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").trim());
  return `On reprend ${sec.title ? `« ${sec.title} »` : "cette partie"} en version simple :\n` + short.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

// Moyen mnémotechnique : acronyme formé des initiales des notions définies.
export function mnemonic(course) {
  const pack = course.pack;
  const source = pack.keywords.filter((k) => (!k.kind || k.kind === "def") && k.term.length <= 40).map((k) => k.term);
  const terms = uniqBy((source.length >= 2 ? source : pack.notions || []).filter((t) => /^\p{L}/u.test(t)), (t) => norm(t)).slice(0, 5);
  if (terms.length < 2) return "Astuce : relis la fiche à voix haute, puis récite-la sans regarder. Recommence demain : la répétition espacée fait le reste !";
  const initials = terms.map((t) => t[0].toUpperCase()).join("");
  return `Retiens le mot « ${initials} » :\n${terms.map((t) => `• ${t[0].toUpperCase()} comme ${t}`).join("\n")}\nInvente une phrase drôle avec ces initiales, elle restera gravée !`;
}
