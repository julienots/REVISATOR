// Persistance locale : tout est stocké dans localStorage sous une seule clé.
const KEY = "revisator.v1";

const defaults = () => ({
  courses: [],
  mistakes: [],
  sessions: [], // { date, courseId, mode, score, total }
  settings: {
    name: "",
    teacher: "bienveillant",
    modes: ["flashcards", "spaced", "quiz", "exam", "feynman", "pomodoro", "podcast"],
    apiKey: "",
    model: "claude-opus-5-5",
    ttsRate: 1,
    pomodoroWork: 25,
    pomodoroBreak: 5,
  },
  streak: { last: null, count: 0 },
});

let state;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
    state.settings = { ...defaults().settings, ...state.settings };
  } catch {
    state = defaults();
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Sauvegarde impossible", e);
  }
}

export const get = () => state;

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getCourse(id) {
  return state.courses.find((c) => c.id === id);
}

export function upsertCourse(course) {
  const i = state.courses.findIndex((c) => c.id === course.id);
  if (i >= 0) state.courses[i] = course;
  else state.courses.unshift(course);
  save();
}

export function deleteCourse(id) {
  state.courses = state.courses.filter((c) => c.id !== id);
  state.mistakes = state.mistakes.filter((m) => m.courseId !== id);
  state.sessions = state.sessions.filter((s) => s.courseId !== id);
  save();
}

// ---- Carnet d'erreurs ----
export function addMistake(m) {
  const existing = state.mistakes.find((x) => x.courseId === m.courseId && x.question === m.question);
  if (existing) {
    existing.count += 1;
    existing.streak = 0;
    existing.date = Date.now();
    existing.given = m.given;
  } else {
    state.mistakes.unshift({ id: uid(), count: 1, streak: 0, date: Date.now(), ...m });
  }
  save();
}

// Une erreur est considérée corrigée après 2 bonnes réponses d'affilée.
export function markMistakeRight(courseId, question) {
  const m = state.mistakes.find((x) => x.courseId === courseId && x.question === question);
  if (!m) return;
  m.streak += 1;
  if (m.streak >= 2) m.fixed = true;
  save();
}

// ---- Sessions et série de jours ----
export function logSession(s) {
  state.sessions.push({ date: Date.now(), ...s });
  const today = new Date().toDateString();
  if (state.streak.last !== today) {
    const yesterday = new Date(Date.now() - 864e5).toDateString();
    state.streak.count = state.streak.last === yesterday ? state.streak.count + 1 : 1;
    state.streak.last = today;
  }
  save();
}

// ---- Répétition espacée (système de Leitner, 5 boîtes) ----
const INTERVALS_DAYS = [0, 1, 3, 7, 16, 35];

export function reviewCard(card, ok) {
  card.box = ok ? Math.min((card.box || 0) + 1, 5) : 1;
  card.due = Date.now() + INTERVALS_DAYS[card.box] * 864e5;
  card.seen = (card.seen || 0) + 1;
  if (ok) card.right = (card.right || 0) + 1;
  save();
}

export function dueCards(course) {
  const now = Date.now();
  return (course.pack?.keywords || []).filter((k) => !k.due || k.due <= now);
}

// ---- Pourcentage d'acquisition ----
// Mélange de trois signaux : maîtrise des flashcards, réussite aux quiz, note à l'examen blanc.
export function mastery(course) {
  const kws = course.pack?.keywords || [];
  const cardScore = kws.length ? kws.reduce((a, k) => a + Math.min(k.box || 0, 5) / 5, 0) / kws.length : null;
  const sess = state.sessions.filter((s) => s.courseId === course.id && s.total > 0);
  const quiz = sess.filter((s) => s.mode !== "exam").slice(-5);
  const quizScore = quiz.length ? quiz.reduce((a, s) => a + s.score / s.total, 0) / quiz.length : null;
  const exam = sess.filter((s) => s.mode === "exam").slice(-1)[0];
  const examScore = exam ? exam.score / exam.total : null;
  const parts = [
    [cardScore, 0.35],
    [quizScore, 0.35],
    [examScore, 0.3],
  ].filter(([v]) => v !== null);
  if (!parts.length) return 0;
  const w = parts.reduce((a, [, wt]) => a + wt, 0);
  return Math.round((parts.reduce((a, [v, wt]) => a + v * wt, 0) / w) * 100);
}

// Efficacité moyenne de chaque mode d'apprentissage, pour recommander les plus fonctionnels.
export function modeStats() {
  const by = {};
  for (const s of state.sessions) {
    if (!s.total) continue;
    (by[s.mode] ||= { n: 0, sum: 0 });
    by[s.mode].n += 1;
    by[s.mode].sum += s.score / s.total;
  }
  return Object.entries(by)
    .map(([mode, { n, sum }]) => ({ mode, n, avg: sum / n }))
    .sort((a, b) => b.avg - a.avg);
}

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data.courses)) throw new Error("Fichier invalide");
  state = { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
  save();
}

export function resetAll() {
  state = defaults();
  save();
}
