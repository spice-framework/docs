import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const canonicalRepository = /^spice-framework\/([a-z0-9.-]+)$/;
const fullCommit = /^[0-9a-f]{40}$/;

export function renderMaterializerLock(lock) {
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    throw new Error("ecosystem lock must be an object");
  }
  if (lock.schema !== 1) throw new Error("ecosystem lock schema must be 1");
  if (typeof lock.snapshot !== "string" || lock.snapshot.length === 0) {
    throw new Error("ecosystem lock snapshot must be explicit");
  }
  if (!lock.catalog || typeof lock.catalog !== "object") {
    throw new Error("ecosystem lock catalog must be explicit");
  }
  if (lock.catalog.repository !== "spice-framework/development") {
    throw new Error("ecosystem lock catalog must be spice-framework/development");
  }
  if (!fullCommit.test(lock.catalog.commit ?? "")) {
    throw new Error("ecosystem lock catalog commit must be a full lowercase commit");
  }
  if (!Array.isArray(lock.sources) || lock.sources.length === 0) {
    throw new Error("ecosystem lock must contain sources");
  }

  const seen = new Set();
  const sources = lock.sources.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("ecosystem lock source must be an object");
    }
    const match = canonicalRepository.exec(source.repository ?? "");
    if (!match) throw new Error(`invalid canonical repository ${source.repository ?? "<missing>"}`);
    const repository = match[1];
    if (seen.has(repository)) throw new Error(`duplicate ecosystem repository ${repository}`);
    seen.add(repository);
    if (!fullCommit.test(source.commit ?? "")) {
      throw new Error(`${source.repository} commit must be a full lowercase commit`);
    }
    return { repository, commit: source.commit };
  });
  sources.sort((left, right) => left.repository.localeCompare(right.repository));

  const development = sources.find((source) => source.repository === "development");
  if (!development) throw new Error("ecosystem lock must include development as a source");
  if (development.commit !== lock.catalog.commit) {
    throw new Error("ecosystem catalog and development source commits must match");
  }

  return { schema: 1, snapshot: lock.snapshot, sources };
}

async function main() {
  const [, , input, output] = process.argv;
  if (!input || !output || process.argv.length !== 4) {
    throw new Error("usage: node scripts/render-materializer-lock.mjs input.json output.json");
  }
  const result = renderMaterializerLock(JSON.parse(await readFile(input, "utf8")));
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporary, output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
