// Copie les fichiers de l'OCR hors-ligne (Tesseract) dans www/vendor/ocr.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const out = "../../www/vendor/ocr";
mkdirSync(`${out}/lang`, { recursive: true });
const files = {
  "tesseract.js/dist/tesseract.min.js": "tesseract.min.js",
  "tesseract.js/dist/worker.min.js": "worker.min.js",
  "tesseract.js-core/tesseract-core-lstm.wasm.js": "tesseract-core-lstm.wasm.js",
  "tesseract.js-core/tesseract-core-simd-lstm.wasm.js": "tesseract-core-simd-lstm.wasm.js",
};
for (const [src, dst] of Object.entries(files)) copyFileSync(`node_modules/${src}`, `${out}/${dst}`);
// Données de langue décompressées : aapt décompresse lui-même les .gz et en change le nom.
for (const lang of ["fra", "eng"]) {
  const gz = readFileSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`);
  writeFileSync(`${out}/lang/${lang}.traineddata`, gunzipSync(gz));
}
console.log("OCR copié dans", out);
