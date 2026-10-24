import * as store from "./store.js";
import { generatePack, gradeOpen, feynmanCheck } from "./nlp.js";
import * as ai from "./ai.js";
import * as audio from "./audio.js";
import { TEACHERS, MODES } from "./teachers.js";

// Les dépendances lourdes (SDK Claude, pdf.js) sont chargées à la demande.
let vendorLoaded = null;
const loadVendor = () => (vendorLoaded ||= import("../vendor/vendor.js").catch((e) => console.warn("vendor", e)));

const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const S = () => store.get().settings;
const teacher = () => TEACHERS[S().teacher] || TEACHERS.aucun;
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const bridge = window.AndroidBridge;

function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

function modal(html) {
  $("#modal-card").innerHTML = html;
  $("#modal").hidden = false;
}
const closeModal = () => ($("#modal").hidden = true);

function ring(value, size = 74, label = "") {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${value} % acquis">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - value / 100)}"/>
    <text x="50%" y="${label ? "46%" : "54%"}" text-anchor="middle" class="ring-txt">${value}%</text>
    ${label ? `<text x="50%" y="66%" text-anchor="middle" class="ring-lbl">${label}</text>` : ""}
  </svg>`;
}

const bar = (v) => `<div class="bar"><div style="width:${v}%" class="${v >= 75 ? "good" : v >= 40 ? "mid" : "low"}"></div></div>`;

// ---------------- Routeur ----------------
const routes = {};
let cleanup = null;

function go(hash) {
  if (location.hash === "#" + hash) render();
  else location.hash = hash;
}

function render() {
  if (cleanup) cleanup();
  cleanup = null;
  $("#music-panel").hidden = true;
  closeModal();
  const [name, ...args] = (location.hash.slice(1) || "home").split("/");
  const fn = routes[name] || routes.home;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.route === name));
  $("#btn-back").hidden = ["home", "courses", "review", "mistakes", "settings"].includes(name);
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  fn(...args.map(decodeURIComponent));
}

function setTitle(t) {
  $("#page-title").textContent = t;
}

// ---------------- Accueil ----------------
routes.home = () => {
  setTitle("Revisator");
  const st = store.get();
  const courses = st.courses;
  const global = courses.length ? Math.round(courses.reduce((a, c) => a + store.mastery(c), 0) / courses.length) : 0;
  const due = courses.reduce((a, c) => a + store.dueCards(c).length, 0);
  const open = st.mistakes.filter((m) => !m.fixed).length;
  const best = store.modeStats().slice(0, 3);
  const t = teacher();
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Salut" : "Bonsoir";
  view.innerHTML = `
    <section class="hero card">
      <div>
        <p class="muted">${hello}${S().name ? " " + esc(S().name) : ""} 👋</p>
        <h2>Prêt à réviser ?</h2>
        <p class="muted">🔥 Série : <b>${st.streak.count}</b> jour${st.streak.count > 1 ? "s" : ""}</p>
      </div>
      ${ring(global, 92, "acquis")}
    </section>

    ${t.method ? `<section class="card teacher-tip"><span class="big">${t.emoji}</span><div><b>${esc(t.name)}</b><p>${esc(teacherAdvice(due, open, best))}</p></div></section>` : ""}

    <section class="grid2">
      <button class="tile" data-go="review"><span>🃏</span><b>${due}</b> carte${due > 1 ? "s" : ""} à revoir</button>
      <button class="tile" data-go="mistakes"><span>❌</span><b>${open}</b> erreur${open > 1 ? "s" : ""} à corriger</button>
    </section>

    ${
      best.length
        ? `<section class="card"><h3>Tes modes les plus efficaces</h3>${best
            .map((b) => `<div class="row"><span>${MODES[b.mode]?.emoji || "•"} ${esc(MODES[b.mode]?.name || b.mode)}</span><span class="muted">${Math.round(b.avg * 100)} % · ${b.n} séance${b.n > 1 ? "s" : ""}</span></div>`)
            .join("")}</section>`
        : ""
    }

    <section class="card">
      <div class="row"><h3>Mes cours</h3><button class="btn small" data-go="new">+ Nouveau</button></div>
      ${courses.length ? courses.slice(0, 5).map(courseRow).join("") : emptyCourses()}
    </section>`;
};

function teacherAdvice(due, open, best) {
  if (open > 5) return `Tu as ${open} erreurs en attente. Commence par les corriger : c'est là que tu progresses le plus.`;
  if (due > 0) return `${due} cartes sont prêtes pour la répétition espacée. 10 minutes suffisent !`;
  if (best[0]) return `D'après tes résultats, « ${MODES[best[0].mode]?.name} » marche le mieux pour toi. Continue avec ce mode.`;
  return "Ajoute un cours (texte, PDF, photo ou dictée) et je te prépare fiche, quiz et examen blanc.";
}

const emptyCourses = () => `<div class="empty"><p>Aucun cours pour l'instant.</p><button class="btn" data-go="new">Ajouter mon premier cours</button><button class="btn ghost" data-action="sample">Essayer avec un exemple</button></div>`;

function courseRow(c) {
  const m = store.mastery(c);
  return `<button class="course-row" data-go="course/${c.id}">
    <div class="course-ico">${esc(c.emoji || "📘")}</div>
    <div class="grow"><b>${esc(c.title)}</b><span class="muted">${esc(c.subject || "")}${c.pack?.source === "ai" ? " · ✨ IA" : ""}</span>${bar(m)}</div>
    <span class="pct">${m}%</span>
  </button>`;
}

// ---------------- Liste des cours ----------------
routes.courses = () => {
  setTitle("Mes cours");
  const cs = store.get().courses;
  view.innerHTML = `<button class="btn block" data-go="new">+ Ajouter un cours</button>
    <div class="card list">${cs.length ? cs.map(courseRow).join("") : emptyCourses()}</div>`;
};

// ---------------- Création / édition ----------------
const SUBJECT_EMOJI = { maths: "📐", math: "📐", physique: "⚛️", chimie: "🧪", svt: "🧬", bio: "🧬", histoire: "🏛️", géo: "🌍", geo: "🌍", français: "📚", anglais: "🇬🇧", espagnol: "🇪🇸", info: "💻", nsi: "💻", philo: "🤔", éco: "📈", eco: "📈", musique: "🎵", sport: "🏃" };
const emojiFor = (s) => Object.entries(SUBJECT_EMOJI).find(([k]) => (s || "").toLowerCase().includes(k))?.[1] || "📘";

routes.new = () => editCourse(null);
routes.edit = (id) => editCourse(store.getCourse(id));

