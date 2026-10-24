// Reconnaissance de texte hors-ligne (Tesseract) pour les photos de cours
// et les PDF scannés. Tout est embarqué dans l'app : aucune connexion requise.

const BASE = new URL("../vendor/ocr/", import.meta.url).href;
let workerPromise = null;
let progressCb = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("Moteur de lecture introuvable"));
    document.head.appendChild(s);
  });
}

async function getWorker(onProgress) {
  workerPromise ||= (async () => {
    await loadScript(BASE + "tesseract.min.js");
    return window.Tesseract.createWorker(["fra", "eng"], 1, {
      workerPath: BASE + "worker.min.js",
      corePath: BASE,
      langPath: BASE + "lang",
      cacheMethod: "none",
      gzip: false,
      logger: (m) => progressCb && m.status === "recognizing text" && progressCb(m.progress),
    });
  })().catch((e) => {
    workerPromise = null;
    throw e;
  });
  progressCb = onProgress;
  return workerPromise;
}

// Agrandit les petites images et passe en niveaux de gris contrastés : meilleure lecture.
async function prepare(source) {
  const img = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
  const scale = Math.min(2.5, Math.max(1, 1800 / Math.max(img.width, img.height)));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d");
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export async function recognize(source, onProgress) {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(await prepare(source));
  return cleanOcr(data.text);
}

// Corrige les défauts typiques de l'OCR : césures en fin de ligne, espaces en trop.
function cleanOcr(t) {
  return t
    .replace(/-\n(?=\p{Ll})/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l === "" || /[\p{L}\p{N}]/u.test(l))
    .join("\n")
    .trim();
}

// Rend chaque page d'un PDF scanné en image puis la lit.
export async function recognizePdf(pdfjsLib, buf, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement("canvas");
    c.width = vp.width;
    c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    pages.push(await recognize(c, (p) => onProgress && onProgress((i - 1 + p) / pdf.numPages)));
  }
  return pages.join("\n\n");
}
