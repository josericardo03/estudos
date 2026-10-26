import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

copyFileSync(
  join(raiz, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  join(raiz, "public/pdf.worker.min.mjs"),
);