function editCourse(c) {
  setTitle(c ? "Modifier le cours" : "Nouveau cours");
  loadVendor();
  view.innerHTML = `
    <form id="course-form" class="card form">
      <label>Titre<input name="title" required value="${esc(c?.title)}" placeholder="Ex : La photosynthèse"></label>
      <label>Matière<input name="subject" value="${esc(c?.subject)}" placeholder="Ex : SVT"></label>

      <div class="sources">
        <p class="muted">Ajoute ton cours depuis :</p>
        <div class="chips">
          <label class="chip">📄 Fichier / PDF<input type="file" id="file-in" accept=".txt,.md,.pdf,.csv,.html,.htm,text/*,application/pdf" hidden></label>
          <label class="chip">📷 Photo<input type="file" id="photo-in" accept="image/*" capture="environment" hidden></label>
          <button type="button" class="chip" data-action="dictate">🎤 Dictée</button>
          <button type="button" class="chip" data-action="toggle-video">🎬 Vidéo / audio</button>
        </div>
        <div id="video-box" class="card inset" ${c?.videoUrl ? "" : "hidden"}>
          <label>Lien de la vidéo ou du podcast<input name="videoUrl" value="${esc(c?.videoUrl)}" placeholder="https://youtube.com/…"></label>
          <p class="muted small">Astuce : sur YouTube, ouvre la description → « Afficher la transcription », copie-la et colle-la ci-dessous. Tu peux aussi utiliser 🎤 Dictée pendant que tu écoutes.</p>
          <button type="button" class="btn small ghost" data-action="open-video">Ouvrir le lien</button>
        </div>
      </div>

      <label>Contenu du cours<textarea name="text" rows="12" required placeholder="Colle ici ton cours, tes notes ou la transcription…">${esc(c?.text)}</textarea></label>
      <p class="muted small" id="char-count"></p>

      <fieldset class="gen-choice">
        <legend>Génération</legend>
        <label class="radio"><input type="radio" name="engine" value="local" ${ai.hasAI() || S().apiKey ? "" : "checked"}> ⚡ Rapide (hors-ligne)</label>
        <label class="radio"><input type="radio" name="engine" value="ai" ${S().apiKey ? "checked" : ""} ${S().apiKey ? "" : "disabled"}> ✨ IA Claude ${S().apiKey ? "" : "(ajoute ta clé dans Profil)"}</label>
      </fieldset>

      <button class="btn block" type="submit">${c ? "Enregistrer et régénérer" : "Créer mes fiches"}</button>
      ${c ? `<button type="button" class="btn block danger ghost" data-action="delete-course" data-id="${c.id}">Supprimer ce cours</button>` : `<button type="button" class="btn block ghost" data-action="sample">Charger un cours d'exemple</button>`}
    </form>`;

  const form = $("#course-form");
  const ta = form.text;
  const count = () => ($("#char-count").textContent = `${ta.value.length.toLocaleString("fr")} caractères`);
  ta.addEventListener("input", count);
  count();

  $("#file-in").addEventListener("change", (e) => importFile(e.target.files[0], ta, form).then(count));
  $("#photo-in").addEventListener("change", (e) => importFile(e.target.files[0], ta, form).then(count));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const course = c ? { ...c } : { id: store.uid(), createdAt: Date.now() };
    course.title = f.get("title").trim();
    course.subject = f.get("subject").trim();
    course.text = f.get("text");
    course.videoUrl = f.get("videoUrl") || "";
    course.emoji = emojiFor(course.subject + " " + course.title);
    await buildPack(course, f.get("engine") === "ai");
    store.upsertCourse(course);
    go(`course/${course.id}`);
  });
}

async function buildPack(course, useAI) {
  const old = course.pack;
  let pack;
  if (useAI) {
    modal(`<div class="loading"><div class="spinner"></div><p>${teacher().emoji} Claude prépare ta fiche, tes quiz et ton examen blanc…</p><p class="muted small">Cela peut prendre une minute.</p></div>`);
    try {
      await loadVendor();
      pack = await ai.generatePackAI(course.title, course.text);
    } catch (e) {
      toast("IA indisponible : " + e.message + " → génération locale.", 4500);
    }
    closeModal();
  }
  pack ||= generatePack(course.text, course.title);
  // On conserve la progression des flashcards quand un mot-clé existe déjà.
  if (old?.keywords) {
    const prev = new Map(old.keywords.map((k) => [k.term.toLowerCase(), k]));
    pack.keywords = pack.keywords.map((k) => {
      const p = prev.get(k.term.toLowerCase());
      return p ? { ...k, box: p.box, due: p.due, seen: p.seen, right: p.right } : k;
    });
  }
  course.pack = pack;
}

async function importFile(file, ta, form) {
  if (!file) return;
  const append = (txt) => {
    ta.value = (ta.value ? ta.value + "\n\n" : "") + txt.trim();
    if (!form.title.value) form.title.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  };
  try {
    if (file.type.startsWith("image/")) {
      await loadVendor();
      if (!ai.hasAI()) return toast("La lecture de photos nécessite le mode IA (clé dans Profil). Tu peux aussi dicter le cours 🎤.", 5000);
      modal(`<div class="loading"><div class="spinner"></div><p>Lecture de la photo…</p></div>`);
      const b64 = await toBase64(file);
      append(await ai.extractFromFile(b64, file.type === "image/jpg" ? "image/jpeg" : file.type));
      closeModal();
      return toast("Texte extrait de la photo ✔");
    }
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      modal(`<div class="loading"><div class="spinner"></div><p>Lecture du PDF…</p></div>`);
      await loadVendor();
      let text = await pdfText(await file.arrayBuffer());
      if (text.replace(/\s/g, "").length < 80 && ai.hasAI()) text = await ai.extractFromFile(await toBase64(file), "application/pdf");
      closeModal();
      if (text.replace(/\s/g, "").length < 20) return toast("Ce PDF semble scanné : active le mode IA pour le lire.", 5000);
      append(text);
      return toast("PDF importé ✔");
    }
    let txt = await file.text();
    if (/html?$/.test(file.name)) txt = new DOMParser().parseFromString(txt, "text/html").body.innerText;
    append(txt);
    toast("Fichier importé ✔");
  } catch (e) {
    closeModal();
    toast("Import impossible : " + e.message, 5000);
  }
}

const toBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

async function pdfText(buf) {
  const pdf = await globalThis.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let lastY = null;
    let line = "";
    const lines = [];
    for (const it of content.items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        lines.push(line);
        line = "";
      }
      line += it.str;
      lastY = y;
    }
    lines.push(line);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n\n");
}

// ---------------- Détail d'un cours ----------------
const TABS = [
  ["fiche", "📋 Fiche"],
  ["apprendre", "🎯 S'entraîner"],
  ["mots", "🔑 Mots-clés"],
  ["syntaxes", "🧮 Syntaxes"],
  ["texte", "📄 Cours"],
];

routes.course = (id, tab = "fiche") => {
  const c = store.getCourse(id);
  if (!c) return go("courses");
  setTitle(c.title);
  const p = c.pack;
  const m = store.mastery(c);
  view.innerHTML = `
    <section class="card course-head">
      <div class="grow"><div class="course-ico big">${esc(c.emoji)}</div><h2>${esc(c.title)}</h2><p class="muted">${esc(c.subject)} · ${p.keywords.length} mots-clés · ${p.quiz.length} questions${p.source === "ai" ? " · ✨ IA" : ""}</p></div>
      ${ring(m, 80, "acquis")}
    </section>
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" class="${tab === k ? "on" : ""}" data-go="course/${id}/${k}">${l}</button>`).join("")}</div>
    <div id="tab-body"></div>`;
  const body = $("#tab-body");
  body.innerHTML = courseTab(c, tab);
};

function courseTab(c, tab) {
  const p = c.pack;
  const id = c.id;
  if (tab === "fiche")
    return `<article class="card fiche">
      ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ""}
      ${p.fiche.map((s) => `<h3>${esc(s.title)}</h3><ul>${s.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("")}
      ${p.keywords.length ? `<h3>🔑 Définitions</h3><dl>${p.keywords.slice(0, 12).map((k) => `<dt>${esc(k.term)}</dt><dd>${esc(k.def)}</dd>`).join("")}</dl>` : ""}
      ${p.syntaxes.length ? `<h3>🧮 Formules & syntaxes</h3>${p.syntaxes.map((s) => `<pre>${esc(s.code)}</pre>`).join("")}` : ""}
      ${p.dates?.length ? `<h3>📅 Dates & chiffres</h3><ul>${p.dates.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${p.retenir?.length ? `<div class="retenir"><h3>⭐ À retenir absolument</h3><ul>${p.retenir.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${p.mnemonics?.length ? `<h3>💡 Moyens mnémotechniques</h3><ul>${p.mnemonics.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    </article>
    <div class="actions">
      <button class="btn" data-go="podcast/${id}">🎧 Écouter en podcast</button>
      <button class="btn ghost" data-action="share-fiche" data-id="${id}">📤 Partager la fiche</button>
    </div>`;
  if (tab === "mots")
    return `<div class="card">${p.keywords.length ? p.keywords.map((k) => `<div class="kw"><div class="row"><b>${esc(k.term)}</b><span class="box-badge" title="Boîte de Leitner">${"●".repeat(k.box || 0)}${"○".repeat(5 - (k.box || 0))}</span></div><p>${esc(k.def)}</p></div>`).join("") : `<p class="muted">Aucun mot-clé détecté. Astuce : écris tes définitions sous la forme « Mot : définition ».</p>`}</div>
      <button class="btn block" data-go="flash/${id}">🃏 Réviser en flashcards</button>`;
  if (tab === "syntaxes")
    return `<div class="card">${p.syntaxes.length ? p.syntaxes.map((s) => `<div class="syn"><b>${esc(s.label)}</b>${s.note ? `<span class="muted small"> · ${esc(s.note)}</span>` : ""}<pre>${esc(s.code)}</pre></div>`).join("") : `<p class="muted">Aucune formule ni syntaxe détectée dans ce cours.</p>`}</div>`;
  if (tab === "texte")
    return `<div class="card"><pre class="raw">${esc(c.text)}</pre></div>
      ${c.videoUrl ? `<button class="btn block ghost" data-action="open-url" data-url="${esc(c.videoUrl)}">🎬 Ouvrir la vidéo</button>` : ""}
      <button class="btn block ghost" data-go="edit/${id}">✏️ Modifier / régénérer</button>`;
  // S'entraîner
  const enabled = S().modes;
  const due = store.dueCards(c).length;
  const items = [
    ["flashcards", `flash/${id}`, `${p.keywords.length} cartes`],
    ["spaced", `flash/${id}/due`, `${due} à revoir aujourd'hui`],
    ["quiz", `quiz/${id}`, `${p.quiz.length} questions`],
    ["exam", `exam/${id}`, `${p.exam.length} questions · noté /20`],
    ["feynman", `feynman/${id}`, "Explique avec tes mots"],
    ["podcast", `podcast/${id}`, "Écoute la fiche"],
    ["pomodoro", `pomodoro/${id}`, `${S().pomodoroWork} min de focus`],
  ];
  return `<div class="modes">${items
    .map(([k, route, sub]) => `<button class="mode ${enabled.includes(k) ? "" : "dim"}" data-go="${route}"><span>${MODES[k].emoji}</span><b>${MODES[k].name}</b><small>${sub}</small></button>`)
    .join("")}
    <button class="mode" data-go="chat/${id}"><span>${teacher().emoji}</span><b>Demander au prof</b><small>${ai.hasAI() || S().apiKey ? "Pose tes questions" : "Questions du prof"}</small></button>
  </div>`;
}

// ---------------- Flashcards / répétition espacée ----------------
routes.flash = (id, which) => {
  const c = store.getCourse(id);
  if (!c) return go("courses");
  const cards = which === "due" ? shuffle(store.dueCards(c)) : shuffle(c.pack.keywords);
  setTitle(which === "due" ? "Répétition espacée" : "Flashcards");
  if (!cards.length) {
    view.innerHTML = `<div class="card empty"><p>🎉 Aucune carte à revoir aujourd'hui !</p><button class="btn" data-go="flash/${id}">Réviser toutes les cartes quand même</button></div>`;
    return;
  }
  let i = 0;
  let ok = 0;
  const show = () => {
    if (i >= cards.length) {
      store.logSession({ courseId: id, mode: which === "due" ? "spaced" : "flashcards", score: ok, total: cards.length });
      return endScreen(id, ok, cards.length, [], which === "due" ? "spaced" : "flashcards");
    }
    const k = cards[i];
    view.innerHTML = `<div class="progress-top">${bar(pct(i, cards.length))}<span class="muted">${i + 1}/${cards.length}</span></div>
      <button class="flashcard" id="fc" aria-label="Retourner la carte">
        <div class="face front"><small class="muted">Te souviens-tu de…</small><h2>${esc(k.term)}</h2><small class="muted">Touche pour retourner</small></div>
        <div class="face back"><small class="muted">${esc(k.term)}</small><p>${esc(k.def)}</p></div>
      </button>
      <div class="actions two" id="fc-act" hidden>
        <button class="btn bad" data-r="0">😕 À revoir</button>
        <button class="btn good" data-r="1">😎 Je savais</button>
      </div>
      <button class="btn ghost block" data-action="speak" data-text="${esc(k.term + ". " + k.def)}">🔊 Écouter</button>`;
    $("#fc").onclick = () => {
      $("#fc").classList.add("flipped");
      $("#fc-act").hidden = false;
    };
    $("#fc-act").onclick = (e) => {
      const r = e.target.closest("[data-r]");
      if (!r) return;
      const good = r.dataset.r === "1";
      store.reviewCard(k, good);
      if (good) ok++;
      else store.addMistake({ courseId: id, question: `Que signifie « ${k.term} » ?`, correct: k.def, given: "(oublié)", explain: k.def, qref: { type: "open", q: `Que signifie « ${k.term} » ?`, expected: k.def.split(/\s+/).filter((w) => w.length > 4).slice(0, 6), model: k.def } });
      i++;
      show();
    };
  };
  show();
};

// ---------------- Quiz (et rejeu des erreurs) ----------------
routes.quiz = (id) => {
  const c = store.getCourse(id);
  if (!c) return go("courses");
  setTitle("Quiz");
  runQuiz(shuffle(c.pack.quiz).slice(0, 12).map((q) => ({ ...q, courseId: id })), "quiz", id);
};

function runQuiz(questions, mode, courseId) {
  if (!questions.length) {
    view.innerHTML = `<div class="card empty"><p>Pas encore de questions ici.</p></div>`;
    return;
  }
  let i = 0;
  let score = 0;
  const wrong = [];
  const t = teacher();

  const next = () => {
    if (i >= questions.length) {
      store.logSession({ courseId, mode, score, total: questions.length });
      return endScreen(courseId, score, questions.length, wrong, mode);
    }
    const q = questions[i];
    const head = `<div class="progress-top">${bar(pct(i, questions.length))}<span class="muted">${i + 1}/${questions.length}</span></div>`;
    const label = { qcm: "QCM", vf: "Vrai ou faux ?", trou: "Complète la phrase", open: "Réponds avec tes mots" }[q.type] || "Question";
    let answers = "";
    if (q.type === "vf") answers = `<div class="answers two"><button class="ans" data-a="true">✔ Vrai</button><button class="ans" data-a="false">✘ Faux</button></div>`;
    else if (q.type === "open") answers = `<textarea id="open-ans" rows="4" placeholder="Ta réponse…"></textarea><div class="actions two"><button class="btn ghost" data-action="dictate-into" data-target="open-ans">🎤</button><button class="btn" id="open-ok">Valider</button></div>`;
    else answers = `<div class="answers">${q.options.map((o, k) => `<button class="ans" data-a="${k}">${esc(o)}</button>`).join("")}</div>`;
    view.innerHTML = `${head}<div class="card question"><small class="tag">${label}</small><h3>${esc(q.q)}</h3>${answers}<div id="fb"></div></div>`;

    const finish = (good, given, correctText) => {
      if (good) {
        score++;
        store.markMistakeRight(q.courseId, q.q);
      } else {
        wrong.push(q);
        store.addMistake({ courseId: q.courseId, question: q.q, correct: correctText, given, explain: q.explain || q.model || "", qref: q });
      }
      if (navigator.vibrate) navigator.vibrate(good ? 30 : [60, 40, 60]);
      $("#fb").innerHTML = `<div class="feedback ${good ? "ok" : "ko"}"><p><b>${t.emoji} ${esc(good ? t.right() : t.wrong())}</b></p>
        ${good ? "" : `<p>Bonne réponse : <b>${esc(correctText)}</b></p>`}
        ${q.explain ? `<p class="muted">${esc(q.explain)}</p>` : ""}</div>
        <button class="btn block" id="nextq">${i + 1 < questions.length ? "Question suivante →" : "Voir mon résultat"}</button>`;
      $("#nextq").onclick = () => (i++, next());
      $("#nextq").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    if (q.type === "open") {
      $("#open-ok").onclick = () => {
        const val = $("#open-ans").value;
        const g = gradeOpen(val, q.expected || []);
        $("#open-ok").disabled = true;
        finish(g.ratio >= 0.5, val, q.model);
      };
      return;
    }
    view.querySelectorAll(".ans").forEach((b) =>
      b.addEventListener("click", () => {
        view.querySelectorAll(".ans").forEach((x) => (x.disabled = true));
        const a = b.dataset.a;
        let good, correctText, given;
        if (q.type === "vf") {
          good = String(q.answer) === a;
          correctText = q.answer ? "Vrai" : "Faux";
          given = a === "true" ? "Vrai" : "Faux";
          view.querySelector(`.ans[data-a="${q.answer}"]`).classList.add("right");
        } else {
          good = Number(a) === Number(q.answer);
          correctText = q.options[q.answer];
          given = q.options[a];
          view.querySelectorAll(".ans")[q.answer].classList.add("right");
        }
        if (!good) b.classList.add("wrong");
        finish(good, given, correctText);
      })
    );
  };
  next();
}

function endScreen(courseId, score, total, wrong, mode) {
  const p = pct(score, total);
  const t = teacher();
  if (p >= 80 && window.confetti !== false) burst();
  const c = store.getCourse(courseId);
  view.innerHTML = `<section class="card center">
      ${ring(p, 120, "réussite")}
      <h2>${score} / ${total}</h2>
      <p class="teacher-say">${t.emoji} ${esc(t.end(p))}</p>
      ${c ? `<p class="muted">Maîtrise du cours : <b>${store.mastery(c)} %</b></p>` : ""}
    </section>
    ${
      wrong.length
        ? `<section class="card"><h3>À retravailler</h3><ul class="wrong-list">${wrong.map((q) => `<li>${esc(q.q)}<br><small class="muted">→ ${esc(q.explain || q.model || "")}</small></li>`).join("")}</ul><p class="muted small">Ces erreurs sont dans ton carnet ❌ : elles disparaîtront après 2 bonnes réponses d'affilée.</p></section>`
        : ""
    }
    <div class="actions">
      ${courseId ? `<button class="btn" data-action="restart" data-mode="${mode}" data-id="${courseId}">↻ Recommencer</button><button class="btn ghost" data-go="course/${courseId}/apprendre">Autres modes</button>` : `<button class="btn" data-go="mistakes">Retour au carnet</button>`}
    </div>`;
}

function burst() {
  const box = document.createElement("div");
  box.className = "confetti";
  for (let i = 0; i < 40; i++) {
    const s = document.createElement("i");
    s.style.left = Math.random() * 100 + "%";
    s.style.background = `hsl(${Math.random() * 360} 80% 60%)`;
    s.style.animationDelay = Math.random() * 0.5 + "s";
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2500);
}

// ---------------- Examen blanc ----------------
routes.exam = (id) => {
  const c = store.getCourse(id);
  if (!c) return go("courses");
  setTitle("Examen blanc");
  const qs = c.pack.exam;
  const qcm = shuffle(c.pack.quiz.filter((q) => q.type !== "vf")).slice(0, 4);
  const start = Date.now();
  view.innerHTML = `<section class="card exam-head"><h2>📝 Examen blanc</h2><p class="muted">${qs.length} questions ouvertes + ${qcm.length} QCM. Réponds comme au vrai contrôle, sans regarder le cours. ${teacher().emoji} ${esc(teacher().name)} corrige.</p><p class="timer" id="exam-timer">00:00</p></section>
    <form id="exam-form">
      ${qs.map((q, k) => `<div class="card"><small class="tag">Question ${k + 1} · ${esc(q.notion || "")}</small><h3>${esc(q.q)}</h3><textarea name="o${k}" rows="4" placeholder="Ta réponse…"></textarea><button type="button" class="btn small ghost" data-action="dictate-into" data-target-name="o${k}">🎤 Dicter</button></div>`).join("")}
      ${qcm.map((q, k) => `<div class="card"><small class="tag">QCM ${k + 1}</small><h3>${esc(q.q)}</h3>${q.options.map((o, j) => `<label class="radio opt"><input type="radio" name="m${k}" value="${j}"> ${esc(o)}</label>`).join("")}</div>`).join("")}
      <button class="btn block" type="submit">Rendre ma copie</button>
    </form>`;
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - start) / 1000);
    const el = $("#exam-timer");
    if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, 1000);
  cleanup = () => clearInterval(timer);

  $("#exam-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearInterval(timer);
    const f = new FormData(e.target);
    const open = qs.map((q, k) => ({ ...q, answer: (f.get("o" + k) || "").trim() }));
    const mcq = qcm.map((q, k) => ({ q, given: f.get("m" + k) }));
    let results;
    let bilan = null;
    await loadVendor();
    if (ai.hasAI()) {
      modal(`<div class="loading"><div class="spinner"></div><p>${teacher().emoji} Correction de ta copie…</p></div>`);
      try {
        bilan = await ai.gradeExamAI(c, open);
        results = open.map((q, k) => ({ ratio: Math.max(0, Math.min(1, Number(bilan.results?.[k]?.score) || 0)), missing: bilan.results?.[k]?.missing || [], feedback: bilan.results?.[k]?.feedback }));
      } catch (err) {
        toast("Correction IA impossible (" + err.message + "), correction locale.", 4000);
      }
      closeModal();
    }
    results ||= open.map((q) => gradeOpen(q.answer, q.expected || []));

    let points = results.reduce((a, r) => a + r.ratio, 0);
    const mcqOk = mcq.filter((m) => Number(m.given) === Number(m.q.answer)).length;
    points += mcqOk;
    const total = open.length + mcq.length;
    const note = total ? Math.round((points / total) * 200) / 10 : 0;

    const notUnderstood = new Set(bilan?.notUnderstood || []);
    open.forEach((q, k) => {
      if (results[k].ratio < 0.5) {
        notUnderstood.add(q.notion || q.q);
        store.addMistake({ courseId: id, question: q.q, correct: q.model, given: q.answer || "(pas de réponse)", explain: q.model, qref: { type: "open", q: q.q, expected: q.expected, model: q.model } });
      }
    });
    mcq.forEach((m) => {
      if (Number(m.given) !== Number(m.q.answer)) {
        store.addMistake({ courseId: id, question: m.q.q, correct: m.q.options[m.q.answer], given: m.q.options[m.given] ?? "(pas de réponse)", explain: m.q.explain, qref: m.q });
      }
    });
    store.logSession({ courseId: id, mode: "exam", score: points, total });
    const t = teacher();
    if (note >= 16) burst();
    view.innerHTML = `<section class="card center"><p class="muted">Ta note</p><p class="note">${String(note).replace(".", ",")}<small>/20</small></p>
        <p class="teacher-say">${t.emoji} ${esc(bilan?.global || t.end(Math.round(note * 5)))}</p></section>
      ${notUnderstood.size ? `<section class="card warn"><h3>🤔 Ce que tu n'as pas (encore) compris</h3><ul>${[...notUnderstood].map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>` : `<section class="card ok"><h3>✅ Tout semble compris !</h3></section>`}
      ${bilan?.advice?.length ? `<section class="card"><h3>💡 Conseils</h3><ul>${bilan.advice.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></section>` : ""}
      <section class="card"><h3>Correction détaillée</h3>
        ${open
          .map(
            (q, k) => `<div class="corr"><div class="row"><b>${esc(q.q)}</b><span class="score ${results[k].ratio >= 0.5 ? "good" : "bad"}">${Math.round(results[k].ratio * 100)}%</span></div>
          <p class="muted small">Ta réponse : ${esc(q.answer || "—")}</p>
          ${results[k].feedback ? `<p>${esc(results[k].feedback)}</p>` : ""}
          ${results[k].missing?.length ? `<p class="small">Il manquait : <b>${results[k].missing.map(esc).join(", ")}</b></p>` : ""}
          <details><summary>Réponse modèle</summary><p>${esc(q.model)}</p></details></div>`
          )
          .join("")}
        ${mcq.map((m) => `<div class="corr"><div class="row"><b>${esc(m.q.q)}</b><span class="score ${Number(m.given) === Number(m.q.answer) ? "good" : "bad"}">${Number(m.given) === Number(m.q.answer) ? "✔" : "✘"}</span></div><p class="small">Réponse : ${esc(m.q.options[m.q.answer])}</p></div>`).join("")}
      </section>
      <div class="actions"><button class="btn" data-go="mistakes">Retravailler mes erreurs</button><button class="btn ghost" data-go="course/${id}/fiche">Relire la fiche</button></div>`;
    window.scrollTo(0, 0);
  });
};

// ---------------- Technique Feynman ----------------
routes.feynman = (id) => {
  const c = store.getCourse(id);
  if (!c) return go("courses");
  setTitle("Technique Feynman");
  view.innerHTML = `<section class="card"><h3>🧠 Explique « ${esc(c.title)} » comme à un ami de 10 ans</h3>
      <p class="muted">Sans regarder le cours. Utilise des mots simples et des exemples. L'app repère ensuite les notions que tu as oubliées.</p>
      <textarea id="fey" rows="10" placeholder="En fait, c'est comme…"></textarea>
      <div class="actions two"><button class="btn ghost" data-action="dictate-into" data-target="fey">🎤 Dicter</button><button class="btn" id="fey-ok">Analyser</button></div></section><div id="fey-res"></div>`;
  $("#fey-ok").onclick = async () => {
    const txt = $("#fey").value.trim();
    if (txt.split(/\s+/).length < 10) return toast("Écris au moins quelques phrases 🙂");
    await loadVendor();
    let res;
    if (ai.hasAI()) {
      modal(`<div class="loading"><div class="spinner"></div><p>Analyse de ton explication…</p></div>`);
      try {
        const r = await ai.feynmanAI(c, txt);
        res = { ratio: Number(r.score) || 0, covered: r.good || [], missing: r.gaps || [], tip: r.simpler };
      } catch (e) {
        toast(e.message);
      }
      closeModal();
    }
    if (!res) {
      const r = feynmanCheck(txt, c.pack);
      res = { ...r, tip: r.simple ? "Bonne simplicité de vocabulaire 👍" : "Tes phrases utilisent beaucoup de mots longs : essaie de simplifier, avec une analogie du quotidien." };
    }
    const p = Math.round(res.ratio * 100);
    store.logSession({ courseId: id, mode: "feynman", score: res.ratio, total: 1 });
    $("#fey-res").innerHTML = `<section class="card center">${ring(p, 100, "couvert")}</section>
      ${res.covered.length ? `<section class="card ok"><h3>✅ Bien expliqué</h3><p>${res.covered.map(esc).join(" · ")}</p></section>` : ""}
      ${res.missing.length ? `<section class="card warn"><h3>🕳️ Oublié ou flou</h3><ul>${res.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul><p class="muted small">Relis ces points dans la fiche puis recommence l'explication.</p></section>` : ""}
      ${res.tip ? `<section class="card"><p>💡 ${esc(res.tip)}</p></section>` : ""}`;
    $("#fey-res").scrollIntoView({ behavior: "smooth" });
  };
};

// ---------------- Podcast ----------------
routes.podcast = (id) => {
  const c = store.getCourse(id);
  if (!c) return go("courses");
  setTitle("Podcast");
  const t = teacher();
  const intro = S().teacher !== "aucun" ? `Bonjour, ici ${t.name}. ` : "";
  const script = intro + c.pack.podcast;
  const paras = script.split(/\n\n+/);
  let playing = false;
  view.innerHTML = `<section class="card podcast">
      <div class="cover">${esc(c.emoji)}<span>🎧</span></div>
      <h2>${esc(c.title)}</h2><p class="muted">Podcast de révision · ${Math.max(1, Math.round(script.split(/\s+/).length / 150))} min</p>
      <div class="actions"><button class="btn big" id="pod-play">▶ Écouter</button></div>
      <label class="inline">Vitesse <input type="range" id="pod-rate" min="0.6" max="1.6" step="0.1" value="${S().ttsRate}"><span id="pod-rate-v">${S().ttsRate}×</span></label>
      <label class="inline"><input type="checkbox" id="pod-music"> Musique douce en fond</label>
    </section>
    <section class="card script">${paras.map((p, k) => `<p data-k="${k}">${esc(p)}</p>`).join("")}</section>`;
  const btn = $("#pod-play");
  const rate = $("#pod-rate");
  rate.oninput = () => {
    $("#pod-rate-v").textContent = rate.value + "×";
    S().ttsRate = Number(rate.value);
    store.save();
  };
  let k = 0;
  const playFrom = () => {
    if (k >= paras.length) {
      playing = false;
      btn.textContent = "▶ Réécouter";
      k = 0;
      store.logSession({ courseId: id, mode: "podcast", score: 0, total: 0 });
      return;
    }
    view.querySelectorAll(".script p").forEach((p) => p.classList.toggle("reading", Number(p.dataset.k) === k));
    view.querySelector(`.script p[data-k="${k}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const ok = audio.speak(paras[k], Number(rate.value), () => {
      k++;
      if (playing) playFrom();
    });
    if (!ok) toast("La synthèse vocale n'est pas disponible sur cet appareil.");
  };
  btn.onclick = () => {
    playing = !playing;
    btn.textContent = playing ? "⏸ Pause" : "▶ Reprendre";
    if (playing) {
      if ($("#pod-music").checked && !audio.playingTrack()) {
        audio.playTrack("piano");
        audio.setVolume(0.15);
      }
      playFrom();
    } else audio.stopSpeaking();
  };
  cleanup = () => {
    playing = false;
    audio.stopSpeaking();
  };
};

// ---------------- Prof (chat IA ou questions locales) ----------------
routes.chat = (id) => {
  const c = store.getCourse(id);
  if (!c) return go("courses");
  const t = teacher();
  setTitle(t.name);
  c.chat ||= [];
  const aiOn = !!S().apiKey;
  const renderMsgs = () =>
    c.chat.map((m) => `<div class="msg ${m.role}">${m.role === "assistant" ? `<span class="who">${t.emoji}</span>` : ""}<div>${esc(m.content).replace(/\n/g, "<br>")}</div></div>`).join("") ||
    `<div class="msg assistant"><span class="who">${t.emoji}</span><div>${aiOn ? `Bonjour ! Je suis ${esc(t.name)}. Pose-moi une question sur « ${esc(c.title)} », ou demande-moi de t'interroger.` : `Je vais te poser des questions sur le cours, comme à l'oral. (Pour discuter librement avec moi, ajoute une clé IA dans Profil.)`}</div></div>`;
  view.innerHTML = `<div class="chat" id="chat">${renderMsgs()}</div>
    <form class="chat-in" id="chat-form"><button type="button" class="icon-btn" data-action="dictate-into" data-target="chat-txt">🎤</button><input id="chat-txt" autocomplete="off" placeholder="${aiOn ? "Ta question…" : "Ta réponse…"}"><button class="btn small">Envoyer</button></form>
    <div class="chips center">${aiOn ? `<button class="chip" data-say="Interroge-moi sur ce cours, une question à la fois.">Interroge-moi</button><button class="chip" data-say="Explique-moi plus simplement la notion la plus difficile.">Explique plus simplement</button><button class="chip" data-say="Donne-moi un moyen mnémotechnique pour retenir l'essentiel.">Astuce mémo</button>` : `<button class="chip" data-action="chat-reset">Nouvelle série</button>`}</div>`;
  const box = $("#chat");
  box.scrollTop = box.scrollHeight;

  let pending = null; // question locale en attente
  const askLocal = () => {
    const q = shuffle(c.pack.exam)[0] || shuffle(c.pack.quiz)[0];
    if (!q) return;
    pending = q;
    c.chat.push({ role: "assistant", content: q.q });
    store.save();
  };
  if (!aiOn && !c.chat.length) askLocal();

  const send = async (text) => {
    if (!text.trim()) return;
    c.chat.push({ role: "user", content: text });
    if (aiOn) {
      box.innerHTML = renderMsgs() + `<div class="msg assistant"><span class="who">${t.emoji}</span><div class="typing"><i></i><i></i><i></i></div></div>`;
      box.scrollTop = box.scrollHeight;
      await loadVendor();
      try {
        const reply = await ai.askTeacher(c, c.chat.slice(-20));
        c.chat.push({ role: "assistant", content: reply });
      } catch (e) {
        c.chat.push({ role: "assistant", content: "⚠️ " + e.message });
      }
    } else if (pending) {
      const g = pending.expected ? gradeOpen(text, pending.expected) : { ratio: 0, missing: [] };
      const good = g.ratio >= 0.5;
      c.chat.push({ role: "assistant", content: `${good ? t.right() : t.wrong()}\n${g.missing.length && !good ? "Il manquait : " + g.missing.join(", ") + "\n" : ""}Réponse attendue : ${pending.model || pending.explain || ""}` });
      if (!good) store.addMistake({ courseId: id, question: pending.q, correct: pending.model || "", given: text, explain: pending.model || "", qref: { type: "open", q: pending.q, expected: pending.expected || [], model: pending.model } });
      askLocal();
    }
    store.save();
    box.innerHTML = renderMsgs();
    box.scrollTop = box.scrollHeight;
  };
  $("#chat-form").onsubmit = (e) => {
    e.preventDefault();
    const v = $("#chat-txt").value;
    $("#chat-txt").value = "";
    send(v);
  };
  view.querySelectorAll("[data-say]").forEach((b) => (b.onclick = () => send(b.dataset.say)));
  const reset = view.querySelector('[data-action="chat-reset"]');
  if (reset)
    reset.onclick = () => {
      c.chat = [];
      store.save();
      routes.chat(id);
    };
};

// ---------------- Pomodoro ----------------
routes.pomodoro = (id) => {
  setTitle("Pomodoro");
  const c = id ? store.getCourse(id) : null;
  let phase = "work";
  let left = S().pomodoroWork * 60;
  let running = false;
  let cycles = 0;
  let iv = null;
  const draw = () => {
    const total = (phase === "work" ? S().pomodoroWork : S().pomodoroBreak) * 60;
    const mm = String(Math.floor(left / 60)).padStart(2, "0");
    const ss = String(left % 60).padStart(2, "0");
    const r = 110;
    const circ = 2 * Math.PI * r;
    $("#pomo").innerHTML = `<svg viewBox="0 0 260 260" class="pomo-ring"><circle cx="130" cy="130" r="${r}" class="ring-bg"/><circle cx="130" cy="130" r="${r}" class="ring-fg ${phase}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - left / total)}"/></svg>
      <div class="pomo-txt"><small>${phase === "work" ? "🍅 Concentration" : "☕ Pause"}</small><b>${mm}:${ss}</b><small>${cycles} pomodoro${cycles > 1 ? "s" : ""}</small></div>`;
  };
  view.innerHTML = `<section class="card center">${c ? `<p class="muted">${esc(c.emoji)} ${esc(c.title)}</p>` : ""}<div id="pomo" class="pomo"></div>
      <div class="actions"><button class="btn big" id="pomo-go">▶ Démarrer</button><button class="btn ghost" id="pomo-reset">↺</button></div>
      <label class="inline"><input type="checkbox" id="pomo-music" checked> Lancer une musique de concentration</label>
      <p class="muted small">${S().pomodoroWork} min de travail / ${S().pomodoroBreak} min de pause. Pose ton téléphone, ne fais qu'une chose à la fois.</p></section>
      ${c ? `<button class="btn block ghost" data-go="course/${id}/fiche">📋 Ouvrir la fiche</button>` : ""}`;
  draw();
  const tick = () => {
    left--;
    if (left <= 0) {
      if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
      beep();
      if (phase === "work") {
        cycles++;
        store.logSession({ courseId: id || null, mode: "pomodoro", score: 0, total: 0 });
        phase = "break";
        left = S().pomodoroBreak * 60;
        toast("☕ Pause bien méritée !");
      } else {
        phase = "work";
        left = S().pomodoroWork * 60;
        toast("🍅 C'est reparti !");
      }
    }
    draw();
  };
  $("#pomo-go").onclick = () => {
    running = !running;
    $("#pomo-go").textContent = running ? "⏸ Pause" : "▶ Reprendre";
    if (running) {
      iv = setInterval(tick, 1000);
      bridge?.keepScreenOn?.(true);
      if ($("#pomo-music").checked && !audio.playingTrack()) audio.playTrack("lofi");
    } else {
      clearInterval(iv);
      bridge?.keepScreenOn?.(false);
    }
  };
  $("#pomo-reset").onclick = () => {
    clearInterval(iv);
    running = false;
    phase = "work";
    left = S().pomodoroWork * 60;
    $("#pomo-go").textContent = "▶ Démarrer";
    draw();
  };
  cleanup = () => {
    clearInterval(iv);
    bridge?.keepScreenOn?.(false);
  };
};

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((d) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, a.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d + 0.2);
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + d);
      o.stop(a.currentTime + d + 0.22);
    });
  } catch {}
}

