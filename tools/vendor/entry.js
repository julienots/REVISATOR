// Point d'entrée des dépendances externes, empaqueté par esbuild dans www/vendor/vendor.js (npm run build)
import Anthropic from "@anthropic-ai/sdk";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// pdf.js tourne sans Web Worker séparé (« fake worker ») : plus simple dans une WebView.
globalThis.pdfjsWorker = pdfjsWorker;
globalThis.Anthropic = Anthropic;
globalThis.pdfjsLib = pdfjsLib;
