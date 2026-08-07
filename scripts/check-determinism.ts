import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import { assemble } from "../packages/source-assembler/src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesRoot = process.env.SPICE_SOURCES_ROOT
  ? path.resolve(process.env.SPICE_SOURCES_ROOT)
  : path.join(root, ".generated", "sources");
const firstRoot = path.join(root, ".generated", "determinism-a");
const secondRoot = path.join(root, ".generated", "determinism-b");
const first = await assemble({ root, sourcesRoot, generatedRoot: firstRoot });
const second = await assemble({ root, sourcesRoot, generatedRoot: secondRoot });
const [firstHash, secondHash] = await Promise.all([
  hashTree(first.outputRoot),
  hashTree(second.outputRoot),
]);
if (firstHash !== secondHash) {
  throw new Error(`assembly is not deterministic: ${firstHash} != ${secondHash}`);
}
console.log(`Deterministic assembly SHA-256 ${firstHash}.`);

async function hashTree(directory: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of (await fg("**/*", { cwd: directory, onlyFiles: true })).sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(path.join(directory, ...file.split("/"))));
    hash.update("\0");
  }
  return hash.digest("hex");
}