// ---------------- Réviser (choix du mode) ----------------
routes.review = () => {
  setTitle("Réviser");
  const cs = store.get().courses;
  const enabled = S().modes;
  const stats = Object.fromEntries(store.modeStats().map((s) => [s.mode, s]));
  const recommended = teacher().method;
  view.innerHTML = `
    <section class="card"><h3>Choisis ton mode</h3><p class="muted small">Active ou désactive les modes dans Profil. Les pourcentages montrent ton efficacité dans chaque mode.</p></section>
    <div class="modes">
      ${Object.entries(MODES)
        .filter(([k]) => enabled.includes(k) || k === "mistakes")
        .map(([k, m]) => `<button class="mode ${k === recommended ? "reco" : ""}" data-action="pick-mode" data-mode="${k}"><span>${m.emoji}</span><b>${m.name}</b><small>${stats[k] ? Math.round(stats[k].avg * 100) + " % de réussite" : esc(m.desc)}</small>${k === recommended ? `<em>Conseillé par ${esc(teacher().name)}</em>` : ""}</button>`)
        .join("")}
      ${cs.length > 1 ? `<button class="mode" data-action="mix"><span>🔀</span><b>Révision mélangée</b><small>Questions de tous tes cours (entrelacement)</small></button>` : ""}
    </div>`;
};

