import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import fg from "fast-glob";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
await stat(dist);

const budgets = { javascript: 130 * 1024, css: 80 * 1024 };
const totals = { javascript: 0, css: 0 };
for (const file of await fg("_astro/**/*.{js,css}", { cwd: dist, onlyFiles: true })) {
  const bytes = gzipSync(await readFile(path.join(dist, ...file.split("/")))).byteLength;
  if (file.endsWith(".js") && !file.includes("pagefind")) totals.javascript += bytes;
  if (file.endsWith(".css")) totals.css += bytes;
}
if (totals.javascript > budgets.javascript) {
  throw new Error(
    `documentation JavaScript ${totals.javascript} exceeds ${budgets.javascript} gzip bytes`,
  );
}
if (totals.css > budgets.css) {
  throw new Error(`documentation CSS ${totals.css} exceeds ${budgets.css} gzip bytes`);
}
console.log(
  `Bundle budgets passed: JavaScript ${totals.javascript} B gzip; CSS ${totals.css} B gzip.`,
);
