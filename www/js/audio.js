// Audio : musiques de concentration générées en temps réel (Web Audio, hors-ligne)
// et synthèse vocale pour le mode podcast (moteur Android natif si disponible).

let ctx = null;
let master = null;
let current = null; // { id, stop() }

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function noiseBuffer(type) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else if (type === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else d[i] = w;
    }
  }
  return buf;
}

function loopNoise(type, gain, filterFreq) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(type);
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = gain;
  let node = src;
  if (filterFreq) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    src.connect(f);
    node = f;
  }
  node.connect(g).connect(master);
  src.start();
  return () => src.stop();
}

function tone(freq, start, dur, vol, type = "sine", dest = master) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + Math.min(0.8, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function echo() {
  const d = ctx.createDelay();
  d.delayTime.value = 0.38;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const input = ctx.createGain();
  input.connect(master);
  input.connect(d);
  d.connect(fb).connect(d);
  d.connect(wet).connect(master);
  return input;
}

// Planifie des notes en boucle ; renvoie une fonction d'arrêt.
function scheduler(step, intervalMs) {
  let alive = true;
  let t = ctx.currentTime + 0.1;
  const tick = () => {
    if (!alive) return;
    while (t < ctx.currentTime + 1.5) t += step(t);
    setTimeout(tick, intervalMs);
  };
  tick();
  return () => (alive = false);
}

const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const TRACKS = {
  lofi: {
    name: "Lo-fi chill",
    emoji: "🎹",
    play() {
      const out = echo();
      const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
      let i = 0;
      const stopCrackle = loopNoise("white", 0.012, 2500);
      const stop = scheduler((t) => {
        const ch = chords[i++ % chords.length];
        ch.forEach((m) => tone(N(m), t, 3.8, 0.05, "triangle", out));
        tone(N(ch[0] - 12), t, 3.8, 0.08, "sine", out);
        [0, 1, 2, 3].forEach((k) => Math.random() < 0.6 && tone(N(ch[(k + i) % 4] + 12), t + k * 0.95 + 0.2, 0.9, 0.03, "sine", out));
        return 3.8;
      }, 400);
      return () => (stop(), stopCrackle());
    },
  },
  piano: {
    name: "Piano calme",
    emoji: "🎼",
    play() {
      const out = echo();
      const scale = [60, 62, 64, 67, 69, 72, 74, 76];
      return scheduler((t) => {
        tone(N(scale[Math.floor(Math.random() * scale.length)]), t, 2.5, 0.07, "sine", out);
        if (Math.random() < 0.3) tone(N(48 + [0, 5, 7][Math.floor(Math.random() * 3)]), t, 4, 0.05, "sine", out);
        return 0.6 + Math.random() * 0.9;
      }, 300);
    },
  },
  rain: {
    name: "Pluie",
    emoji: "🌧️",
    play() {
      const a = loopNoise("pink", 0.35, 1800);
      const drops = scheduler((t) => {
        tone(1800 + Math.random() * 2500, t, 0.05, 0.015, "sine");
        return 0.03 + Math.random() * 0.12;
      }, 200);
      return () => (a(), drops());
    },
  },
  brown: { name: "Bruit brun", emoji: "🟤", play: () => loopNoise("brown", 0.6) },
  alpha: {
    name: "Ondes alpha (casque)",
    emoji: "🧘",
    play() {
      // Battement binaural de 10 Hz : 200 Hz à gauche, 210 Hz à droite.
      const merger = ctx.createChannelMerger(2);
      const g = ctx.createGain();
      g.gain.value = 0.12;
      const l = ctx.createOscillator();
      const r = ctx.createOscillator();
      l.frequency.value = 200;
      r.frequency.value = 210;
      l.connect(merger, 0, 0);
      r.connect(merger, 0, 1);
      merger.connect(g).connect(master);
      l.start();
      r.start();
      const bed = loopNoise("pink", 0.05, 800);
      return () => (l.stop(), r.stop(), bed());
    },
  },
};

export function playTrack(id) {
  ensureCtx();
  stopMusic();
  const stop = TRACKS[id].play();
  current = { id, stop };
}

export function stopMusic() {
  if (current) current.stop();
  current = null;
}

export const playingTrack = () => current?.id || null;

export function setVolume(v) {
  ensureCtx();
  master.gain.value = v;
}

export const getVolume = () => (master ? master.gain.value : 0.5);

// ---------- Synthèse vocale ----------
const bridge = () => window.AndroidBridge;
let onEnd = null;

window.onTtsDone = () => {
  const cb = onEnd;
  onEnd = null;
  cb && cb();
};

export function speak(text, rate = 1, done) {
  stopSpeaking();
  onEnd = done || null;
  if (bridge()?.speak) {
    bridge().speak(text, rate);
    return true;
  }
  if ("speechSynthesis" in window) {
    const chunks = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = "fr-FR";
      u.rate = rate;
      if (i === chunks.length - 1) u.onend = () => window.onTtsDone();
      speechSynthesis.speak(u);
    });
    return true;
  }
  return false;
}

export function stopSpeaking() {
  onEnd = null;
  if (bridge()?.stopSpeaking) bridge().stopSpeaking();
  else if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// ---------- Dictée vocale (reconnaissance Android) ----------
let dictationCb = null;
window.onDictation = (text) => {
  const cb = dictationCb;
  dictationCb = null;
  cb && cb(text);
};

export function dictate(cb) {
  dictationCb = cb;
  if (bridge()?.startDictation) return bridge().startDictation(), true;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;
  const r = new SR();
  r.lang = "fr-FR";
  r.onresult = (e) => window.onDictation(e.results[0][0].transcript);
  r.onerror = () => window.onDictation("");
  r.start();
  return true;
}