const MODE_ROUTE = { flashcards: "flash/%", spaced: "flash/%/due", quiz: "quiz/%", exam: "exam/%", feynman: "feynman/%", podcast: "podcast/%", pomodoro: "pomodoro/%" };

function pickMode(mode) {
  if (mode === "mistakes") return go("mistakes");
  const cs = store.get().courses;
  if (!cs.length) return go("new");
  if (cs.length === 1) return go(MODE_ROUTE[mode].replace("%", cs[0].id));
  modal(`<h3>${MODES[mode].emoji} ${MODES[mode].name}</h3><p class="muted">Sur quel cours ?</p><div class="list">${cs.map((c) => `<button class="course-row" data-pick="${c.id}"><div class="course-ico">${esc(c.emoji)}</div><div class="grow"><b>${esc(c.title)}</b>${bar(store.mastery(c))}</div></button>`).join("")}</div><button class="btn ghost block" data-action="close-modal">Annuler</button>`);
  $("#modal-card").onclick = (e) => {
    const b = e.target.closest("[data-pick]");
    if (b) {
      closeModal();
      go(MODE_ROUTE[mode].replace("%", b.dataset.pick));
    }
  };
}

routes.mix = () => {
  setTitle("Révision mélangée");
  const qs = shuffle(store.get().courses.flatMap((c) => c.pack.quiz.map((q) => ({ ...q, courseId: c.id })))).slice(0, 15);
  runQuiz(qs, "quiz", null);
};

// ---------------- Carnet d'erreurs ----------------
routes.mistakes = () => {
  setTitle("Carnet d'erreurs");
  const all = store.get().mistakes;
  const open = all.filter((m) => !m.fixed);
  const fixed = all.filter((m) => m.fixed);
  const byCourse = (m) => store.getCourse(m.courseId);
  view.innerHTML = `
    <section class="card"><p>Chaque erreur est une leçon 💡. Rejoue-les jusqu'à les réussir <b>2 fois de suite</b> : elles passent alors dans « Corrigées ».</p>
      ${open.length ? `<button class="btn block" data-go="replay">🔁 Rejouer mes ${open.length} erreur${open.length > 1 ? "s" : ""}</button>` : `<p class="ok-text">✅ Aucune erreur en attente, bravo !</p>`}</section>
    ${open
      .map((m) => {
        const c = byCourse(m);
        return `<article class="card mistake"><div class="row"><small class="tag">${esc(c?.emoji || "")} ${esc(c?.title || "Cours supprimé")}</small><small class="muted">×${m.count}</small></div>
          <h4>${esc(m.question)}</h4>
          <p class="bad-text">✘ Ta réponse : ${esc(m.given)}</p>
          <p class="ok-text">✔ ${esc(m.correct)}</p>
          ${m.explain && m.explain !== m.correct ? `<p class="muted small">${esc(m.explain)}</p>` : ""}
          <div class="dots">${"●".repeat(m.streak)}${"○".repeat(2 - Math.min(2, m.streak))} <small class="muted">bonnes réponses d'affilée</small></div></article>`;
      })
      .join("")}
    ${fixed.length ? `<details class="card"><summary>Corrigées (${fixed.length})</summary>${fixed.map((m) => `<p class="small">✅ ${esc(m.question)}</p>`).join("")}<button class="btn small ghost" data-action="clear-fixed">Vider</button></details>` : ""}`;
};

routes.replay = () => {
  setTitle("Rejouer mes erreurs");
  const qs = shuffle(store.get().mistakes.filter((m) => !m.fixed && m.qref)).slice(0, 15).map((m) => ({ ...m.qref, courseId: m.courseId }));
  runQuiz(qs, "mistakes", null);
};

// ---------------- Profil / réglages ----------------
routes.settings = () => {
  setTitle("Profil");
  const s = S();
  const st = store.get();
  const totalSessions = st.sessions.length;
  view.innerHTML = `
    <section class="card"><h3>👤 Moi</h3><label>Prénom<input id="set-name" value="${esc(s.name)}" placeholder="Ton prénom"></label>
      <p class="muted small">${st.courses.length} cours · ${totalSessions} séances · série de ${st.streak.count} jour(s)</p></section>

    <section class="card"><h3>🧑‍🏫 Mon prof</h3><p class="muted small">Choisis la personnalité qui te correspond — ou pas de prof du tout.</p>
      <div class="teachers">${Object.entries(TEACHERS)
        .map(([k, t]) => `<label class="teacher ${s.teacher === k ? "on" : ""}"><input type="radio" name="teacher" value="${k}" ${s.teacher === k ? "checked" : ""} hidden><span class="big">${t.emoji}</span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></label>`)
        .join("")}</div></section>

    <section class="card"><h3>🎯 Mes modes d'apprentissage</h3>
      ${Object.entries(MODES)
        .filter(([k]) => k !== "mistakes")
        .map(([k, m]) => `<label class="switch"><input type="checkbox" name="mode" value="${k}" ${s.modes.includes(k) ? "checked" : ""}><span>${m.emoji} <b>${m.name}</b><br><small class="muted">${esc(m.desc)}</small></span></label>`)
        .join("")}</section>

    <section class="card"><h3>✨ Intelligence artificielle (optionnel)</h3>
      <p class="muted small">Sans clé, Revisator fonctionne entièrement hors-ligne. Avec une clé API Anthropic (console.anthropic.com), Claude génère des fiches et quiz plus riches, lit les photos et PDF scannés, corrige tes examens et répond à tes questions. La clé reste sur ton téléphone.</p>
      <label>Clé API<input id="set-key" type="password" value="${esc(s.apiKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
      <label>Modèle<select id="set-model">
        <option value="claude-opus-5-5" ${s.model === "claude-opus-5-5" ? "selected" : ""}>Claude Opus 5.5 (meilleure qualité)</option>
        <option value="claude-sonnet-5-5" ${s.model === "claude-sonnet-5-5" ? "selected" : ""}>Claude Sonnet 5.5 (équilibré)</option>
        <option value="claude-haiku-5-5" ${s.model === "claude-haiku-5-5" ? "selected" : ""}>Claude Haiku 5.5 (rapide et économique)</option>
      </select></label></section>

    <section class="card"><h3>⏱️ Pomodoro & audio</h3>
      <div class="grid2"><label>Travail (min)<input id="set-work" type="number" min="5" max="90" value="${s.pomodoroWork}"></label><label>Pause (min)<input id="set-break" type="number" min="1" max="30" value="${s.pomodoroBreak}"></label></div>
      <label>Vitesse de lecture<input id="set-rate" type="range" min="0.6" max="1.6" step="0.1" value="${s.ttsRate}"></label></section>

    <section class="card"><h3>💾 Mes données</h3>
      <div class="actions"><button class="btn ghost" data-action="export">📤 Exporter</button><label class="btn ghost">📥 Importer<input type="file" id="import-in" accept=".json,application/json" hidden></label></div>
      <button class="btn danger ghost block" data-action="reset">Tout effacer</button></section>
    <p class="muted small center">Revisator 1.0 · fait pour réviser mieux, pas plus.</p>`;

  const saveS = () => store.save();
  $("#set-name").onchange = (e) => ((s.name = e.target.value.trim()), saveS());
  $("#set-key").onchange = (e) => ((s.apiKey = e.target.value.trim()), saveS(), toast(s.apiKey ? "Clé enregistrée ✨" : "Mode hors-ligne"));
  $("#set-model").onchange = (e) => ((s.model = e.target.value), saveS());
  $("#set-work").onchange = (e) => ((s.pomodoroWork = Math.max(5, Number(e.target.value) || 25)), saveS());
  $("#set-break").onchange = (e) => ((s.pomodoroBreak = Math.max(1, Number(e.target.value) || 5)), saveS());
  $("#set-rate").onchange = (e) => ((s.ttsRate = Number(e.target.value)), saveS());
  view.querySelectorAll('input[name="teacher"]').forEach((r) =>
    r.addEventListener("change", () => {
      s.teacher = r.value;
      saveS();
      view.querySelectorAll(".teacher").forEach((l) => l.classList.toggle("on", l.contains(r)));
      toast(`${TEACHERS[r.value].emoji} ${TEACHERS[r.value].name} sera ton prof`);
    })
  );
  view.querySelectorAll('input[name="mode"]').forEach((cb) =>
    cb.addEventListener("change", () => {
      s.modes = [...view.querySelectorAll('input[name="mode"]:checked')].map((x) => x.value);
      saveS();
    })
  );
  $("#import-in").onchange = async (e) => {
    try {
      store.importJSON(await e.target.files[0].text());
      toast("Données importées ✔");
      render();
    } catch (err) {
      toast("Import impossible : " + err.message);
    }
  };
};

// ---------------- Musique ----------------
function musicPanel() {
  const panel = $("#music-panel");
  const playing = audio.playingTrack();
  panel.innerHTML = `<div class="row"><h3>🎵 Musique pour réviser</h3><button class="icon-btn" data-action="close-music">✕</button></div>
    <p class="muted small">Sons générés par l'app, sans Internet. Les ondes alpha s'écoutent au casque.</p>
    <div class="tracks">${Object.entries(audio.TRACKS).map(([k, t]) => `<button class="track ${playing === k ? "on" : ""}" data-track="${k}"><span>${t.emoji}</span>${esc(t.name)}</button>`).join("")}</div>
    <label class="inline">🔈<input type="range" id="vol" min="0" max="1" step="0.05" value="${audio.getVolume()}">🔊</label>
    ${playing ? `<button class="btn block ghost" data-action="stop-music">⏹ Arrêter</button>` : ""}`;
  panel.hidden = false;
  $("#vol").oninput = (e) => audio.setVolume(Number(e.target.value));
}

// ---------------- Actions globales ----------------
const SAMPLE = {
  title: "La photosynthèse",
  subject: "SVT",
  url: "samples/photosynthese.txt",
};

async function loadSample() {
  const text = await (await fetch(SAMPLE.url)).text();
  const course = { id: store.uid(), createdAt: Date.now(), title: SAMPLE.title, subject: SAMPLE.subject, text, emoji: emojiFor(SAMPLE.subject) };
  await buildPack(course, false);
  store.upsertCourse(course);
  go(`course/${course.id}`);
}

function ficheText(c) {
  const p = c.pack;
  return [
    `📋 ${c.title}${c.subject ? " (" + c.subject + ")" : ""}`,
    p.summary,
    ...p.fiche.map((s) => `\n■ ${s.title}\n${s.points.map((x) => "• " + x).join("\n")}`),
    p.keywords.length ? "\n🔑 Définitions\n" + p.keywords.map((k) => `• ${k.term} : ${k.def}`).join("\n") : "",
    p.syntaxes.length ? "\n🧮 Formules\n" + p.syntaxes.map((s) => s.code).join("\n") : "",
    p.retenir?.length ? "\n⭐ À retenir\n" + p.retenir.map((x) => "• " + x).join("\n") : "",
    "\n— Généré avec Revisator",
  ]
    .filter(Boolean)
    .join("\n");
}

function share(title, text) {
  if (bridge?.share) return bridge.share(title, text);
  if (navigator.share) return navigator.share({ title, text }).catch(() => {});
  navigator.clipboard?.writeText(text).then(() => toast("Copié dans le presse-papiers"));
}

function dictateInto(el) {
  if (!el) return;
  const ok = audio.dictate((txt) => {
    if (!txt) return toast("Je n'ai rien entendu 🤔");
    el.value = (el.value ? el.value + " " : "") + txt;
    el.dispatchEvent(new Event("input"));
  });
  if (!ok) toast("La dictée vocale n'est pas disponible sur cet appareil.");
  else toast("🎤 Parle maintenant…");
}

document.addEventListener("click", async (e) => {
  const g = e.target.closest("[data-go]");
  if (g) {
    e.preventDefault();
    return go(g.dataset.go);
  }
  const tab = e.target.closest(".tab");
  if (tab) return go(tab.dataset.route);
  const tr = e.target.closest("[data-track]");
  if (tr) {
    if (audio.playingTrack() === tr.dataset.track) audio.stopMusic();
    else audio.playTrack(tr.dataset.track);
    $("#btn-music").classList.toggle("on", !!audio.playingTrack());
    return musicPanel();
  }
  const a = e.target.closest("[data-action]");
  if (!a) {
    if (e.target.id === "modal") closeModal();
    return;
  }
  const act = a.dataset.action;
  if (act === "sample") return loadSample();
  if (act === "close-modal") return closeModal();
  if (act === "close-music") return ($("#music-panel").hidden = true);
  if (act === "stop-music") {
    audio.stopMusic();
    $("#btn-music").classList.remove("on");
    return musicPanel();
  }
  if (act === "pick-mode") return pickMode(a.dataset.mode);
  if (act === "mix") return go("mix");
  if (act === "toggle-video") return ($("#video-box").hidden = !$("#video-box").hidden);
  if (act === "open-video") return openUrl(document.querySelector('[name="videoUrl"]').value);
  if (act === "open-url") return openUrl(a.dataset.url);
  if (act === "dictate") return dictateInto(document.querySelector('textarea[name="text"]'));
  if (act === "dictate-into") return dictateInto(a.dataset.target ? document.getElementById(a.dataset.target) : document.querySelector(`[name="${a.dataset.targetName}"]`));
  if (act === "speak") return audio.speak(a.dataset.text, S().ttsRate);
  if (act === "share-fiche") {
    const c = store.getCourse(a.dataset.id);
    return share(c.title, ficheText(c));
  }
  if (act === "restart") {
    const r = { quiz: "quiz/%", exam: "exam/%", flashcards: "flash/%", spaced: "flash/%/due" }[a.dataset.mode] || "quiz/%";
    return go(r.replace("%", a.dataset.id));
  }
  if (act === "delete-course") {
    modal(`<h3>Supprimer ce cours ?</h3><p class="muted">Ses fiches, sa progression et ses erreurs seront effacées.</p><div class="actions two"><button class="btn ghost" data-action="close-modal">Annuler</button><button class="btn danger" data-action="confirm-delete" data-id="${a.dataset.id}">Supprimer</button></div>`);
    return;
  }
  if (act === "confirm-delete") {
    store.deleteCourse(a.dataset.id);
    closeModal();
    return go("courses");
  }
  if (act === "clear-fixed") {
    store.get().mistakes = store.get().mistakes.filter((m) => !m.fixed);
    store.save();
    return render();
  }
  if (act === "export") return share("Sauvegarde Revisator", store.exportJSON());
  if (act === "reset") {
    modal(`<h3>Tout effacer ?</h3><p class="muted">Cours, progression, erreurs et réglages seront supprimés définitivement.</p><div class="actions two"><button class="btn ghost" data-action="close-modal">Annuler</button><button class="btn danger" data-action="confirm-reset">Effacer</button></div>`);
    return;
  }
  if (act === "confirm-reset") {
    store.resetAll();
    closeModal();
    return go("home");
  }
});

function openUrl(url) {
  if (!url) return toast("Ajoute d'abord un lien");
  if (bridge?.openUrl) bridge.openUrl(url);
  else window.open(url, "_blank");
}

$("#btn-back").onclick = () => history.back();
$("#btn-music").onclick = () => ($("#music-panel").hidden ? musicPanel() : ($("#music-panel").hidden = true));

// Bouton retour Android : renvoie true si l'app a géré le retour.
window.appBack = () => {
  if (!$("#modal").hidden) return closeModal(), true;
  if (!$("#music-panel").hidden) return ($("#music-panel").hidden = true), true;
  const name = (location.hash.slice(1) || "home").split("/")[0];
  if (name === "home") return false;
  if (["courses", "review", "mistakes", "settings"].includes(name)) return go("home"), true;
  history.back();
  return true;
};

// Texte partagé depuis une autre application Android → nouveau cours pré-rempli.
window.onSharedText = (text) => {
  go("new");
  setTimeout(() => {
    const ta = document.querySelector('textarea[name="text"]');
    if (ta) {
      ta.value = text;
      ta.dispatchEvent(new Event("input"));
    }
  }, 50);
};

store.load();
window.addEventListener("hashchange", render);
render();
